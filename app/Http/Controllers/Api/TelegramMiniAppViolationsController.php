<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TelegramBotChat;
use App\Models\User;
use App\Models\ViolationCategory;
use App\Models\ViolationIncident;
use App\Models\ViolationType;
use App\Services\Telegram\TelegramWebAppAuthService;
use App\Services\Violations\ViolationIncidentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class TelegramMiniAppViolationsController extends Controller
{
    public function __construct(
        private TelegramWebAppAuthService $auth,
        private ViolationIncidentService $incidentService,
    ) {
    }

    public function catalog(Request $request): JsonResponse
    {
        $this->resolveViolationsRecorder($this->authChat($request));

        $categories = ViolationCategory::query()
            ->with(['types' => fn ($query) => $query->where('is_active', true)])
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get()
            ->map(function (ViolationCategory $category) {
                return [
                    'id' => $category->id,
                    'key' => $category->key,
                    'name' => $category->name,
                    'description' => $category->description,
                    'types' => $category->types->map(fn (ViolationType $type) => [
                        'id' => $type->id,
                        'key' => $type->key,
                        'name' => $type->name,
                        'description' => $type->description,
                    ])->values(),
                ];
            })
            ->values();

        return response()->json(['data' => $categories]);
    }

    public function incidents(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $user = $this->resolveViolationsRecorder($chat);

        $items = ViolationIncident::query()
            ->with(['evidences:id,incident_id,media_kind,path,is_primary,sort_order'])
            ->where('reported_by_user_id', $user->id)
            ->orderByDesc('occurred_at')
            ->orderByDesc('id')
            ->limit(30)
            ->get()
            ->map(fn (ViolationIncident $incident) => $this->formatIncident($incident))
            ->values();

        return response()->json(['data' => $items]);
    }

    public function create(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $user = $this->resolveViolationsRecorder($chat);

        $validated = $request->validate([
            'type_id' => ['required', 'integer', 'exists:violation_types,id'],
            'occurred_at' => ['required', 'date'],
            'location_label' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'manual_full_name' => ['required', 'string', 'max:160'],
            'manual_department' => ['nullable', 'string', 'max:160'],
            'manual_position' => ['nullable', 'string', 'max:160'],
            'files' => ['required', 'array', 'min:1', 'max:5'],
            'files.*' => [
                'required',
                'file',
                'max:51200',
                'mimetypes:image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm',
            ],
        ], [
            'files.required' => 'Добавьте хотя бы одно фото или видео.',
            'files.array' => 'Файлы переданы в неверном формате.',
            'files.min' => 'Добавьте хотя бы одно фото или видео.',
            'files.max' => 'Можно прикрепить не больше 5 файлов.',
            'files.*.uploaded' => 'Файл не загрузился на сервер. Обычно это лимит upload_max_filesize или post_max_size. Попробуйте фото меньшего размера.',
            'files.*.file' => 'Один из файлов передан некорректно.',
            'files.*.max' => 'Размер каждого файла не должен превышать 50 МБ.',
            'files.*.mimetypes' => 'Разрешены JPG, PNG, WEBP, HEIC, HEIF и видео MP4, MOV, WEBM.',
        ]);

        /** @var array<int, UploadedFile> $files */
        $files = array_values($request->file('files', []));

        $incident = $this->incidentService->createManualTelegramIncident($user, $chat, $validated, $files);

        return response()->json([
            'data' => $this->formatIncident($incident->load('evidences:id,incident_id,media_kind,path,is_primary,sort_order')),
        ], 201);
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

    private function resolveViolationsRecorder(TelegramBotChat $chat): User
    {
        if ($chat->approval_status !== TelegramBotChat::APPROVAL_APPROVED || ! $chat->approved_user_id) {
            abort(403, 'Заявка не одобрена.');
        }

        $user = $chat->approvedUser()->first();
        if (! $user) {
            abort(403, 'Связанный пользователь не найден.');
        }

        if (! $user->canRecordViolations()) {
            abort(403, 'Доступ к фиксации нарушений запрещён.');
        }

        return $user;
    }

    /**
     * @return array<string, mixed>
     */
    private function formatIncident(ViolationIncident $incident): array
    {
        return [
            'id' => $incident->id,
            'incident_uid' => $incident->incident_uid,
            'workflow_status' => $incident->workflow_status,
            'recognition_status' => $incident->recognition_status,
            'occurred_at' => $incident->occurred_at?->toIso8601String(),
            'category_name' => $incident->category_name,
            'type_name' => $incident->type_name,
            'employee_full_name' => $incident->employee_full_name,
            'employee_department' => $incident->employee_department,
            'description' => $incident->description,
            'location_label' => $incident->location_label,
            'evidence_total_count' => $incident->evidence_total_count,
            'evidence_photo_count' => $incident->evidence_photo_count,
            'evidence_video_count' => $incident->evidence_video_count,
            'evidences' => $incident->evidences->map(fn ($evidence) => [
                'id' => $evidence->id,
                'media_kind' => $evidence->media_kind,
                'url' => Storage::disk('public')->url($evidence->path),
                'is_primary' => (bool) $evidence->is_primary,
            ])->values(),
        ];
    }
}