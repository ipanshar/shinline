<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TelegramBotChat;
use App\Models\User;
use App\Models\ViolationEmployee;
use App\Services\Telegram\TelegramWebAppAuthService;
use App\Services\Violations\TemporaryPassService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;

class TelegramMiniAppTemporaryPassController extends Controller
{
    public function __construct(
        private TelegramWebAppAuthService $auth,
        private TemporaryPassService $temporaryPasses,
    ) {
    }

    public function recognize(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $this->resolveTemporaryPassManager($chat);

        $request->validate([
            'photo' => ['required', 'file', 'max:15360', 'mimetypes:image/jpeg,image/png,image/webp,image/heic,image/heif'],
        ]);

        $photo = $request->file('photo');
        if (! $photo instanceof UploadedFile) {
            return response()->json(['message' => 'Фотография не была получена.'], 422);
        }

        $recognition = $this->temporaryPasses->recognizeTemporaryContractor($photo);
        if (! ($recognition['ok'] ?? false)) {
            $status = ($recognition['error_type'] ?? null) === 'service' ? 503 : 422;

            return response()->json([
                'message' => $recognition['error'] ?? 'Не удалось распознать временного сотрудника.',
            ], $status);
        }

        return response()->json([
            'data' => $this->formatRecognitionPayload($recognition['payload'] ?? []),
        ]);
    }

    public function create(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $user = $this->resolveTemporaryPassManager($chat);

        $validated = $request->validate([
            'full_name' => ['required', 'string', 'max:160'],
            'department' => ['nullable', 'string', 'max:160'],
            'position' => ['nullable', 'string', 'max:160'],
            'duration_months' => ['required', 'integer', 'min:1', 'max:6'],
            'confirmed_reference_key' => ['nullable', 'string', 'max:255'],
            'rejected_all' => ['nullable', 'boolean'],
            'photo' => ['required', 'file', 'max:15360', 'mimetypes:image/jpeg,image/png,image/webp,image/heic,image/heif'],
        ]);

        $photo = $request->file('photo');
        if (! $photo instanceof UploadedFile) {
            return response()->json(['message' => 'Фотография не была получена.'], 422);
        }

        $result = $this->temporaryPasses->createFromMiniApp($user, $chat, $validated, $photo);

        return response()->json([
            'data' => [
                'action' => $result['action'],
                'employee' => $this->formatEmployee($result['employee']),
            ],
        ], $result['action'] === 'created' ? 201 : 200);
    }

    public function extend(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $user = $this->resolveTemporaryPassManager($chat);

        $validated = $request->validate([
            'duration_months' => ['required', 'integer', 'min:1', 'max:6'],
            'confirmed_reference_key' => ['required', 'string', 'max:255'],
            'photo' => ['required', 'file', 'max:15360', 'mimetypes:image/jpeg,image/png,image/webp,image/heic,image/heif'],
        ]);

        $photo = $request->file('photo');
        if (! $photo instanceof UploadedFile) {
            return response()->json(['message' => 'Фотография не была получена.'], 422);
        }

        $result = $this->temporaryPasses->extendFromMiniApp($user, $chat, $validated, $photo);

        return response()->json([
            'data' => [
                'action' => 'extended',
                'employee' => $this->formatEmployee($result['employee']),
            ],
        ]);
    }

    private function authChat(Request $request): TelegramBotChat
    {
        $initData = (string) ($request->input('init_data') ?? $request->header('X-Telegram-Init-Data', ''));
        $verified = $this->auth->verify($initData);

        if (! $verified) {
            abort(401, 'Невалидный initData.');
        }

        return $this->auth->resolveChat($verified['user']);
    }

