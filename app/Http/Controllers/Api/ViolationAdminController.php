<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ViolationCategory;
use App\Models\ViolationEmployee;
use App\Models\ViolationIncident;
use App\Models\ViolationStatusHistory;
use App\Models\ViolationType;
use App\Services\Violations\TemporaryPassService;
use App\Services\Violations\ViolationIncidentService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ViolationAdminController extends Controller
{
    public function __construct(
        private TemporaryPassService $temporaryPasses,
    ) {
    }

    public function incidents(Request $request): JsonResponse
    {
        $request->validate([
            'status' => ['nullable', 'string', Rule::in(ViolationIncident::WORKFLOW_STATUSES)],
            'recognition_status' => ['nullable', 'string', Rule::in(ViolationIncident::RECOGNITION_STATUSES)],
            'occurred_from' => ['nullable', 'date'],
            'occurred_to' => ['nullable', 'date'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:500'],
            'search' => ['nullable', 'string', 'max:255'],
        ]);

        $query = ViolationIncident::query()
            ->with([
                'reporter:id,name',
                'reviewer:id,name',
                'evidences:id,incident_id,media_role,media_kind,path,is_primary,sort_order',
                'employee:id,full_name',
                'employee.primaryFaceReference:id,employee_id,path,is_primary',
            ])
            ->orderByDesc('occurred_at')
            ->orderByDesc('id');

        if ($request->filled('status')) {
            $query->where('workflow_status', (string) $request->query('status'));
        }

        if ($request->filled('recognition_status')) {
            $query->where('recognition_status', (string) $request->query('recognition_status'));
        }

        if ($request->filled('occurred_from')) {
            $query->where('occurred_at', '>=', $request->date('occurred_from')?->startOfDay());
        }

        if ($request->filled('occurred_to')) {
            $query->where('occurred_at', '<=', $request->date('occurred_to')?->endOfDay());
        }

        if ($request->filled('search')) {
            $search = '%' . trim((string) $request->query('search')) . '%';
            $query->where(function ($builder) use ($search) {
                $builder->where('employee_full_name', 'like', $search)
                    ->orWhere('employee_department', 'like', $search)
                    ->orWhere('employee_position', 'like', $search)
                    ->orWhere('type_name', 'like', $search)
                    ->orWhere('category_name', 'like', $search)
                    ->orWhere('reported_by_name', 'like', $search)
                    ->orWhereHas('reporter', fn (Builder $reporter) => $reporter->where('name', 'like', $search));
            });
        }

        $items = $query
            ->limit((int) $request->query('limit', 100))
            ->get()
            ->map(fn (ViolationIncident $incident) => $this->formatIncident($incident))
            ->values();

        return response()->json(['data' => $items]);
    }

    public function updateIncident(
        Request $request,
        ViolationIncident $incident,
        ViolationIncidentService $incidentService,
    ): JsonResponse {
        $validated = $request->validate([
            'occurred_at' => ['sometimes', 'date'],
            'location_label' => ['sometimes', 'nullable', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'category_id' => ['sometimes', 'integer', 'exists:violation_categories,id'],
            'type_id' => ['sometimes', 'integer', 'exists:violation_types,id'],
            'employee_full_name' => ['sometimes', 'nullable', 'string', 'max:160'],
            'employee_department' => ['sometimes', 'nullable', 'string', 'max:160'],
            'employee_position' => ['sometimes', 'nullable', 'string', 'max:160'],
            'review_note' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'rejection_reason' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'sanction_state' => ['sometimes', 'nullable', 'string', 'max:40'],
            'workflow_status' => ['sometimes', 'string', Rule::in(ViolationIncident::WORKFLOW_STATUSES)],
        ]);

        $user = $request->user();
        if (! $user) {
            abort(401);
        }

        $typeRequested = array_key_exists('type_id', $validated);
        $categoryRequested = array_key_exists('category_id', $validated);
        $categoryId = $categoryRequested ? (int) $validated['category_id'] : ($typeRequested ? null : $incident->category_id);
        $typeId = $typeRequested ? (int) $validated['type_id'] : $incident->type_id;

        [$category, $type] = $this->resolveCatalogSelection($categoryId, $typeId);

        $updatedIncident = DB::transaction(function () use ($incident, $incidentService, $validated, $user, $category, $type) {
            $originalStatus = $incident->workflow_status;
            $payload = [];

            if (array_key_exists('occurred_at', $validated)) {
                $payload['occurred_at'] = Carbon::parse((string) $validated['occurred_at']);
            }

            foreach ([
                'location_label',
                'description',
                'review_note',
                'rejection_reason',
                'sanction_state',
            ] as $field) {
                if (array_key_exists($field, $validated)) {
                    $payload[$field] = $this->nullableTrim($validated[$field] ?? null);
                }
            }

            if (array_key_exists('category_id', $validated) || array_key_exists('type_id', $validated)) {
                $payload['category_id'] = $category?->id;
                $payload['category_key'] = $category?->key;
                $payload['category_name'] = $category?->name;
                $payload['type_id'] = $type?->id;
                $payload['type_key'] = $type?->key;
                $payload['type_name'] = $type?->name;
            }

            if ($this->employeeSnapshotRequested($validated)) {
                $employeePayload = [
                    'employee_full_name' => $validated['employee_full_name'] ?? $incident->employee_full_name,
                    'employee_department' => $validated['employee_department'] ?? $incident->employee_department,
                    'employee_position' => $validated['employee_position'] ?? $incident->employee_position,
                ];

                $employee = null;
                if ($this->nullableTrim($employeePayload['employee_full_name'] ?? null)) {
                    $employee = $incidentService->syncAdminReviewedEmployee($incident, $employeePayload);
                }

                $payload['employee_id'] = $employee?->id ?? $incident->employee_id;
                $payload['employee_business_key'] = $employee?->business_key ?? $incident->employee_business_key;
                $payload['employee_iin'] = $employee?->iin ?? $incident->employee_iin;
                $payload['employee_full_name'] = $employee?->full_name ?? $this->nullableTrim($employeePayload['employee_full_name'] ?? null);
                $payload['employee_normalized_full_name'] = $employee?->normalized_full_name
                    ?? $this->normalizedEmployeeFullName($employeePayload['employee_full_name'] ?? null);
                $payload['employee_department'] = $employee?->department ?? $this->nullableTrim($employeePayload['employee_department'] ?? null);
                $payload['employee_position'] = $employee?->position ?? $this->nullableTrim($employeePayload['employee_position'] ?? null);
                $payload['employee_status'] = $employee?->employment_status ?? $incident->employee_status;
                $payload['is_manual_identity'] = true;
                $payload['identity_source'] = $incident->employee_id ? 'admin_corrected' : 'manual_admin';

                if ($incident->recognition_status !== ViolationIncident::RECOGNITION_MATCHED) {
                    $payload['recognition_status'] = ViolationIncident::RECOGNITION_MANUAL;
                }
            }

            $statusNote = null;
            if (array_key_exists('workflow_status', $validated) && $validated['workflow_status'] !== $incident->workflow_status) {
                $payload['workflow_status'] = $validated['workflow_status'];
                $payload['closed_at'] = $validated['workflow_status'] === ViolationIncident::STATUS_CLOSED
                    ? ($incident->closed_at ?? now())
                    : $incident->closed_at;
                $statusNote = $this->nullableTrim($validated['review_note'] ?? $validated['rejection_reason'] ?? null);
            }

            $payload['reviewed_by_user_id'] = $user->id;
            $payload['reviewed_at'] = now();

            $incident->forceFill($payload)->save();

            if ($statusNote !== null || ($payload['workflow_status'] ?? null) !== null) {
                $this->recordStatusHistory(
                    $incident,
                    $originalStatus,
                    $incident->workflow_status,
                    $user->id,
                    'admin',
                    $statusNote,
                    ['action' => 'incident_update']
                );
            }

            return $incident->fresh($this->incidentRelations());
        });

        return response()->json(['data' => $this->formatIncident($updatedIncident)]);
    }

    public function updateIncidentStatus(Request $request, ViolationIncident $incident): JsonResponse
    {
        $validated = $request->validate([
            'workflow_status' => ['required', 'string', Rule::in(ViolationIncident::WORKFLOW_STATUSES)],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        $user = $request->user();
        if (! $user) {
            abort(401);
        }

        $updatedIncident = DB::transaction(function () use ($incident, $validated, $user) {
            $fromStatus = $incident->workflow_status;
            $toStatus = (string) $validated['workflow_status'];

            $incident->forceFill([
                'workflow_status' => $toStatus,
                'closed_at' => $toStatus === ViolationIncident::STATUS_CLOSED
                    ? ($incident->closed_at ?? now())
                    : $incident->closed_at,
                'reviewed_by_user_id' => $user->id,
                'reviewed_at' => now(),
            ])->save();

            $this->recordStatusHistory(
                $incident,
                $fromStatus,
                $toStatus,
                $user->id,
                'admin',
                $this->nullableTrim($validated['note'] ?? null),
                ['action' => 'status_update']
            );

            return $incident->fresh($this->incidentRelations());
        });

        return response()->json(['data' => $this->formatIncident($updatedIncident)]);
    }

    public function resolveIdentity(Request $request, ViolationIncident $incident, ViolationIncidentService $incidentService): JsonResponse
    {
        $validated = $request->validate([
            'employee_full_name' => ['required', 'string', 'max:160'],
            'employee_department' => ['nullable', 'string', 'max:160'],
            'employee_position' => ['nullable', 'string', 'max:160'],
            'review_note' => ['nullable', 'string', 'max:2000'],
        ]);

        $user = $request->user();
        if (! $user) {
            abort(401);
        }

        $resolved = $incidentService->resolveUnknownIncidentIdentity($incident, $user, $validated);

        return response()->json(['data' => $this->formatIncident($resolved)]);
    }

    public function catalog(): JsonResponse
    {
        return response()->json(['data' => $this->catalogPayload(false)]);
    }

    public function temporaryWorkers(Request $request): JsonResponse
    {
        $query = ViolationEmployee::query()
            ->with([
                'primaryFaceReference:id,employee_id,path,is_primary',
                'temporaryPassCreator:id,name',
            ])
            ->where('person_kind', TemporaryPassService::PERSON_KIND_TEMPORARY_CONTRACTOR)
            ->orderBy('temporary_pass_expires_at')
            ->orderBy('full_name');

        if ($request->filled('search')) {
            $search = '%' . trim((string) $request->query('search')) . '%';
            $query->where(function ($builder) use ($search) {
                $builder->where('full_name', 'like', $search)
                    ->orWhere('department', 'like', $search)
                    ->orWhere('position', 'like', $search);
            });
        }

        $status = trim((string) $request->query('status', ''));
        $now = now();
        $expiresSoonUntil = $now->copy()->addDays(TemporaryPassService::EXPIRES_SOON_DAYS);

        if ($status === TemporaryPassService::PASS_STATUS_ACTIVE) {
            $query->whereNotNull('temporary_pass_expires_at')
                ->where('temporary_pass_expires_at', '>', $now);
        } elseif ($status === TemporaryPassService::PASS_STATUS_EXPIRED) {
            $query->whereNotNull('temporary_pass_expires_at')
                ->where('temporary_pass_expires_at', '<=', $now);
        } elseif ($status === 'expires_soon') {
            $query->whereNotNull('temporary_pass_expires_at')
                ->where('temporary_pass_expires_at', '>', $now)
                ->where('temporary_pass_expires_at', '<=', $expiresSoonUntil);
        }

        $items = $query
            ->limit((int) $request->query('limit', 100))
            ->get()
            ->map(fn (ViolationEmployee $employee) => $this->formatTemporaryWorker($employee))
            ->values();

        return response()->json(['data' => $items]);
    }

    public function upsertCategory(Request $request, ?ViolationCategory $category = null): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'key' => [
                'nullable',
                'string',
                'max:80',
                Rule::unique('violation_categories', 'key')->ignore($category?->id),
            ],
            'description' => ['nullable', 'string', 'max:2000'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $payload = [
            'name' => trim((string) $validated['name']),
            'key' => $this->normalizedKey($validated['key'] ?? null, (string) $validated['name']),
            'description' => $this->nullableTrim($validated['description'] ?? null),
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
            'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : true,
        ];

        $record = $category
            ? tap($category)->update($payload)
            : ViolationCategory::query()->create($payload);

        return response()->json(['data' => $record->fresh()]);
    }

    public function upsertType(Request $request, ?ViolationType $type = null): JsonResponse
    {
        $validated = $request->validate([
            'category_id' => ['required', 'integer', 'exists:violation_categories,id'],
            'name' => ['required', 'string', 'max:160'],
            'key' => [
                'nullable',
                'string',
                'max:80',
                Rule::unique('violation_types', 'key')->ignore($type?->id),
            ],
            'description' => ['nullable', 'string', 'max:2000'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $payload = [
            'category_id' => (int) $validated['category_id'],
            'name' => trim((string) $validated['name']),
            'key' => $this->normalizedKey($validated['key'] ?? null, (string) $validated['name']),
            'description' => $this->nullableTrim($validated['description'] ?? null),
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
            'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : true,
        ];

        $record = $type
            ? tap($type)->update($payload)
            : ViolationType::query()->create($payload);

        return response()->json(['data' => $record->fresh('category')]);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function catalogPayload(bool $onlyActive): array
    {
        return ViolationCategory::query()
            ->with(['types' => function ($query) use ($onlyActive) {
                if ($onlyActive) {
                    $query->where('is_active', true);
                }
            }])
            ->when($onlyActive, fn ($query) => $query->where('is_active', true))
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get()
            ->map(function (ViolationCategory $category) {
                return [
                    'id' => $category->id,
                    'key' => $category->key,
                    'name' => $category->name,
                    'description' => $category->description,
                    'sort_order' => $category->sort_order,
                    'is_active' => (bool) $category->is_active,
                    'types' => $category->types->map(fn (ViolationType $type) => [
                        'id' => $type->id,
                        'category_id' => $type->category_id,
                        'key' => $type->key,
                        'name' => $type->name,
                        'description' => $type->description,
                        'sort_order' => $type->sort_order,
                        'is_active' => (bool) $type->is_active,
                    ])->values(),
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function formatIncident(ViolationIncident $incident): array
    {
        $originalEvidences = $incident->evidences
            ->filter(fn ($evidence) => $evidence->media_role === 'original')
            ->values();
        $recognitionProbe = $incident->evidences->firstWhere('media_role', 'recognition_probe');
        $employeeReference = $incident->employee?->primaryFaceReference;

        return [
            'id' => $incident->id,
            'incident_uid' => $incident->incident_uid,
            'workflow_status' => $incident->workflow_status,
            'recognition_status' => $incident->recognition_status,
            'occurred_at' => $incident->occurred_at?->toIso8601String(),
            'reported_at' => $incident->reported_at?->toIso8601String(),
            'reviewed_at' => $incident->reviewed_at?->toIso8601String(),
            'closed_at' => $incident->closed_at?->toIso8601String(),
            'reported_by_name' => $incident->reported_by_name,
            'reported_by_user' => $incident->reporter?->name,
            'category_id' => $incident->category_id,
            'category_name' => $incident->category_name,
            'category_key' => $incident->category_key,
            'type_id' => $incident->type_id,
            'type_name' => $incident->type_name,
            'type_key' => $incident->type_key,
            'employee_id' => $incident->employee_id,
            'employee_full_name' => $incident->employee_full_name,
            'employee_department' => $incident->employee_department,
            'employee_position' => $incident->employee_position,
            'description' => $incident->description,
            'location_label' => $incident->location_label,
            'evidence_total_count' => $incident->evidence_total_count,
            'evidence_photo_count' => $incident->evidence_photo_count,
            'evidence_video_count' => $incident->evidence_video_count,
            'recognition_similarity' => $incident->recognition_similarity,
            'review_note' => $incident->review_note,
            'rejection_reason' => $incident->rejection_reason,
            'sanction_state' => $incident->sanction_state,
            'identity_requires_manual_review' => $incident->workflow_status === ViolationIncident::STATUS_UNKNOWN_MANUAL,
            'employee_reference' => $employeeReference ? [
                'id' => $employeeReference->id,
                'media_kind' => 'photo',
                'url' => $this->referenceImageUrl($employeeReference->path),
                'is_primary' => (bool) $employeeReference->is_primary,
            ] : null,
            'recognition_probe' => $recognitionProbe ? [
                'id' => $recognitionProbe->id,
                'media_kind' => $recognitionProbe->media_kind,
                'url' => $this->storageUrl($recognitionProbe->path),
                'is_primary' => false,
            ] : null,
            'evidences' => $originalEvidences->map(fn ($evidence) => [
                'id' => $evidence->id,
                'media_kind' => $evidence->media_kind,
                'url' => $this->storageUrl($evidence->path),
                'is_primary' => (bool) $evidence->is_primary,
            ])->values(),
        ];
    }

    private function storageUrl(?string $path): ?string
    {
        if (! is_string($path) || trim($path) === '') {
            return null;
        }

        $normalized = str_replace('\\', '/', ltrim($path, '/'));

        return '/storage/' . $normalized;
    }

    private function referenceImageUrl(?string $path): ?string
    {
        if (! is_string($path) || trim($path) === '') {
            return null;
        }

        $normalized = str_replace('\\', '/', ltrim($path, '/'));

        return '/reference-images/' . $normalized;
    }

    /**
     * @return array<int, string>
     */
    private function incidentRelations(): array
    {
        return [
            'reporter:id,name',
            'reviewer:id,name',
            'evidences:id,incident_id,media_role,media_kind,path,is_primary,sort_order',
            'employee:id,full_name',
            'employee.primaryFaceReference:id,employee_id,path,is_primary',
        ];
    }

    /**
     * @return array{0: ?ViolationCategory, 1: ?ViolationType}
     */
    private function resolveCatalogSelection(?int $categoryId, ?int $typeId): array
    {
        $category = $categoryId ? ViolationCategory::query()->find($categoryId) : null;
        $type = $typeId ? ViolationType::query()->find($typeId) : null;

        if ($type && $category && $type->category_id !== $category->id) {
            throw ValidationException::withMessages([
                'type_id' => 'Выбранный тип не принадлежит указанной категории.',
            ]);
        }

        if ($type && ! $category) {
            $category = $type->category;
        }

        return [$category, $type];
    }

    private function employeeSnapshotRequested(array $validated): bool
    {
        return array_key_exists('employee_full_name', $validated)
            || array_key_exists('employee_department', $validated)
            || array_key_exists('employee_position', $validated);
    }

    private function normalizedEmployeeFullName(mixed $value): ?string
    {
        $name = $this->nullableTrim($value);

        return $name ? Str::lower($name) : null;
    }

    private function recordStatusHistory(
        ViolationIncident $incident,
        ?string $fromStatus,
        ?string $toStatus,
        ?int $changedByUserId,
        string $source,
        ?string $note = null,
        array $meta = [],
    ): void {
        if ($fromStatus === $toStatus) {
            return;
        }

        ViolationStatusHistory::query()->create([
            'incident_id' => $incident->id,
            'from_status' => $fromStatus,
            'to_status' => $toStatus,
            'source' => $source,
            'changed_by_user_id' => $changedByUserId,
            'note' => $note,
            'meta' => $meta ?: null,
        ]);
    }

    private function normalizedKey(mixed $explicitKey, string $fallbackName): string
    {
        $base = is_string($explicitKey) && trim($explicitKey) !== ''
            ? trim($explicitKey)
            : $fallbackName;

        return Str::of($base)->lower()->ascii()->replaceMatches('/[^a-z0-9]+/', '_')->trim('_')->value();
    }

    private function nullableTrim(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    /**
     * @return array<string, mixed>
     */
    private function formatTemporaryWorker(ViolationEmployee $employee): array
    {
        $this->temporaryPasses->refreshTemporaryPassStatus($employee);

        $referencePath = $employee->primaryFaceReference?->path;

        return [
            'id' => $employee->id,
            'full_name' => $employee->full_name,
            'department' => $employee->department,
            'position' => $employee->position,
            'person_kind' => $employee->person_kind,
            'temporary_pass_status' => $employee->temporary_pass_status,
            'temporary_pass_issued_at' => $employee->temporary_pass_issued_at?->toIso8601String(),
            'temporary_pass_expires_at' => $employee->temporary_pass_expires_at?->toIso8601String(),
            'temporary_pass_duration_months' => $employee->temporary_pass_duration_months,
            'temporary_pass_created_by_name' => $employee->temporary_pass_created_by_name ?: $employee->temporaryPassCreator?->name,
            'temporary_pass_last_extended_at' => $employee->temporary_pass_last_extended_at?->toIso8601String(),
            'face_reference_count' => $employee->face_reference_count,
            'reference_image_url' => $referencePath
                ? '/reference-images/' . ltrim(str_replace('\\', '/', $referencePath), '/')
                : null,
        ];
    }
}
