<?php

namespace App\Services\Violations;

use App\Models\TelegramBotChat;
use App\Models\User;
use App\Models\ViolationEmployee;
use App\Models\ViolationEmployeeFaceReference;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class TemporaryPassService
{
    public const PERSON_KIND_TEMPORARY_CONTRACTOR = 'temporary_contractor';

    public const PASS_STATUS_ACTIVE = 'active';
    public const PASS_STATUS_EXPIRED = 'expired';

    public const EVENT_CREATED = 'created';
    public const EVENT_EXTENDED = 'extended';

    public const CREATE_MATCH_THRESHOLD = 0.45;
    public const CHECK_MATCH_THRESHOLD = 0.45;
    public const EXPIRES_SOON_DAYS = 14;

    public function __construct(
        private FaceIdRecognitionService $faceIdRecognition,
        private FaceReferenceManifestService $faceReferenceManifest,
    ) {
    }

    /**
     * @return array{ok: bool, error: ?string, error_type: ?string, payload: ?array<string, mixed>}
     */
    public function recognizeTemporaryContractor(UploadedFile $file): array
    {
        $recognition = $this->faceIdRecognition->recognize($file, [
            'person_kinds' => [self::PERSON_KIND_TEMPORARY_CONTRACTOR],
        ]);

        if (! ($recognition['ok'] ?? false)) {
            return $recognition;
        }

        $recognition['payload'] = $this->normalizeRecognitionPayload(
            is_array($recognition['payload'] ?? null) ? $recognition['payload'] : [],
            temporaryContractorsOnly: true,
        );

        if ($this->hasRecognitionCandidates($recognition['payload'])) {
            return $recognition;
        }

        $fallback = $this->faceIdRecognition->recognize($file);
        if (! ($fallback['ok'] ?? false)) {
            return $recognition;
        }

        $fallbackPayload = $this->normalizeRecognitionPayload(
            is_array($fallback['payload'] ?? null) ? $fallback['payload'] : [],
            temporaryContractorsOnly: true,
        );

        if ($this->hasRecognitionCandidates($fallbackPayload)) {
            $recognition['payload'] = $fallbackPayload;
        }

        return $recognition;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array{action: 'created'|'extended', employee: ViolationEmployee, recognition: array<string, mixed>}
     */
    public function createFromMiniApp(User $user, TelegramBotChat $chat, array $payload, UploadedFile $photo): array
    {
        $recognition = $this->requireRecognition($photo);
        $confirmedReferenceKey = $this->nullableTrim($payload['confirmed_reference_key'] ?? null);
        $rejectedAll = filter_var($payload['rejected_all'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $durationMonths = (int) $payload['duration_months'];

        $strictCandidates = $this->aboveThresholdCandidates(
            $recognition,
            $this->recognitionThreshold($recognition, self::CREATE_MATCH_THRESHOLD)
        );

        if ($confirmedReferenceKey !== null) {
            $candidate = $this->findCandidateByReferenceKey($strictCandidates, $confirmedReferenceKey);
            if ($candidate === null) {
                throw ValidationException::withMessages([
                    'photo' => 'Подтверждённый кандидат не найден. Сделайте фото заново.',
                ]);
            }

            $employee = $this->resolveConfirmedTemporaryEmployee($candidate);
            if (! $employee) {
                throw ValidationException::withMessages([
                    'photo' => 'Не удалось найти временный пропуск для подтверждённого кандидата.',
                ]);
            }

            return [
                'action' => 'extended',
                'employee' => $this->extendEmployee($employee, $user, $chat, $durationMonths, $photo, $candidate),
                'recognition' => $recognition,
            ];
        }

        if ($strictCandidates !== [] && ! $rejectedAll) {
            throw ValidationException::withMessages([
                'photo' => 'Такой временный сотрудник уже похож на существующего. Подтвердите кандидата или отклоните всех.',
            ]);
        }

        return [
            'action' => 'created',
            'employee' => $this->createEmployee($user, $chat, $payload, $durationMonths, $photo),
            'recognition' => $recognition,
        ];
    }

    /**
     * @param array<string, mixed> $payload
     * @return array{employee: ViolationEmployee, recognition: array<string, mixed>}
     */
    public function extendFromMiniApp(User $user, TelegramBotChat $chat, array $payload, UploadedFile $photo): array
    {
        $recognition = $this->requireRecognition($photo);
        $confirmedReferenceKey = $this->nullableTrim($payload['confirmed_reference_key'] ?? null);
        $durationMonths = (int) $payload['duration_months'];

        if ($confirmedReferenceKey === null) {
            throw ValidationException::withMessages([
                'photo' => 'Подтвердите временного сотрудника по эталонному фото.',
            ]);
        }

        $candidate = $this->findCandidateByReferenceKey(
            $this->aboveThresholdCandidates(
                $recognition,
                $this->recognitionThreshold($recognition, self::CHECK_MATCH_THRESHOLD)
            ),
            $confirmedReferenceKey
        );

        if ($candidate === null) {
            throw ValidationException::withMessages([
                'photo' => 'Подтверждённый кандидат не найден. Сделайте фото заново.',
            ]);
        }

        $employee = $this->resolveConfirmedTemporaryEmployee($candidate);
        if (! $employee) {
            throw ValidationException::withMessages([
                'photo' => 'Не удалось найти временный пропуск для продления.',
            ]);
        }

        return [
            'employee' => $this->extendEmployee($employee, $user, $chat, $durationMonths, $photo, $candidate),
            'recognition' => $recognition,
        ];
    }

    public function refreshTemporaryPassStatus(ViolationEmployee $employee, bool $persist = true): ViolationEmployee
    {
        if ($employee->person_kind !== self::PERSON_KIND_TEMPORARY_CONTRACTOR) {
            return $employee;
        }

        $nextStatus = $this->statusForExpiry($employee->temporary_pass_expires_at);
        if ($employee->temporary_pass_status === $nextStatus) {
            return $employee;
        }

        $employee->temporary_pass_status = $nextStatus;
        if ($persist) {
            $employee->save();
        }

        return $employee;
    }

    public function statusForExpiry(?Carbon $expiresAt): ?string
    {
        if (! $expiresAt) {
            return null;
        }

        return $expiresAt->isFuture() ? self::PASS_STATUS_ACTIVE : self::PASS_STATUS_EXPIRED;
    }

    /**
     * @param array<string, mixed>|null $candidate
     * @return array<string, mixed>|null
     */
    private function enrichRecognitionCandidate(?array $candidate): ?array
    {
        if ($candidate === null) {
            return null;
        }

        $employeeId = isset($candidate['employeeId']) ? (int) $candidate['employeeId'] : null;
        if (! $employeeId) {
            return $candidate;
        }

        $employee = ViolationEmployee::query()
            ->with('primaryFaceReference:id,employee_id,path,is_primary')
            ->find($employeeId);

        if (! $employee) {
            return $candidate;
        }

        $this->refreshTemporaryPassStatus($employee);

        $profile = is_array($candidate['profile'] ?? null) ? $candidate['profile'] : [];
        $profile['personKind'] = $employee->person_kind;
        $profile['temporaryPassStatus'] = $employee->temporary_pass_status;
        $profile['temporaryPassExpiresAt'] = $employee->temporary_pass_expires_at?->toIso8601String();
        $profile['temporaryPassIssuedAt'] = $employee->temporary_pass_issued_at?->toIso8601String();

        if ($employee->primaryFaceReference?->path) {
            $candidate['referenceImageUrl'] = '/reference-images/' . ltrim(str_replace('\\', '/', $employee->primaryFaceReference->path), '/');
        }

        $candidate['profile'] = $profile;

        return $candidate;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array{matched: bool, threshold: mixed, bestMatch: ?array<string, mixed>, candidates: array<int, array<string, mixed>>}
     */
    private function normalizeRecognitionPayload(array $payload, bool $temporaryContractorsOnly = false): array
    {
        $orderedCandidates = [];
        $seen = [];

        foreach ([$payload['bestMatch'] ?? null, ...((array) ($payload['candidates'] ?? []))] as $candidate) {
            if (! is_array($candidate)) {
                continue;
            }

            $normalized = $this->enrichRecognitionCandidate($candidate);
            if ($normalized === null) {
                continue;
            }

            if ($temporaryContractorsOnly && ! $this->isTemporaryContractorCandidate($normalized)) {
                continue;
            }

            $key = $this->recognitionCandidateKey($normalized);
            if ($key !== null && isset($seen[$key])) {
                continue;
            }

            if ($key !== null) {
                $seen[$key] = true;
            }

            $orderedCandidates[] = $normalized;
        }

        $bestMatch = $orderedCandidates[0] ?? null;

        return [
            'matched' => $bestMatch !== null && (bool) ($payload['matched'] ?? false),
            'threshold' => $payload['threshold'] ?? null,
            'bestMatch' => $bestMatch,
            'candidates' => array_slice($orderedCandidates, 1),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function requireRecognition(UploadedFile $photo): array
    {
        $recognition = $this->recognizeTemporaryContractor($photo);

        if (! ($recognition['ok'] ?? false)) {
            throw ValidationException::withMessages([
                'photo' => $recognition['error'] ?? 'Не удалось распознать временного сотрудника.',
            ]);
        }

        return $recognition;
    }

    /**
     * @param array<string, mixed> $recognition
     * @return array<int, array<string, mixed>>
     */
    private function aboveThresholdCandidates(array $recognition, float $threshold): array
    {
        $payload = is_array($recognition['payload'] ?? null) ? $recognition['payload'] : [];
        $candidates = [];

        foreach ([$payload['bestMatch'] ?? null, ...((array) ($payload['candidates'] ?? []))] as $candidate) {
            if (! is_array($candidate)) {
                continue;
            }

            $similarity = is_numeric($candidate['similarity'] ?? null) ? (float) $candidate['similarity'] : null;
            if ($similarity === null || $similarity < $threshold) {
                continue;
            }

            if (! $this->isTemporaryContractorCandidate($candidate)) {
                continue;
            }

            $key = $this->recognitionCandidateKey($candidate);
            if ($key === null || isset($candidates[$key])) {
                continue;
            }

            $candidates[$key] = $candidate;
            if (count($candidates) >= 3) {
                break;
            }
        }

        return array_values($candidates);
    }

    /**
     * @param array<string, mixed> $recognition
     */
    private function recognitionThreshold(array $recognition, float $fallback): float
    {
        $payload = is_array($recognition['payload'] ?? null) ? $recognition['payload'] : [];
        $threshold = $payload['threshold'] ?? null;

        return is_numeric($threshold) ? (float) $threshold : $fallback;
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function hasRecognitionCandidates(array $payload): bool
    {
        return is_array($payload['bestMatch'] ?? null) || ((array) ($payload['candidates'] ?? [])) !== [];
    }

    /**
     * @param array<string, mixed> $candidate
     */
    private function isTemporaryContractorCandidate(array $candidate): bool
    {
        $profile = is_array($candidate['profile'] ?? null) ? $candidate['profile'] : [];

        return ($profile['personKind'] ?? null) === self::PERSON_KIND_TEMPORARY_CONTRACTOR;
    }

    /**
     * @param array<string, mixed> $candidate
     */
    private function recognitionCandidateKey(array $candidate): ?string
    {
        foreach (['referenceKey', 'groupKey', 'employeeId'] as $field) {
            $value = $candidate[$field] ?? null;
            if ($value === null) {
                continue;
            }

            $key = trim((string) $value);
            if ($key !== '') {
                return $key;
            }
        }

        $name = trim((string) ($candidate['name'] ?? ''));
        $source = trim((string) ($candidate['source'] ?? ''));

        if ($name === '' && $source === '') {
            return null;
        }

        return $name . ':' . $source;
    }

    /**
     * @param array<int, array<string, mixed>> $candidates
     * @return array<string, mixed>|null
     */
    private function findCandidateByReferenceKey(array $candidates, string $referenceKey): ?array
    {
        foreach ($candidates as $candidate) {
            if (($candidate['referenceKey'] ?? null) === $referenceKey) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed> $candidate
     */
    private function resolveConfirmedTemporaryEmployee(array $candidate): ?ViolationEmployee
    {
        $employeeId = isset($candidate['employeeId']) ? (int) $candidate['employeeId'] : null;
        if (! $employeeId) {
            return null;
        }

        $employee = ViolationEmployee::query()->find($employeeId);
        if (! $employee || $employee->person_kind !== self::PERSON_KIND_TEMPORARY_CONTRACTOR) {
            return null;
        }

        return $this->refreshTemporaryPassStatus($employee);
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function createEmployee(User $user, TelegramBotChat $chat, array $payload, int $durationMonths, UploadedFile $photo): ViolationEmployee
    {
        $refreshManifest = false;

        $employee = DB::transaction(function () use ($user, $chat, $payload, $durationMonths, $photo, &$refreshManifest) {
            $now = now();
            $expiresAt = $now->copy()->addMonthsNoOverflow($durationMonths);

            $employee = ViolationEmployee::query()->create([
                'business_key' => 'temporary_contractor:' . Str::ulid(),
                'source_system' => 'manual_security',
                'person_kind' => self::PERSON_KIND_TEMPORARY_CONTRACTOR,
                'full_name' => trim((string) $payload['full_name']),
                'normalized_full_name' => Str::lower(trim((string) $payload['full_name'])),
                'department' => $this->nullableTrim($payload['department'] ?? null),
                'position' => $this->nullableTrim($payload['position'] ?? null),
                'employment_status' => 'TEMPORARY_CONTRACTOR',
                'temporary_pass_status' => self::PASS_STATUS_ACTIVE,
                'temporary_pass_issued_at' => $now,
                'temporary_pass_expires_at' => $expiresAt,
                'temporary_pass_duration_months' => $durationMonths,
                'temporary_pass_created_by_user_id' => $user->id,
                'temporary_pass_created_by_name' => $user->name,
                'is_active' => true,
                'face_reference_state' => 'unknown',
                'imported_at' => $now,
                'meta' => [
                    'temporary_pass_chat_id' => $chat->chat_id,
                    'temporary_pass_created_at' => $now->toIso8601String(),
                ],
            ]);

            $reference = $this->storeFaceReferenceFromUpload($employee, $photo, 'Temporary pass registration');
            $this->refreshEmployeeFaceReferenceSummary($employee);
            $employee->refresh();

            $employee->temporaryPassEvents()->create([
                'event_type' => self::EVENT_CREATED,
                'duration_months' => $durationMonths,
                'matched_reference_key' => null,
                'matched_similarity' => null,
                'performed_by_user_id' => $user->id,
                'performed_by_name' => $user->name,
                'performed_by_chat_id' => $chat->chat_id,
                'performed_at' => $now,
                'previous_expires_at' => null,
                'pass_issued_at' => $employee->temporary_pass_issued_at,
                'pass_expires_at' => $employee->temporary_pass_expires_at,
                'meta' => [
                    'reference_id' => $reference?->id,
                ],
            ]);

            $refreshManifest = true;

            return $employee;
        });

        if ($refreshManifest) {
            $this->refreshManifestSilently($employee->business_key);
        }

        return $employee;
    }

    /**
     * @param array<string, mixed>|null $candidate
     */
    private function extendEmployee(
        ViolationEmployee $employee,
        User $user,
        TelegramBotChat $chat,
        int $durationMonths,
        UploadedFile $photo,
        ?array $candidate = null,
    ): ViolationEmployee {
        $refreshManifest = false;

        $employee = DB::transaction(function () use ($employee, $user, $chat, $durationMonths, $photo, $candidate, &$refreshManifest) {
            $now = now();
            $previousExpiry = $employee->temporary_pass_expires_at?->copy();
            $baseDate = $previousExpiry && $previousExpiry->isFuture()
                ? $previousExpiry->copy()
                : $now->copy();
            $issuedAt = $previousExpiry && $previousExpiry->isFuture()
                ? ($employee->temporary_pass_issued_at ?: $now)
                : $now;
            $expiresAt = $baseDate->addMonthsNoOverflow($durationMonths);

            $employee->forceFill([
                'temporary_pass_status' => self::PASS_STATUS_ACTIVE,
                'temporary_pass_issued_at' => $issuedAt,
                'temporary_pass_expires_at' => $expiresAt,
                'temporary_pass_duration_months' => $durationMonths,
                'temporary_pass_last_extended_at' => $now,
                'employment_status' => 'TEMPORARY_CONTRACTOR',
                'is_active' => true,
            ])->save();

            $reference = $this->storeFaceReferenceFromUpload($employee, $photo, 'Temporary pass extension');
            $this->refreshEmployeeFaceReferenceSummary($employee);
            $employee->refresh();

            $employee->temporaryPassEvents()->create([
                'event_type' => self::EVENT_EXTENDED,
                'duration_months' => $durationMonths,
                'matched_reference_key' => is_array($candidate) ? $this->nullableTrim($candidate['referenceKey'] ?? null) : null,
                'matched_similarity' => is_array($candidate) && is_numeric($candidate['similarity'] ?? null)
                    ? (float) $candidate['similarity']
                    : null,
                'performed_by_user_id' => $user->id,
                'performed_by_name' => $user->name,
                'performed_by_chat_id' => $chat->chat_id,
                'performed_at' => $now,
                'previous_expires_at' => $previousExpiry,
                'pass_issued_at' => $employee->temporary_pass_issued_at,
                'pass_expires_at' => $employee->temporary_pass_expires_at,
                'meta' => [
                    'reference_id' => $reference?->id,
                ],
            ]);

            $refreshManifest = $reference !== null;

            return $employee;
        });

        if ($refreshManifest) {
            $this->refreshManifestSilently($employee->business_key);
        }

        return $employee;
    }

    private function refreshManifestSilently(?string $businessKey = null): void
    {
        try {
            $manifest = $this->faceReferenceManifest->exportActiveManifest();
            $rebuild = $this->faceIdRecognition->requestRuntimeRebuildAndWait($businessKey);

            if (! ($rebuild['ok'] ?? false)) {
                Log::warning('Temporary pass runtime rebuild did not finish cleanly', [
                    'error' => $rebuild['error'] ?? null,
                    'http_status' => $rebuild['http_status'] ?? null,
                    'timed_out' => $rebuild['timed_out'] ?? false,
                    'business_key' => $businessKey,
                    'business_key_found' => $rebuild['business_key_found'] ?? false,
                    'manifest_path' => $manifest['path'] ?? null,
                    'manifest_count' => $manifest['count'] ?? null,
                ]);
            }
        } catch (\Throwable $exception) {
            Log::warning('Failed to refresh temporary pass manifest', [
                'error' => $exception->getMessage(),
                'business_key' => $businessKey,
            ]);
        }
    }

    private function storeFaceReferenceFromUpload(
        ViolationEmployee $employee,
        UploadedFile $file,
        string $sourceLabel,
    ): ?ViolationEmployeeFaceReference {
        $sourcePath = $this->resolveUploadedFilePath($file);
        $sha1 = sha1_file($sourcePath) ?: null;

        if ($sha1) {
            $existing = ViolationEmployeeFaceReference::query()
                ->where('employee_id', $employee->id)
                ->where('sha1', $sha1)
                ->first();

            if ($existing) {
                $existing->forceFill([
                    'is_active' => true,
                    'last_synced_at' => now(),
                ])->save();

                return $existing;
            }
        }

        $extension = strtolower((string) ($file->getClientOriginalExtension() ?: $file->extension() ?: 'jpg'));
        $relativePath = 'temporary/' . $employee->id . '/face_' . Str::ulid() . '.' . $extension;
        $stream = fopen($sourcePath, 'rb');

        if ($stream === false) {
            return null;
        }

        try {
            $stored = Storage::disk('faceid_references')->put($relativePath, $stream);
        } finally {
            fclose($stream);
        }

        if (! $stored) {
            return null;
        }

        $fileSize = $file->getSize();
        if (! is_int($fileSize) || $fileSize <= 0) {
            $diskSize = @filesize($sourcePath);
            $fileSize = is_int($diskSize) ? $diskSize : null;
        }

        return ViolationEmployeeFaceReference::query()->create([
            'employee_id' => $employee->id,
            'source_system' => 'manual_security',
            'source' => 'temporary_pass',
            'external_ref' => $employee->external_ref,
            'source_image_id' => null,
            'group_key' => $employee->business_key,
            'disk' => 'faceid_references',
            'path' => $relativePath,
            'file_name' => basename($relativePath),
            'mime_type' => (string) ($file->getMimeType() ?: $file->getClientMimeType() ?: 'application/octet-stream'),
            'file_size' => $fileSize,
            'sha1' => $sha1,
            'is_primary' => ! $employee->faceReferences()->where('is_active', true)->exists(),
            'is_active' => true,
            'imported_at' => now(),
            'last_synced_at' => now(),
            'meta' => [
                'source_label' => $sourceLabel,
            ],
        ]);
    }

    private function refreshEmployeeFaceReferenceSummary(ViolationEmployee $employee): void
    {
        $activeCount = $employee->faceReferences()->where('is_active', true)->count();

        $employee->forceFill([
            'face_reference_count' => $activeCount,
            'face_reference_state' => $activeCount > 0 ? 'ready' : 'unknown',
            'last_face_sync_at' => now(),
        ])->save();
    }

    private function resolveUploadedFilePath(UploadedFile $file): string
    {
        $candidates = array_filter([
            $file->getRealPath() ?: null,
            method_exists($file, 'path') ? $file->path() : null,
            $file->getPathname() ?: null,
        ], fn ($value) => is_string($value) && trim($value) !== '');

        foreach ($candidates as $candidate) {
            if (is_file($candidate)) {
                return $candidate;
            }
        }

        throw ValidationException::withMessages([
            'photo' => 'Сервер не смог получить временный файл фотографии.',
        ]);
    }

    private function nullableTrim(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }
}
