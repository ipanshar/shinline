<?php

namespace App\Services\Access;

use App\Models\ViolationEmployee;
use App\Services\Violations\FaceIdRecognitionService;
use App\Services\Violations\TemporaryPassService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;

class DahuaTerminalAccessService
{
    public function __construct(
        private FaceIdRecognitionService $faceIdRecognition,
        private TemporaryPassService $temporaryPasses,
    ) {
    }

    /**
     * @param array<string, mixed> $context
     * @return array{ok: bool, error: ?string, status: int, payload: ?array<string, mixed>}
     */
    public function recognizeAndAuthorize(UploadedFile $file, array $context = []): array
    {
        $recognition = $this->faceIdRecognition->recognize($file);
        if (! ($recognition['ok'] ?? false)) {
            return [
                'ok' => false,
                'error' => $recognition['error'] ?? 'Не удалось распознать лицо.',
                'status' => ($recognition['error_type'] ?? null) === 'service' ? 503 : 422,
                'payload' => null,
            ];
        }

        $payload = is_array($recognition['payload'] ?? null) ? $recognition['payload'] : [];
        $inspectionCandidate = $this->inspectionCandidate($payload);
        $matchedCandidate = $this->matchedCandidate($payload);

        if ($matchedCandidate === null) {
            $decision = [
                'decision' => 'deny',
                'open_door' => false,
                'greeting' => $this->denyGreeting(),
                'reason' => 'not_recognized',
                'employee' => null,
                'recognition' => $this->formatRecognition($payload, $inspectionCandidate, false),
            ];

            $this->logDecision($decision, $context);

            return [
                'ok' => true,
                'error' => null,
                'status' => 200,
                'payload' => $decision,
            ];
        }

        $employeeId = isset($matchedCandidate['employeeId']) ? (int) $matchedCandidate['employeeId'] : 0;
        $employee = $employeeId > 0
            ? ViolationEmployee::query()->with('primaryFaceReference:id,employee_id,path,is_primary')->find($employeeId)
            : null;

        if (! $employee) {
            $decision = [
                'decision' => 'deny',
                'open_door' => false,
                'greeting' => $this->denyGreeting(),
                'reason' => 'employee_not_found',
                'employee' => null,
                'recognition' => $this->formatRecognition($payload, $matchedCandidate, true),
            ];

            $this->logDecision($decision, $context);

            return [
                'ok' => true,
                'error' => null,
                'status' => 200,
                'payload' => $decision,
            ];
        }

        $this->temporaryPasses->refreshTemporaryPassStatus($employee, persist: false);
        [$allowed, $reason] = $this->resolveAccessDecision($employee);

        $decision = [
            'decision' => $allowed ? 'allow' : 'deny',
            'open_door' => $allowed,
            'greeting' => $allowed ? $this->allowGreeting($employee) : $this->denyGreeting($employee),
            'reason' => $reason,
            'employee' => $this->formatEmployee($employee),
            'recognition' => $this->formatRecognition($payload, $matchedCandidate, true),
        ];

        $this->logDecision($decision, $context);

        return [
            'ok' => true,
            'error' => null,
            'status' => 200,
            'payload' => $decision,
        ];
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>|null
     */
    private function matchedCandidate(array $payload): ?array
    {
        if (! (bool) ($payload['matched'] ?? false)) {
            return null;
        }

        $bestMatch = $payload['bestMatch'] ?? null;
        if (is_array($bestMatch)) {
            return $bestMatch;
        }

        foreach ((array) ($payload['candidates'] ?? []) as $candidate) {
            if (is_array($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>|null
     */
    private function inspectionCandidate(array $payload): ?array
    {
        $bestMatch = $payload['bestMatch'] ?? null;
        if (is_array($bestMatch)) {
            return $bestMatch;
        }

        foreach ((array) ($payload['candidates'] ?? []) as $candidate) {
            if (is_array($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    /**
     * @return array{0: bool, 1: string}
     */
    private function resolveAccessDecision(ViolationEmployee $employee): array
    {
        $meta = is_array($employee->meta) ? $employee->meta : [];
        $explicitDecision = $this->metaBoolean($meta, 'terminal_access_enabled');
        if ($explicitDecision !== null) {
            return [$explicitDecision, $explicitDecision ? 'explicitly_allowed' : 'explicitly_denied'];
        }

        if (! $employee->is_active) {
            return [false, 'inactive_employee'];
        }

        if ($employee->person_kind === TemporaryPassService::PERSON_KIND_TEMPORARY_CONTRACTOR) {
            if ($employee->temporary_pass_status !== TemporaryPassService::PASS_STATUS_ACTIVE) {
                return [false, 'temporary_pass_expired'];
            }
        }

        return [true, 'recognized'];
    }

    private function allowGreeting(ViolationEmployee $employee): string
    {
        $meta = is_array($employee->meta) ? $employee->meta : [];
        $customGreeting = trim((string) ($meta['terminal_greeting'] ?? ''));
        if ($customGreeting !== '') {
            return $customGreeting;
        }

        return trim((string) config('services.dahua_terminal.default_greeting', 'Спасибо')) ?: 'Спасибо';
    }

    private function denyGreeting(?ViolationEmployee $employee = null): string
    {
        $meta = is_array($employee?->meta) ? $employee->meta : [];
        $customGreeting = trim((string) ($meta['terminal_deny_greeting'] ?? ''));
        if ($customGreeting !== '') {
            return $customGreeting;
        }

        return trim((string) config('services.dahua_terminal.deny_greeting', 'Доступ запрещен')) ?: 'Доступ запрещен';
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<string, mixed>|null $candidate
     * @return array<string, mixed>
     */
    private function formatRecognition(array $payload, ?array $candidate, bool $matched): array
    {
        $profile = is_array($candidate['profile'] ?? null) ? $candidate['profile'] : [];

        return [
            'matched' => $matched,
            'threshold' => is_numeric($payload['threshold'] ?? null) ? (float) $payload['threshold'] : null,
            'candidate_count' => count((array) ($payload['candidates'] ?? [])),
            'reference_key' => isset($candidate['referenceKey']) ? (string) $candidate['referenceKey'] : null,
            'source' => isset($candidate['source']) ? (string) $candidate['source'] : null,
            'source_label' => isset($profile['sourceLabel']) ? (string) $profile['sourceLabel'] : null,
            'similarity' => is_numeric($candidate['similarity'] ?? null) ? (float) $candidate['similarity'] : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function formatEmployee(ViolationEmployee $employee): array
    {
        return [
            'id' => $employee->id,
            'business_key' => $employee->business_key,
            'full_name' => $employee->full_name,
            'department' => $employee->department,
            'position' => $employee->position,
            'person_kind' => $employee->person_kind,
            'is_active' => (bool) $employee->is_active,
            'temporary_pass_status' => $employee->temporary_pass_status,
            'temporary_pass_issued_at' => $employee->temporary_pass_issued_at?->toIso8601String(),
            'temporary_pass_expires_at' => $employee->temporary_pass_expires_at?->toIso8601String(),
            'reference_image_url' => $employee->primaryFaceReference?->path
                ? $this->referenceImageUrl($employee->primaryFaceReference->path)
                : null,
        ];
    }

    /**
     * @param array<string, mixed> $meta
     */
    private function metaBoolean(array $meta, string $key): ?bool
    {
        if (! array_key_exists($key, $meta)) {
            return null;
        }

        $value = $meta[$key];
        if (is_bool($value)) {
            return $value;
        }

        if (is_int($value) || is_float($value)) {
            return (bool) $value;
        }

        if (! is_string($value)) {
            return null;
        }

        $normalized = strtolower(trim($value));
        if (in_array($normalized, ['1', 'true', 'yes', 'on'], true)) {
            return true;
        }

        if (in_array($normalized, ['0', 'false', 'no', 'off'], true)) {
            return false;
        }

        return null;
    }

    private function referenceImageUrl(string $path): string
    {
        return '/reference-images/' . ltrim(str_replace('\\', '/', $path), '/');
    }

    /**
     * @param array<string, mixed> $decision
     * @param array<string, mixed> $context
     */
    private function logDecision(array $decision, array $context): void
    {
        Log::info('dahua_terminal_access_decision', [
            'decision' => $decision['decision'] ?? null,
            'reason' => $decision['reason'] ?? null,
            'employee_id' => $decision['employee']['id'] ?? null,
            'open_door' => $decision['open_door'] ?? false,
            'device_key' => $context['device_key'] ?? null,
            'device_name' => $context['device_name'] ?? null,
            'device_ip' => $context['device_ip'] ?? null,
        ]);
    }
}