    private function resolveTemporaryPassManager(TelegramBotChat $chat): User
    {
        if ($chat->approval_status !== TelegramBotChat::APPROVAL_APPROVED || ! $chat->approved_user_id) {
            abort(403, 'Заявка не одобрена.');
        }

        $user = $chat->approvedUser()->first();
        if (! $user) {
            abort(403, 'Связанный пользователь не найден.');
        }

        if (! $user->canManageTemporaryPasses()) {
            abort(403, 'Доступ к временным пропускам запрещён.');
        }

        return $user;
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function formatRecognitionPayload(array $payload): array
    {
        $candidates = collect((array) ($payload['candidates'] ?? []))
            ->map(fn ($candidate) => is_array($candidate) ? $this->formatRecognitionCandidate($candidate) : null)
            ->filter()
            ->values();

        return [
            'matched' => (bool) ($payload['matched'] ?? false),
            'threshold' => is_numeric($payload['threshold'] ?? null) ? (float) $payload['threshold'] : null,
            'best_match' => is_array($payload['bestMatch'] ?? null)
                ? $this->formatRecognitionCandidate($payload['bestMatch'])
                : null,
            'candidates' => $candidates,
        ];
    }

    /**
     * @param array<string, mixed> $candidate
     * @return array<string, mixed>
     */
    private function formatRecognitionCandidate(array $candidate): array
    {
        $profile = is_array($candidate['profile'] ?? null) ? $candidate['profile'] : [];

        return [
            'reference_key' => isset($candidate['referenceKey']) ? (string) $candidate['referenceKey'] : null,
            'employee_id' => isset($candidate['employeeId']) ? (int) $candidate['employeeId'] : null,
            'group_key' => isset($candidate['groupKey']) ? (string) $candidate['groupKey'] : null,
            'full_name' => isset($candidate['name']) ? (string) $candidate['name'] : null,
            'department' => isset($profile['department']) ? (string) $profile['department'] : null,
            'position' => isset($profile['role']) ? (string) $profile['role'] : null,
            'source' => isset($candidate['source']) ? (string) $candidate['source'] : null,
            'source_label' => isset($profile['sourceLabel']) ? (string) $profile['sourceLabel'] : null,
            'reference_image_url' => isset($candidate['referenceImageUrl']) ? (string) $candidate['referenceImageUrl'] : null,
            'similarity' => is_numeric($candidate['similarity'] ?? null) ? (float) $candidate['similarity'] : null,
            'person_kind' => isset($profile['personKind']) ? (string) $profile['personKind'] : null,
            'temporary_pass_status' => isset($profile['temporaryPassStatus']) ? (string) $profile['temporaryPassStatus'] : null,
            'temporary_pass_expires_at' => isset($profile['temporaryPassExpiresAt']) ? (string) $profile['temporaryPassExpiresAt'] : null,
            'temporary_pass_issued_at' => isset($profile['temporaryPassIssuedAt']) ? (string) $profile['temporaryPassIssuedAt'] : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function formatEmployee(ViolationEmployee $employee): array
    {
        $employee->loadMissing('primaryFaceReference:id,employee_id,path,is_primary');
        $this->temporaryPasses->refreshTemporaryPassStatus($employee);

        return [
            'id' => $employee->id,
            'business_key' => $employee->business_key,
            'full_name' => $employee->full_name,
            'department' => $employee->department,
            'position' => $employee->position,
            'person_kind' => $employee->person_kind,
            'temporary_pass_status' => $employee->temporary_pass_status,
            'temporary_pass_issued_at' => $employee->temporary_pass_issued_at?->toIso8601String(),
            'temporary_pass_expires_at' => $employee->temporary_pass_expires_at?->toIso8601String(),
            'temporary_pass_duration_months' => $employee->temporary_pass_duration_months,
            'temporary_pass_created_by_name' => $employee->temporary_pass_created_by_name,
            'temporary_pass_last_extended_at' => $employee->temporary_pass_last_extended_at?->toIso8601String(),
            'reference_image_url' => $employee->primaryFaceReference?->path
                ? '/reference-images/' . ltrim(str_replace('\\', '/', $employee->primaryFaceReference->path), '/')
                : null,
        ];
    }
}
