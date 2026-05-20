<?php

namespace App\Services\Violations;

use App\Models\TelegramBotChat;
use App\Models\User;
use App\Models\ViolationEvidence;
use App\Models\ViolationEmployee;
use App\Models\ViolationEmployeeFaceReference;
use App\Models\ViolationIncident;
use App\Models\ViolationType;
use App\Services\TelegramMessagingService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ViolationIncidentService
{
    public function __construct(
        private TelegramMessagingService $telegramMessaging,
        private FaceIdRecognitionService $faceIdRecognition,
        private FaceReferenceManifestService $faceReferenceManifest,
    )
    {
    }

    /**
     * @param array<int, UploadedFile> $files
     */
    public function createManualTelegramIncident(
        User $user,
        TelegramBotChat $chat,
        array $payload,
        array $files,
        ?UploadedFile $recognitionFile = null,
    ): ViolationIncident
    {
        $recognitionStartedAt = null;
        $recognitionFinishedAt = null;
        $recognitionPayload = null;
        $recognitionError = null;
        $recognitionErrorType = null;
        $confirmedReferenceKey = $this->nullableTrim($payload['recognition_confirmed_reference_key'] ?? null);
        $rejectedAllCandidates = filter_var($payload['recognition_rejected_all'] ?? false, FILTER_VALIDATE_BOOLEAN);

        if ($recognitionFile) {
            $recognitionStartedAt = now();
            $recognitionResponse = $this->faceIdRecognition->recognize($recognitionFile);
            $recognitionFinishedAt = now();
            $recognitionPayload = is_array($recognitionResponse['payload'] ?? null)
                ? $recognitionResponse['payload']
                : null;

            if (! ($recognitionResponse['ok'] ?? false)) {
                $recognitionError = $this->nullableTrim($recognitionResponse['error'] ?? null);
                $recognitionErrorType = $this->nullableTrim($recognitionResponse['error_type'] ?? null);
            }
        }

        $shouldRefreshFaceReferenceManifest = false;

        $incident = DB::transaction(function () use (
            $user,
            $chat,
            $payload,
            $files,
            $recognitionFile,
            $recognitionPayload,
            $recognitionError,
            $recognitionErrorType,
            $recognitionStartedAt,
            $recognitionFinishedAt,
            $confirmedReferenceKey,
            $rejectedAllCandidates,
            &$shouldRefreshFaceReferenceManifest,
        ) {
            $type = ViolationType::query()
                ->with('category')
                ->whereKey((int) $payload['type_id'])
                ->where('is_active', true)
                ->firstOrFail();

            $occurredAt = Carbon::parse((string) $payload['occurred_at']);
            $reporterName = $chat->display_full_name ?: $user->name;
            if ($confirmedReferenceKey !== null && $rejectedAllCandidates) {
                throw ValidationException::withMessages([
                    'recognition_confirmed_reference_key' => 'Нельзя одновременно подтвердить кандидата и пометить, что все кандидаты отклонены.',
                ]);
            }

            $confirmedCandidate = $this->confirmedRecognitionCandidate($recognitionPayload, $confirmedReferenceKey);
            if ($confirmedReferenceKey !== null && ! $confirmedCandidate) {
                throw ValidationException::withMessages([
                    'recognition_confirmed_reference_key' => 'Подтверждённый кандидат больше не найден. Сделайте фото ещё раз.',
                ]);
            }

            $matchedCandidate = $rejectedAllCandidates ? null : $this->matchedRecognitionCandidate($recognitionPayload);
            $resolvedCandidate = $confirmedCandidate ?? $matchedCandidate;
            $resolvedProfile = $this->candidateProfile($resolvedCandidate);
            $recognizedEmployee = $resolvedCandidate ? $this->syncRecognizedEmployee($resolvedCandidate) : null;

            $manualFullName = $this->nullableTrim($payload['manual_full_name'] ?? null);
            if ($rejectedAllCandidates && $manualFullName === null) {
                throw ValidationException::withMessages([
                    'manual_full_name' => 'После трёх отклонённых кандидатов укажите ФИО вручную.',
                ]);
            }

            $employeeFullName = $this->resolveEmployeeField($manualFullName, $resolvedCandidate['name'] ?? null);
            $manualEmployee = $resolvedCandidate === null && $employeeFullName !== null
                ? $this->syncManualTelegramEmployee($payload)
                : null;
            $queueUnknownIdentity = $recognitionFile !== null
                && $resolvedCandidate === null
                && $recognitionError === null
                && $employeeFullName === null
                && ! $rejectedAllCandidates;

            if (! $employeeFullName && ! $queueUnknownIdentity) {
                throw ValidationException::withMessages([
                    'manual_full_name' => 'Укажите ФИО нарушителя или сделайте отдельное фото для распознавания.',
                ]);
            }

            $employeeDepartment = $this->resolveEmployeeField($payload['manual_department'] ?? null, $resolvedProfile['department'] ?? null);
            $employeePosition = $this->resolveEmployeeField($payload['manual_position'] ?? null, $resolvedProfile['role'] ?? null);
            $recognitionStatus = $this->resolveRecognitionStatus($recognitionFile, $resolvedCandidate, $recognitionError, $manualEmployee !== null || $manualFullName !== null);
            $workflowStatus = $queueUnknownIdentity
                ? ViolationIncident::STATUS_UNKNOWN_MANUAL
                : ViolationIncident::STATUS_PENDING_REVIEW;
            $statusNote = $queueUnknownIdentity
                ? 'Личность не найдена. Инцидент отправлен в очередь ручной идентификации СБ.'
                : ($manualEmployee !== null
                    ? 'Личность заполнена вручную после проверки эталонных фото в Telegram Mini App.'
                    : 'Нарушение зафиксировано через Telegram Mini App.');

            $incidentEmployee = $recognizedEmployee ?? $manualEmployee;
            $shouldPersistRecognitionProbe = $recognitionFile !== null
                && ($queueUnknownIdentity || ($manualEmployee !== null && $resolvedCandidate === null));

            $incident = ViolationIncident::query()->create([
                'source' => 'telegram_miniapp',
                'workflow_status' => $workflowStatus,
                'recognition_status' => $recognitionStatus,
                'identity_source' => $confirmedCandidate
                    ? 'faceid_guard_confirmed'
                    : ($resolvedCandidate
                        ? 'faceid_camera'
                        : ($queueUnknownIdentity ? 'pending_manual_security' : 'manual')),
                'occurred_at' => $occurredAt,
                'reported_by_user_id' => $user->id,
                'reported_by_chat_id' => $chat->chat_id,
                'reported_by_name' => $reporterName,
                'category_id' => $type->category_id,
                'type_id' => $type->id,
                'category_key' => $type->category->key,
                'category_name' => $type->category->name,
                'type_key' => $type->key,
                'type_name' => $type->name,
                'description' => $this->nullableTrim($payload['description'] ?? null),
                'location_label' => $this->nullableTrim($payload['location_label'] ?? null),
                'employee_id' => $incidentEmployee?->id,
                'employee_business_key' => $incidentEmployee?->business_key,
                'employee_iin' => $resolvedCandidate
                    ? $this->nullableTrim($resolvedProfile['iin'] ?? null)
                    : $manualEmployee?->iin,
                'employee_full_name' => $employeeFullName,
                'employee_normalized_full_name' => $employeeFullName ? Str::lower($employeeFullName) : null,
                'employee_department' => $employeeDepartment,
                'employee_position' => $employeePosition,
                'employee_status' => $resolvedCandidate
                    ? $this->nullableTrim($resolvedProfile['status'] ?? null)
                    : $manualEmployee?->employment_status,
                'is_manual_identity' => $queueUnknownIdentity ? false : $resolvedCandidate === null,
                'recognition_employee_id' => $recognizedEmployee?->id,
                'recognition_employee_business_key' => $recognizedEmployee?->business_key,
                'recognition_employee_full_name' => $recognizedEmployee?->full_name,
                'recognition_employee_department' => $recognizedEmployee?->department,
                'recognition_attempts_count' => $recognitionFile ? 1 : 0,
                'recognition_candidate_count' => count($this->recognitionCandidates($recognitionPayload)),
                'recognition_similarity' => $this->recognitionSimilarity($recognitionPayload, $resolvedCandidate),
                'recognition_threshold' => $this->recognitionThreshold($recognitionPayload),
                'recognition_error' => $recognitionError,
                'meta' => array_filter([
                    'capture_source' => 'telegram_miniapp',
                    'chat_id' => $chat->chat_id,
                    'recognition_error_type' => $recognitionErrorType,
                    'recognition_source' => $resolvedCandidate ? $this->nullableTrim($resolvedCandidate['source'] ?? null) : null,
                    'recognition_confirmed_reference_key' => $confirmedReferenceKey,
                    'recognition_rejected_all' => $rejectedAllCandidates ? true : null,
                ], fn ($value) => $value !== null && $value !== ''),
            ]);

            $evidences = collect($files)->values()->map(
                fn (UploadedFile $file, int $index) => $this->storeEvidence($incident, $file, $index)
            );

            $this->syncIncidentEvidenceSnapshot($incident, $evidences);

            if ($shouldPersistRecognitionProbe && $recognitionFile) {
                $recognitionProbe = $this->storeRecognitionProbe($incident, $recognitionFile);
                $incident->forceFill([
                    'meta' => array_merge(
                        is_array($incident->meta) ? $incident->meta : [],
                        ['recognition_probe_evidence_id' => $recognitionProbe->id]
                    ),
                ])->save();

                if ($manualEmployee !== null) {
                    $this->upsertFaceReferenceFromEvidence($manualEmployee, $recognitionProbe, 'manual_security', [
                        'source_label' => 'Telegram Mini App manual identification',
                    ]);
                    $this->refreshEmployeeFaceReferenceSummary($manualEmployee);
                    $shouldRefreshFaceReferenceManifest = true;
                }
            }

            if ($recognitionFile) {
                $this->storeRecognitionAttempt(
                    $incident,
                    $recognizedEmployee,
                    $resolvedCandidate,
                    $recognitionPayload,
                    $recognitionError,
                    $recognitionStartedAt,
                    $recognitionFinishedAt,
                );
            }

            $incident->statusHistory()->create([
                'from_status' => ViolationIncident::STATUS_DRAFT_PROCESSING,
                'to_status' => $workflowStatus,
                'source' => 'telegram_miniapp',
                'changed_by_user_id' => $user->id,
                'note' => $statusNote,
            ]);

            $incident->refresh();
            $this->notifyReviewers($incident, $reporterName);

            return $incident;
        });

        if ($shouldRefreshFaceReferenceManifest) {
            $this->refreshFaceReferenceManifestSilently();
        }

        return $incident;
    }

    /**
     * @param Collection<int, ViolationEvidence> $evidences
     */
    private function syncIncidentEvidenceSnapshot(ViolationIncident $incident, Collection $evidences): void
    {
        $photoCount = $evidences->where('media_kind', 'photo')->count();
        $videoCount = $evidences->where('media_kind', 'video')->count();
        $primary = $evidences->firstWhere('is_primary', true) ?: $evidences->first();

        $incident->forceFill([
            'evidence_total_count' => $evidences->count(),
            'evidence_photo_count' => $photoCount,
            'evidence_video_count' => $videoCount,
            'primary_evidence_kind' => $primary?->media_kind,
            'primary_evidence_path' => $primary?->path,
        ])->save();
    }

    public function resolveUnknownIncidentIdentity(ViolationIncident $incident, User $reviewer, array $payload): ViolationIncident
    {
        if ($incident->workflow_status !== ViolationIncident::STATUS_UNKNOWN_MANUAL) {
            throw ValidationException::withMessages([
                'incident' => 'Этот инцидент не находится в очереди ручной идентификации.',
            ]);
        }

        $resolved = DB::transaction(function () use ($incident, $reviewer, $payload) {
            $employee = $this->syncManualReviewedEmployee($incident, $payload);
            $reviewNote = $this->nullableTrim($payload['review_note'] ?? null);

            $incident->forceFill([
                'workflow_status' => ViolationIncident::STATUS_PENDING_REVIEW,
                'recognition_status' => ViolationIncident::RECOGNITION_MANUAL,
                'identity_source' => 'manual_security',
                'employee_id' => $employee->id,
                'employee_business_key' => $employee->business_key,
                'employee_iin' => $employee->iin,
                'employee_full_name' => $employee->full_name,
                'employee_normalized_full_name' => $employee->normalized_full_name,
                'employee_department' => $employee->department,
                'employee_position' => $employee->position,
                'employee_status' => $employee->employment_status,
                'is_manual_identity' => true,
                'recognition_employee_id' => $employee->id,
                'recognition_employee_business_key' => $employee->business_key,
                'recognition_employee_full_name' => $employee->full_name,
                'recognition_employee_department' => $employee->department,
                'review_note' => $reviewNote,
            ])->save();

            $incident->statusHistory()->create([
                'from_status' => ViolationIncident::STATUS_UNKNOWN_MANUAL,
                'to_status' => ViolationIncident::STATUS_PENDING_REVIEW,
                'source' => 'manual_identity_review',
                'changed_by_user_id' => $reviewer->id,
                'note' => $reviewNote ?: 'Личность нарушителя сохранена вручную сотрудником СБ.',
            ]);

            return $incident->fresh([
                'reporter:id,name',
                'reviewer:id,name',
                'evidences:id,incident_id,media_role,media_kind,path,is_primary,sort_order',
            ]);
        });

        $this->refreshFaceReferenceManifestSilently();

        return $resolved;
    }

    private function storeRecognitionAttempt(
        ViolationIncident $incident,
        ?ViolationEmployee $recognizedEmployee,
        ?array $resolvedCandidate,
        ?array $recognitionPayload,
        ?string $recognitionError,
        ?Carbon $startedAt,
        ?Carbon $finishedAt,
    ): void {
        $bestCandidate = $resolvedCandidate ?? $this->bestRecognitionCandidate($recognitionPayload);
        $bestProfile = $this->candidateProfile($bestCandidate);

        $incident->recognitionAttempts()->create([
            'attempt_kind' => 'image',
            'service_name' => 'faceid_python',
            'status' => $this->resolveAttemptStatus($recognitionPayload, $recognitionError, $resolvedCandidate),
            'matched' => $resolvedCandidate !== null,
            'threshold' => $this->recognitionThreshold($recognitionPayload),
            'best_similarity' => $this->recognitionSimilarity($recognitionPayload, $bestCandidate),
            'candidate_count' => count($this->recognitionCandidates($recognitionPayload)),
            'recognized_employee_id' => $recognizedEmployee?->id,
            'recognized_employee_business_key' => $recognizedEmployee?->business_key,
            'recognized_full_name' => $recognizedEmployee?->full_name ?: $this->nullableTrim($bestCandidate['name'] ?? null),
            'recognized_department' => $recognizedEmployee?->department ?: $this->nullableTrim($bestProfile['department'] ?? null),
            'error_message' => $recognitionError,
            'candidates_json' => $this->recognitionCandidates($recognitionPayload),
            'raw_response' => $recognitionPayload,
            'started_at' => $startedAt,
            'finished_at' => $finishedAt,
        ]);
    }

    private function syncRecognizedEmployee(array $candidate): ViolationEmployee
    {
        $profile = $this->candidateProfile($candidate);
        $fullName = $this->nullableTrim($candidate['name'] ?? null) ?: 'Неизвестный сотрудник';
        $employee = ViolationEmployee::query()->firstOrNew([
            'business_key' => $this->recognitionBusinessKey($candidate),
        ]);

        $employee->source_system = $this->recognitionSourceSystem($candidate['source'] ?? null);
        $employee->external_ref = isset($candidate['employeeId']) ? (string) $candidate['employeeId'] : $employee->external_ref;
        $employee->iin = $this->nullableTrim($profile['iin'] ?? null);
        $employee->full_name = $fullName;
        $employee->normalized_full_name = Str::lower($fullName);
        $employee->department = $this->nullableTrim($profile['department'] ?? null);
        $employee->position = $this->nullableTrim($profile['role'] ?? null);
        $employee->employment_status = $this->nullableTrim($profile['status'] ?? null);
        $employee->is_active = $this->nullableTrim($profile['status'] ?? null) !== 'BLOCKED';
        $employee->face_reference_count = max((int) $employee->face_reference_count, 1);
        $employee->face_reference_state = 'available';
        $employee->last_face_sync_at = now();
        $employee->imported_at ??= now();
        $employee->meta = array_merge(
            is_array($employee->meta) ? $employee->meta : [],
            array_filter([
                'faceid_source' => $this->nullableTrim($candidate['source'] ?? null),
                'faceid_group_key' => $this->nullableTrim($candidate['groupKey'] ?? null),
                'faceid_image_hash' => $this->nullableTrim($candidate['imageHash'] ?? null),
            ], fn ($value) => $value !== null && $value !== '')
        );
        $employee->save();

        return $employee;
    }

    private function resolveEmployeeField(mixed $manualValue, mixed $recognizedValue): ?string
    {
        return $this->nullableTrim($manualValue) ?: $this->nullableTrim($recognizedValue);
    }

    private function resolveRecognitionStatus(
        ?UploadedFile $recognitionFile,
        ?array $matchedCandidate,
        ?string $recognitionError,
        bool $manualIdentityProvided,
    ): string
    {
        if (! $recognitionFile) {
            return ViolationIncident::RECOGNITION_MANUAL;
        }

        if ($recognitionError) {
            return ViolationIncident::RECOGNITION_FAILED;
        }

        if ($manualIdentityProvided && ! $matchedCandidate) {
            return ViolationIncident::RECOGNITION_MANUAL;
        }

        return $matchedCandidate ? ViolationIncident::RECOGNITION_MATCHED : ViolationIncident::RECOGNITION_UNKNOWN;
    }

    private function resolveAttemptStatus(?array $recognitionPayload, ?string $recognitionError, ?array $resolvedCandidate = null): string
    {
        if ($recognitionError) {
            return 'failed';
        }

        return $resolvedCandidate !== null ? 'matched' : 'unknown';
    }

    private function recognitionSourceSystem(mixed $source): string
    {
        $value = Str::lower(trim((string) $source));

        if ($value === '') {
            return 'faceid';
        }

        if (str_starts_with($value, 'sigur')) {
            return 'sigur';
        }

        if (str_starts_with($value, 'custom')) {
            return 'custom';
        }

        return Str::substr(preg_replace('/[^a-z0-9_:-]+/', '_', $value) ?: 'faceid', 0, 60);
    }

    private function recognitionBusinessKey(array $candidate): string
    {
        $profile = $this->candidateProfile($candidate);
        $profileBusinessKey = $this->nullableTrim($profile['businessKey'] ?? null);
        if ($profileBusinessKey) {
            return $profileBusinessKey;
        }

        $groupKey = $this->nullableTrim($candidate['groupKey'] ?? null);
        if ($groupKey) {
            return 'faceid:' . $groupKey;
        }

        $sourceSystem = $this->recognitionSourceSystem($candidate['source'] ?? null);
        $employeeId = $this->nullableTrim(isset($candidate['employeeId']) ? (string) $candidate['employeeId'] : null);
        if ($employeeId) {
            return $sourceSystem . ':' . $employeeId;
        }

        return $sourceSystem . ':' . sha1(json_encode($candidate, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    /**
     * @param array<string, mixed>|null $payload
     * @return array<string, mixed>|null
     */
    private function matchedRecognitionCandidate(?array $payload): ?array
    {
        if (! $payload || ! ($payload['matched'] ?? false) || ! is_array($payload['bestMatch'] ?? null)) {
            return null;
        }

        return $payload['bestMatch'];
    }

    /**
     * @param array<string, mixed>|null $payload
     * @return array<string, mixed>|null
     */
    private function bestRecognitionCandidate(?array $payload): ?array
    {
        if (! $payload || ! is_array($payload['bestMatch'] ?? null)) {
            return null;
        }

        return $payload['bestMatch'];
    }

    /**
     * @param array<string, mixed>|null $candidate
     * @return array<string, mixed>
     */
    private function candidateProfile(?array $candidate): array
    {
        return is_array($candidate['profile'] ?? null) ? $candidate['profile'] : [];
    }

    /**
     * @param array<string, mixed>|null $payload
     * @return array<int, array<string, mixed>>
     */
    private function recognitionCandidates(?array $payload): array
    {
        $candidates = $payload['candidates'] ?? [];

        return is_array($candidates) ? array_values(array_filter($candidates, 'is_array')) : [];
    }

    private function recognitionSimilarity(?array $payload, ?array $candidate = null): ?float
    {
        $candidate = $candidate ?? $this->bestRecognitionCandidate($payload);
        $similarity = $candidate['similarity'] ?? null;

        return is_numeric($similarity) ? (float) $similarity : null;
    }

    private function recognitionThreshold(?array $payload): ?float
    {
        $threshold = $payload['threshold'] ?? null;

        return is_numeric($threshold) ? (float) $threshold : null;
    }

    /**
     * @param array<string, mixed>|null $payload
     * @return array<string, mixed>|null
     */
    private function confirmedRecognitionCandidate(?array $payload, ?string $referenceKey): ?array
    {
        if (! $payload || $referenceKey === null) {
            return null;
        }

        foreach ($this->allRecognitionCandidates($payload) as $candidate) {
            if ($this->recognitionCandidateReferenceKey($candidate) === $referenceKey) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed>|null $payload
     * @return array<int, array<string, mixed>>
     */
    private function allRecognitionCandidates(?array $payload): array
    {
        if (! $payload) {
            return [];
        }

        $all = [];
        $best = $this->bestRecognitionCandidate($payload);
        if ($best) {
            $all[] = $best;
        }

        foreach ($this->recognitionCandidates($payload) as $candidate) {
            $all[] = $candidate;
        }

        $seen = [];
        $unique = [];

        foreach ($all as $candidate) {
            $key = $this->recognitionCandidateReferenceKey($candidate)
                ?: $this->nullableTrim($candidate['groupKey'] ?? null)
                ?: $this->nullableTrim(isset($candidate['employeeId']) ? (string) $candidate['employeeId'] : null)
                ?: sha1(json_encode($candidate, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

            if (isset($seen[$key])) {
                continue;
            }

            $seen[$key] = true;
            $unique[] = $candidate;
        }

        return $unique;
    }

    /**
     * @param array<string, mixed> $candidate
     */
    private function recognitionCandidateReferenceKey(array $candidate): ?string
    {
        return $this->nullableTrim($candidate['referenceKey'] ?? null);
    }

    private function syncManualTelegramEmployee(array $payload): ViolationEmployee
    {
        $fullName = trim((string) $payload['manual_full_name']);
        $normalizedFullName = Str::lower($fullName);
        $department = $this->nullableTrim($payload['manual_department'] ?? null);
        $position = $this->nullableTrim($payload['manual_position'] ?? null);

        $employee = ViolationEmployee::query()
            ->where('normalized_full_name', $normalizedFullName)
            ->when($department, fn ($query) => $query->where('department', $department))
            ->orderByDesc('is_active')
            ->orderBy('id')
            ->first();

        if (! $employee) {
            $employee = new ViolationEmployee([
                'business_key' => 'manual_security:' . Str::ulid(),
                'source_system' => 'manual_security',
            ]);
        }

        $employee->full_name = $fullName;
        $employee->normalized_full_name = $normalizedFullName;
        $employee->department = $department;
        $employee->position = $position;
        $employee->is_active = true;
        $employee->employment_status ??= 'MANUAL_REVIEW';
        $employee->face_reference_state = (string) ($employee->face_reference_state ?: 'saved_probe');
        $employee->imported_at ??= now();

        $meta = is_array($employee->meta) ? $employee->meta : [];
        $meta['telegram_manual_identity_at'] = now()->toIso8601String();
        $employee->meta = $meta;
        $employee->save();

        return $employee;
    }

    private function syncManualReviewedEmployee(ViolationIncident $incident, array $payload): ViolationEmployee
    {
        $fullName = trim((string) $payload['employee_full_name']);
        $normalizedFullName = Str::lower($fullName);
        $department = $this->nullableTrim($payload['employee_department'] ?? null);
        $position = $this->nullableTrim($payload['employee_position'] ?? null);
        $recognitionProbe = $incident->evidences()
            ->where('media_role', 'recognition_probe')
            ->latest('id')
            ->first();

        $employee = ViolationEmployee::query()
            ->where('normalized_full_name', $normalizedFullName)
            ->when($department, fn ($query) => $query->where('department', $department))
            ->orderByDesc('is_active')
            ->orderBy('id')
            ->first();

        if (! $employee) {
            $employee = new ViolationEmployee([
                'business_key' => 'manual_security:' . Str::ulid(),
                'source_system' => 'manual_security',
            ]);
        }

        $employee->full_name = $fullName;
        $employee->normalized_full_name = $normalizedFullName;
        $employee->department = $department;
        $employee->position = $position;
        $employee->is_active = true;
        $employee->employment_status ??= 'MANUAL_REVIEW';
        $employee->face_reference_count = max((int) $employee->face_reference_count, $recognitionProbe ? 1 : 0);
        $employee->face_reference_state = $recognitionProbe
            ? ((string) ($employee->face_reference_state ?: 'saved_probe'))
            : ((string) ($employee->face_reference_state ?: 'unknown'));
        $employee->imported_at ??= now();

        $meta = is_array($employee->meta) ? $employee->meta : [];
        $meta['manual_identity_reviewed_at'] = now()->toIso8601String();

        if ($recognitionProbe) {
            $meta['pending_face_probe_path'] = $recognitionProbe->path;
            $meta['pending_face_probe_sha1'] = $recognitionProbe->sha1;
            $meta['pending_face_probe_evidence_id'] = $recognitionProbe->id;
        }

        $employee->meta = $meta;
        $employee->save();

        if ($recognitionProbe) {
            $this->upsertFaceReferenceFromEvidence($employee, $recognitionProbe, 'manual_security', [
                'source_label' => 'Manual security review',
            ]);
        }

        $this->refreshEmployeeFaceReferenceSummary($employee);

        return $employee;
    }

    private function upsertFaceReferenceFromEvidence(
        ViolationEmployee $employee,
        ViolationEvidence $evidence,
        string $sourceSystem,
        array $meta = [],
    ): void {
        $sha1 = $this->nullableTrim($evidence->sha1);
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

                return;
            }
        }

        $sourceAbsolutePath = Storage::disk((string) $evidence->disk)->path($evidence->path);
        if (! is_file($sourceAbsolutePath)) {
            Log::warning('Manual face reference source file is missing', [
                'employee_id' => $employee->id,
                'evidence_id' => $evidence->id,
                'disk' => $evidence->disk,
                'path' => $evidence->path,
            ]);

            return;
        }

        $extension = strtolower(pathinfo((string) $evidence->file_name, PATHINFO_EXTENSION));
        if ($extension === '') {
            $extension = strtolower(pathinfo((string) $evidence->path, PATHINFO_EXTENSION)) ?: 'jpg';
        }

        $relativePath = 'manual/' . $employee->id . '/probe_' . Str::ulid() . '.' . $extension;
        $stream = fopen($sourceAbsolutePath, 'rb');

        if ($stream === false) {
            Log::warning('Manual face reference file cannot be opened', [
                'employee_id' => $employee->id,
                'evidence_id' => $evidence->id,
                'source_path' => $sourceAbsolutePath,
            ]);

            return;
        }

        try {
            $stored = Storage::disk('faceid_references')->put($relativePath, $stream);
        } finally {
            fclose($stream);
        }

        if (! $stored) {
            Log::warning('Manual face reference could not be copied into faceid store', [
                'employee_id' => $employee->id,
                'evidence_id' => $evidence->id,
                'target_path' => $relativePath,
            ]);

            return;
        }

        $reference = ViolationEmployeeFaceReference::query()->create([
            'employee_id' => $employee->id,
            'source_system' => $sourceSystem,
            'source' => 'recognition_probe',
            'external_ref' => $employee->external_ref,
            'source_image_id' => (string) $evidence->id,
            'group_key' => $employee->business_key,
            'disk' => 'faceid_references',
            'path' => $relativePath,
            'file_name' => basename($relativePath),
            'mime_type' => $evidence->mime_type,
            'file_size' => $evidence->file_size,
            'sha1' => $evidence->sha1,
            'is_primary' => ! $employee->faceReferences()->where('is_active', true)->exists(),
            'is_active' => true,
            'imported_at' => now(),
            'last_synced_at' => now(),
            'meta' => $meta,
        ]);

        if ($reference->is_primary) {
            $employee->faceReferences()
                ->where('id', '!=', $reference->id)
                ->update(['is_primary' => false]);
        }
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

    private function refreshFaceReferenceManifestSilently(): void
    {
        try {
            $manifest = $this->faceReferenceManifest->exportActiveManifest();
        } catch (\Throwable $exception) {
            Log::warning('Failed to refresh face reference manifest', [
                'error' => $exception->getMessage(),
            ]);

            return;
        }

        $rebuild = $this->faceIdRecognition->requestRuntimeRebuild();
        if (! ($rebuild['ok'] ?? false)) {
            Log::warning('Failed to rebuild faceid runtime after manifest refresh', [
                'error' => $rebuild['error'] ?? 'unknown',
                'http_status' => $rebuild['http_status'] ?? null,
                'manifest_path' => $manifest['path'] ?? null,
                'manifest_count' => $manifest['count'] ?? null,
            ]);
        }
    }

    private function storeEvidence(ViolationIncident $incident, UploadedFile $file, int $index): ViolationEvidence
    {
        $mimeType = (string) ($file->getMimeType() ?: $file->getClientMimeType() ?: 'application/octet-stream');
        $mediaKind = str_starts_with($mimeType, 'video/') ? 'video' : 'photo';
        $extension = strtolower((string) ($file->getClientOriginalExtension() ?: $file->extension() ?: ($mediaKind === 'video' ? 'mp4' : 'jpg')));
        $sourcePath = $this->resolveUploadedFilePath($file);
        $relativePath = 'violations/' . $incident->incident_uid . '/original/' . sprintf('%02d_%s.%s', $index + 1, Str::ulid(), $extension);
        $stream = fopen($sourcePath, 'rb');

        if ($stream === false) {
            throw ValidationException::withMessages([
                'files' => 'Не удалось прочитать загруженный файл на сервере. Повторите попытку.',
            ]);
        }

        try {
            $stored = Storage::disk('public')->put($relativePath, $stream);
        } finally {
            fclose($stream);
        }

        if (! $stored) {
            throw ValidationException::withMessages([
                'files' => 'Не удалось сохранить файл нарушения в хранилище.',
            ]);
        }

        $fileSize = $file->getSize();
        if (! is_int($fileSize) || $fileSize <= 0) {
            $sizeFromDisk = @filesize($sourcePath);
            $fileSize = is_int($sizeFromDisk) ? $sizeFromDisk : null;
        }

        return $incident->evidences()->create([
            'media_role' => 'original',
            'media_kind' => $mediaKind,
            'disk' => 'public',
            'path' => $relativePath,
            'file_name' => $file->getClientOriginalName(),
            'mime_type' => $mimeType,
            'file_size' => $fileSize,
            'sha1' => sha1_file($sourcePath) ?: null,
            'sort_order' => $index,
            'is_primary' => $index === 0,
            'meta' => [
                'original_name' => $file->getClientOriginalName(),
            ],
        ]);
    }

    private function storeRecognitionProbe(ViolationIncident $incident, UploadedFile $file): ViolationEvidence
    {
        $mimeType = (string) ($file->getMimeType() ?: $file->getClientMimeType() ?: 'application/octet-stream');
        $sourcePath = $this->resolveUploadedFilePath($file);
        $extension = strtolower((string) ($file->getClientOriginalExtension() ?: $file->extension() ?: 'jpg'));
        $relativePath = 'violations/' . $incident->incident_uid . '/recognition/' . sprintf('probe_%s.%s', Str::ulid(), $extension);
        $stream = fopen($sourcePath, 'rb');

        if ($stream === false) {
            throw ValidationException::withMessages([
                'recognition_file' => 'Не удалось прочитать фото сотрудника для ручной идентификации.',
            ]);
        }

        try {
            $stored = Storage::disk('public')->put($relativePath, $stream);
        } finally {
            fclose($stream);
        }

        if (! $stored) {
            throw ValidationException::withMessages([
                'recognition_file' => 'Не удалось сохранить фото сотрудника для СБ.',
            ]);
        }

        $fileSize = $file->getSize();
        if (! is_int($fileSize) || $fileSize <= 0) {
            $sizeFromDisk = @filesize($sourcePath);
            $fileSize = is_int($sizeFromDisk) ? $sizeFromDisk : null;
        }

        return $incident->evidences()->create([
            'media_role' => 'recognition_probe',
            'media_kind' => 'photo',
            'disk' => 'public',
            'path' => $relativePath,
            'file_name' => $file->getClientOriginalName(),
            'mime_type' => $mimeType,
            'file_size' => $fileSize,
            'sha1' => sha1_file($sourcePath) ?: null,
            'sort_order' => 0,
            'is_primary' => false,
            'meta' => [
                'original_name' => $file->getClientOriginalName(),
                'purpose' => 'manual_identity_review',
            ],
        ]);
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

        Log::warning('Violation upload file path is unavailable', [
            'original_name' => $file->getClientOriginalName(),
            'client_mime' => $file->getClientMimeType(),
            'error' => $file->getError(),
            'candidates' => array_values($candidates),
        ]);

        throw ValidationException::withMessages([
            'files' => 'Сервер не смог получить временный файл загрузки. Проверьте PHP upload_tmp_dir и права на временную папку.',
        ]);
    }

    private function notifyReviewers(ViolationIncident $incident, string $reporterName): void
    {
        $chatIds = array_values(array_filter(array_map('strval', (array) config('telegram.admin_chat_ids', []))));
        if ($chatIds === []) {
            return;
        }

        $text = implode("\n", [
            '<b>Новое нарушение</b>',
            'ID: #' . e((string) $incident->id),
            'Нарушитель: ' . e((string) ($incident->employee_full_name ?: '—')),
            'Категория: ' . e((string) $incident->category_name),
            'Тип: ' . e((string) $incident->type_name),
            'Кто зафиксировал: ' . e($reporterName),
            'Фото: ' . e((string) $incident->evidence_photo_count) . ' / Видео: ' . e((string) $incident->evidence_video_count),
            'Статус: ' . e((string) $incident->workflow_status),
        ]);

        foreach ($chatIds as $chatId) {
            try {
                $this->telegramMessaging->sendText($chatId, $text);
            } catch (\Throwable $exception) {
                Log::warning('Failed to notify violations reviewers', [
                    'chat_id' => $chatId,
                    'incident_id' => $incident->id,
                    'error' => $exception->getMessage(),
                ]);
            }
        }
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