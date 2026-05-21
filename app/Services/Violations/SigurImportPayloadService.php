<?php

namespace App\Services\Violations;

use App\Models\ViolationEmployee;
use App\Models\ViolationEmployeeFaceReference;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SigurImportPayloadService
{
    public function __construct(
        private readonly FaceReferenceManifestService $manifestService,
    ) {
    }

    /**
     * @return array{manifest: array{path: string, count: int, missing: int}, peopleCount: int, referenceCount: int}
     */
    public function import(array $payload, string $syncOrigin, string $importOrigin = 'sigur_import'): array
    {
        $references = collect((array) ($payload['references'] ?? []))
            ->filter(fn ($item) => is_array($item))
            ->values();
        $people = collect((array) ($payload['people'] ?? []))
            ->filter(fn ($item) => is_array($item))
            ->values();

        $now = now();
        $graceDays = max(0, (int) config('services.faceid.sigur_removal_grace_days', 7));

        DB::transaction(function () use ($references, $people, $now, $syncOrigin, $graceDays, $importOrigin) {
            $knownPeopleByBusinessKey = [];
            $availableBusinessKeys = [];
            $seenReferenceIds = [];
            $expiredEmployeeIds = [];

            foreach ($people as $entry) {
                $businessKey = trim((string) ($entry['businessKey'] ?? ''));
                if ($businessKey === '') {
                    continue;
                }

                $knownPeopleByBusinessKey[$businessKey] = true;
                $status = $this->normalizedStatus(data_get($entry, 'profile.status'));

                $employee = ViolationEmployee::query()->firstOrNew([
                    'business_key' => $businessKey,
                ]);

                $this->hydrateSigurEmployeeFromPayload($employee, $entry, $now, $syncOrigin, $importOrigin);

                if ($status === 'AVAILABLE') {
                    $availableBusinessKeys[$businessKey] = true;
                    $this->clearSigurRemovalGrace($employee);
                    $employee->is_active = true;
                } else {
                    $graceActive = $this->applySigurRemovalGrace(
                        $employee,
                        $now,
                        $graceDays,
                        'status:' . ($status ?: 'UNKNOWN')
                    );

                    if (! $graceActive) {
                        $expiredEmployeeIds[$businessKey] = true;
                    }
                }

                $employee->save();
            }

            foreach ($references as $entry) {
                $businessKey = trim((string) ($entry['businessKey'] ?? ''));
                if ($businessKey === '') {
                    continue;
                }

                $relativePath = trim((string) ($entry['relativePath'] ?? ''));
                if ($relativePath === '') {
                    continue;
                }

                $availableBusinessKeys[$businessKey] = true;

                $employee = ViolationEmployee::query()->firstOrNew([
                    'business_key' => $businessKey,
                ]);

                $this->hydrateSigurEmployeeFromPayload($employee, $entry, $now, $syncOrigin, $importOrigin);
                $this->clearSigurRemovalGrace($employee);
                $employee->is_active = true;
                $employee->save();

                $sha1 = $this->nullableString($entry['imageHash'] ?? null);
                $sourceImageId = $this->nullableString($entry['imageId'] ?? null);
                $matchAttributes = [
                    'employee_id' => $employee->id,
                ];

                if ($sha1 !== null) {
                    $matchAttributes['sha1'] = $sha1;
                } elseif ($sourceImageId !== null) {
                    $matchAttributes['source_image_id'] = $sourceImageId;
                } else {
                    $matchAttributes['path'] = $relativePath;
                }

                $reference = ViolationEmployeeFaceReference::query()->firstOrNew($matchAttributes);

                $reference->source_system = 'sigur';
                $reference->source = $this->nullableString($entry['source'] ?? null) ?: 'sigur';
                $reference->external_ref = $employee->external_ref;
                $reference->source_image_id = $sourceImageId;
                $reference->group_key = $this->nullableString($entry['groupKey'] ?? null) ?: $employee->business_key;
                $reference->disk = 'faceid_references';
                $reference->path = $relativePath;
                $reference->file_name = basename($reference->path);
                $reference->mime_type = $this->nullableString($entry['mimeType'] ?? null);
                $reference->file_size = is_numeric($entry['fileSize'] ?? null) ? (int) $entry['fileSize'] : null;
                $reference->is_primary = ! ViolationEmployeeFaceReference::query()
                    ->where('employee_id', $employee->id)
                    ->where('is_active', true)
                    ->where('id', '!=', $reference->id ?: 0)
                    ->exists();
                $reference->is_active = true;
                $reference->imported_at ??= $now;
                $reference->last_synced_at = $now;
                $reference->meta = array_filter([
                    'source_label' => $this->nullableString(data_get($entry, 'profile.sourceLabel')),
                    'import_origin' => $importOrigin,
                ], fn ($value) => $value !== null && $value !== '');
                $reference->save();

                $seenReferenceIds[] = $reference->id;
            }

            if ($knownPeopleByBusinessKey !== []) {
                ViolationEmployee::query()
                    ->where('source_system', 'sigur')
                    ->whereNotIn('business_key', array_keys($knownPeopleByBusinessKey))
                    ->get()
                    ->each(function (ViolationEmployee $employee) use ($now, $graceDays, &$expiredEmployeeIds) {
                        $graceActive = $this->applySigurRemovalGrace($employee, $now, $graceDays, 'missing_from_source');
                        $employee->save();

                        if (! $graceActive) {
                            $expiredEmployeeIds[$employee->business_key] = true;
                        }
                    });
            }

            if ($availableBusinessKeys !== []) {
                $availableEmployeeIds = ViolationEmployee::query()
                    ->where('source_system', 'sigur')
                    ->whereIn('business_key', array_keys($availableBusinessKeys))
                    ->pluck('id')
                    ->all();

                if ($availableEmployeeIds !== []) {
                    $staleActiveReferences = ViolationEmployeeFaceReference::query()
                        ->where('source_system', 'sigur')
                        ->whereIn('employee_id', $availableEmployeeIds)
                        ->when($seenReferenceIds !== [], fn ($query) => $query->whereNotIn('id', $seenReferenceIds))
                        ->get();

                    foreach ($staleActiveReferences as $reference) {
                        $reference->forceFill([
                            'is_active' => false,
                            'last_synced_at' => $now,
                            'is_primary' => false,
                        ])->save();
                    }
                }
            }

            if ($expiredEmployeeIds !== []) {
                ViolationEmployeeFaceReference::query()
                    ->where('source_system', 'sigur')
                    ->whereIn(
                        'employee_id',
                        ViolationEmployee::query()
                            ->where('source_system', 'sigur')
                            ->whereIn('business_key', array_keys($expiredEmployeeIds))
                            ->pluck('id')
                    )
                    ->get()
                    ->each(function (ViolationEmployeeFaceReference $reference) use ($now) {
                        $reference->forceFill([
                            'is_active' => false,
                            'is_primary' => false,
                            'last_synced_at' => $now,
                        ])->save();
                    });
            }

            ViolationEmployee::query()
                ->where('source_system', 'sigur')
                ->get()
                ->each(function (ViolationEmployee $employee) use ($now) {
                    $activeCount = $employee->faceReferences()->where('is_active', true)->count();
                    $primaryReference = $employee->faceReferences()->where('is_active', true)->orderByDesc('is_primary')->orderBy('id')->first();

                    if ($primaryReference) {
                        $employee->faceReferences()
                            ->where('id', '!=', $primaryReference->id)
                            ->where('is_active', true)
                            ->update(['is_primary' => false]);
                        if (! $primaryReference->is_primary) {
                            $primaryReference->forceFill(['is_primary' => true])->save();
                        }
                    }

                    $employee->forceFill([
                        'face_reference_count' => $activeCount,
                        'face_reference_state' => $this->determineSigurFaceReferenceState($employee, $activeCount),
                        'last_face_sync_at' => $now,
                    ])->save();
                });
        });

        return [
            'manifest' => $this->manifestService->exportActiveManifest(),
            'peopleCount' => $people->count(),
            'referenceCount' => $references->count(),
        ];
    }

    private function nullableString(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $string = trim((string) $value);

        return $string === '' ? null : $string;
    }

    private function normalizedStatus(mixed $value): ?string
    {
        $status = $this->nullableString($value);

        return $status ? Str::upper($status) : null;
    }

    private function hydrateSigurEmployeeFromPayload(
        ViolationEmployee $employee,
        array $entry,
        Carbon $now,
        string $syncOrigin,
        string $importOrigin,
    ): void {
        $fullName = trim((string) ($entry['name'] ?? ''));
        $employee->source_system = 'sigur';
        $employee->external_ref = $this->nullableString($entry['externalRef'] ?? $entry['employeeId'] ?? null);
        $employee->iin = $this->nullableString(data_get($entry, 'profile.iin'));
        $employee->full_name = $fullName !== '' ? $fullName : ($employee->full_name ?: 'Неизвестный сотрудник');
        $employee->normalized_full_name = Str::lower($employee->full_name);
        $employee->department = $this->nullableString(data_get($entry, 'profile.department'));
        $employee->position = $this->nullableString(data_get($entry, 'profile.role'));
        $employee->employment_status = $this->normalizedStatus(data_get($entry, 'profile.status'));
        $employee->last_face_sync_at = $now;
        $employee->imported_at ??= $now;

        $meta = is_array($employee->meta) ? $employee->meta : [];

        $groupKey = $this->nullableString($entry['groupKey'] ?? data_get($entry, 'profile.groupKey'));
        if ($groupKey !== null) {
            $meta['sigur_group_key'] = $groupKey;
        }

        $sourceLabel = $this->nullableString(data_get($entry, 'profile.sourceLabel'));
        if ($sourceLabel !== null) {
            $meta['sigur_source_label'] = $sourceLabel;
        }

        $employeeType = $this->nullableString(data_get($entry, 'profile.employeeType'));
        if ($employeeType !== null) {
            $meta['sigur_employee_type'] = $employeeType;
        }

        $personType = $this->nullableString(data_get($entry, 'profile.personType'));
        if ($personType !== null) {
            $meta['sigur_person_type'] = $personType;
        }

        $meta['sigur_last_seen_at'] = $now->toIso8601String();
        $meta['sigur_last_sync_origin'] = $syncOrigin;
        $meta['sigur_last_import_origin'] = $importOrigin;

        if ($importOrigin === 'sigur_dump') {
            $meta['sigur_last_dump_path'] = $syncOrigin;
        }

        $employee->meta = $meta;
    }

    private function clearSigurRemovalGrace(ViolationEmployee $employee): void
    {
        $meta = is_array($employee->meta) ? $employee->meta : [];

        unset(
            $meta['sigur_pending_removal_started_at'],
            $meta['sigur_grace_expires_at'],
            $meta['sigur_pending_removal_reason'],
            $meta['sigur_removed_at']
        );

        $employee->meta = $meta;
    }

    private function applySigurRemovalGrace(ViolationEmployee $employee, Carbon $now, int $graceDays, string $reason): bool
    {
        $meta = is_array($employee->meta) ? $employee->meta : [];
        $pendingStartedAt = $this->metaDate($meta['sigur_pending_removal_started_at'] ?? null);

        if ($pendingStartedAt === null) {
            $pendingStartedAt = $now->copy();
        }

        $graceExpiresAt = $pendingStartedAt->copy()->addDays($graceDays);
        $meta['sigur_pending_removal_started_at'] = $pendingStartedAt->toIso8601String();
        $meta['sigur_grace_expires_at'] = $graceExpiresAt->toIso8601String();
        $meta['sigur_pending_removal_reason'] = $reason;

        if ($graceExpiresAt->lessThanOrEqualTo($now)) {
            $employee->is_active = false;
            $meta['sigur_removed_at'] = $now->toIso8601String();
            $employee->meta = $meta;

            return false;
        }

        unset($meta['sigur_removed_at']);
        $employee->is_active = true;
        $employee->meta = $meta;

        return true;
    }

    private function determineSigurFaceReferenceState(ViolationEmployee $employee, int $activeCount): string
    {
        $meta = is_array($employee->meta) ? $employee->meta : [];
        $graceExpiresAt = $this->nullableString($meta['sigur_grace_expires_at'] ?? null);

        if (! $employee->is_active) {
            return 'inactive';
        }

        if ($graceExpiresAt !== null) {
            return 'grace_period';
        }

        return $activeCount > 0 ? 'ready' : 'missing';
    }

    private function metaDate(mixed $value): ?Carbon
    {
        $string = $this->nullableString($value);
        if ($string === null) {
            return null;
        }

        try {
            return Carbon::parse($string);
        } catch (\Throwable) {
            return null;
        }
    }
}