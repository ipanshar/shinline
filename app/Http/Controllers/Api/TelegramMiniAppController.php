<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GuestVisit;
use App\Models\SpectechRequest;
use App\Models\SpectechSchedule;
use App\Models\TelegramBotChat;
use App\Models\Truck;
use App\Models\TruckCategory;
use App\Models\User;
use App\Models\Visitor;
use App\Services\ExitPermitService;
use App\Services\GuestVisitService;
use App\Services\SpectechAvailabilityService;
use App\Services\Telegram\TelegramRegistrationService;
use App\Services\Telegram\TelegramWebAppAuthService;
use App\Services\TelegramMessagingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class TelegramMiniAppController extends Controller
{
    public function __construct(
        private TelegramWebAppAuthService $auth,
        private TelegramRegistrationService $registration,
        private GuestVisitService $guestVisitService,
        private ExitPermitService $exitPermitService,
        private TelegramMessagingService $telegramMessaging,
    ) {}

    public function session(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);

        return response()->json([
            'data' => $this->buildSessionPayload($chat),
        ]);
    }

    public function register(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);

        $validated = $request->validate([
            'full_name' => ['required', 'string', 'max:160'],
            'phone' => ['required', 'string', 'max:32'],
        ]);

        if ($chat->approval_status === TelegramBotChat::APPROVAL_BLOCKED) {
            abort(403, 'Доступ заблокирован.');
        }

        $chat = $this->registration->registerOrUpdateApplicant($chat, $validated['full_name'], $validated['phone']);

        return response()->json(['data' => $this->buildSessionPayload($chat)]);
    }

    public function yards(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $this->ensureApproved($chat);

        return response()->json([
            'data' => $chat->yards()->orderBy('name')->get(['yards.id', 'yards.name']),
        ]);
    }

    public function visits(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $this->ensureApproved($chat);

        $userId = $chat->approved_user_id;

        $visits = GuestVisit::query()
            ->with(['yard:id,name', 'vehicles:id,guest_visit_id,plate_number,brand,model,color,comment'])
            ->where('created_by_user_id', $userId)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get();

        return response()->json(['data' => $visits]);
    }

    public function createVisit(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $this->ensureApproved($chat);

        $allowedYardIds = $chat->yards()->pluck('yards.id')->all();

        $validated = $this->validateVisitPayload($request, $allowedYardIds);
        $user = $this->resolveApprovedUser($chat);

        $payload = $this->buildVisitPayload($validated, $user, $chat);

        $guestVisit = $this->guestVisitService->create($payload, $user);

        return response()->json(['data' => $guestVisit], 201);
    }

    public function updateVisit(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $this->ensureApproved($chat);

        $allowedYardIds = $chat->yards()->pluck('yards.id')->all();
        $validated = $this->validateVisitPayload($request, $allowedYardIds, true);
        $user = $this->resolveApprovedUser($chat);
        $guestVisit = $this->resolveOwnedVisit((int) $validated['id'], $user->id);

        $updatedVisit = $this->guestVisitService->update(
            $guestVisit,
            $this->buildVisitPayload($validated, $user, $chat),
            $user,
        );

        return response()->json(['data' => $updatedVisit]);
    }

    public function cancelVisit(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $this->ensureApproved($chat);

        $validated = $request->validate([
            'id' => ['required', 'integer'],
        ]);

        $user = $this->resolveApprovedUser($chat);
        $guestVisit = $this->resolveOwnedVisit((int) $validated['id'], $user->id);

        return response()->json([
            'data' => $this->guestVisitService->cancel($guestVisit, $user),
        ]);
    }

    public function activeVisitors(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $this->ensureApproved($chat);

        $allowedYardIds = $chat->yards()->pluck('yards.id')->all();
        $yardId = $request->integer('yard_id') ?: null;

        if ($yardId && ! in_array($yardId, $allowedYardIds, true)) {
            abort(403, 'Двор недоступен для вашего Telegram-пользователя.');
        }

        $visitors = Visitor::query()
            ->with(['yard:id,name', 'truck:id,plate_number'])
            ->whereIn('yard_id', $allowedYardIds)
            ->when($yardId, fn ($query) => $query->where('yard_id', $yardId))
            ->whereNull('exit_date')
            ->where('confirmation_status', Visitor::CONFIRMATION_CONFIRMED)
            ->orderByDesc('entry_date')
            ->limit(100)
            ->get()
            ->map(function (Visitor $visitor) {
                $exitPermit = $this->exitPermitService->findActiveForVisitor($visitor);

                return [
                    'id' => $visitor->id,
                    'yard_id' => $visitor->yard_id,
                    'yard' => $visitor->yard ? ['id' => $visitor->yard->id, 'name' => $visitor->yard->name] : null,
                    'truck_id' => $visitor->truck_id,
                    'plate_number' => $visitor->plate_number ?: ($visitor->truck?->plate_number ?? ''),
                    'entry_date' => $visitor->entry_date,
                    'company' => $visitor->company,
                    'name' => $visitor->name,
                    'exit_permit_required' => $this->exitPermitService->isRequiredForVisitor($visitor),
                    'has_active_exit_permit' => $exitPermit !== null,
                    'exit_permit' => $exitPermit ? [
                        'id' => $exitPermit->id,
                        'valid_until' => $exitPermit->valid_until,
                        'comment' => $exitPermit->comment,
                    ] : null,
                ];
            })
            ->values();

        return response()->json(['data' => $visitors]);
    }

    public function createExitPermit(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $this->ensureApproved($chat);

        $allowedYardIds = $chat->yards()->pluck('yards.id')->all();

        $validated = $request->validate([
            'visitor_id' => ['required', 'integer', 'exists:visitors,id'],
            'valid_until' => ['nullable', 'date', 'after:now'],
            'comment' => ['nullable', 'string', 'max:500'],
        ]);

        $visitor = Visitor::query()
            ->with(['truck', 'yard'])
            ->whereKey($validated['visitor_id'])
            ->whereNull('exit_date')
            ->where('confirmation_status', Visitor::CONFIRMATION_CONFIRMED)
            ->firstOrFail();

        if (! in_array((int) $visitor->yard_id, $allowedYardIds, true)) {
            abort(403, 'Двор визита недоступен для вашего Telegram-пользователя.');
        }

        $user = $chat->approvedUser()->first();
        if (! $user) {
            abort(403, 'Связанный пользователь не найден.');
        }

        $exitPermit = $this->exitPermitService->createForVisitor(
            $visitor,
            $user,
            $chat,
            isset($validated['valid_until']) ? Carbon::parse($validated['valid_until']) : null,
            $validated['comment'] ?? null,
        );

        return response()->json([
            'data' => $exitPermit->fresh(['yard:id,name', 'truck:id,plate_number']),
        ], 201);
    }

    public function spectechTrucks(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $this->ensureApproved($chat);

        $categoryId = TruckCategory::query()->where('name', 'Спец техника')->value('id');

        $trucks = Truck::query()
            ->when($categoryId, fn ($query) => $query->where('truck_category_id', $categoryId))
            ->when($request->filled('search'), function ($query) use ($request) {
                $search = (string) $request->input('search');
                $query->where(function ($nested) use ($search) {
                    $nested->where('name', 'like', "%{$search}%")
                        ->orWhere('plate_number', 'like', "%{$search}%");
                });
            })
            ->orderByDesc('created_at')
            ->get(['id', 'name', 'plate_number']);

        return response()->json(['data' => $trucks]);
    }

    public function spectechRequests(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $this->ensureApproved($chat);
        $user = $this->resolveApprovedUser($chat);

        $requests = SpectechRequest::query()
            ->with(['truck:id,name,plate_number'])
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn (SpectechRequest $item) => $this->formatSpectechRequest($item))
            ->values();

        return response()->json(['data' => $requests]);
    }

    public function createSpectechRequest(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $this->ensureApproved($chat);
        $user = $this->resolveApprovedUser($chat);

        $validated = $request->validate([
            'truck_id' => ['required', 'integer', 'exists:trucks,id'],
            'requested_start' => ['required', 'date', 'after_or_equal:now'],
            'requested_end' => ['required', 'date', 'after:requested_start'],
            'terminal' => ['required', 'string', 'max:10'],
            'zone' => ['required', 'string', 'max:100'],
            'gate' => ['nullable', 'string', 'max:50'],
            'address' => ['required', 'string', 'max:500'],
            'comment' => ['nullable', 'string', 'max:2000'],
            'photos' => ['nullable', 'array', 'max:3'],
            'photos.*' => ['nullable', 'string'],
        ]);

        $requestedStart = Carbon::parse($validated['requested_start']);
        $requestedEnd = Carbon::parse($validated['requested_end']);
        $truck = Truck::query()->findOrFail((int) $validated['truck_id']);
        $availabilityService = new SpectechAvailabilityService;

        if (! $availabilityService->isTruckAvailable(
            $truck->id,
            $requestedStart->toIso8601String(),
            $requestedEnd->toIso8601String(),
        )) {
            $freeTruck = $availabilityService->findFreeAlternativeTruck(
                $truck->id,
                $requestedStart->toIso8601String(),
                $requestedEnd->toIso8601String(),
            );

            $conflictInfo = $availabilityService->getTypeConflictInfo(
                $truck->id,
                $requestedStart->toIso8601String(),
                $requestedEnd->toIso8601String(),
            );

            return response()->json([
                'message' => 'Выбранная техника занята на указанный период',
                'conflict' => true,
                'free_alternative' => $freeTruck ? [
                    'id' => $freeTruck->id,
                    'name' => $freeTruck->name,
                    'plate_number' => $freeTruck->plate_number,
                ] : null,
                'conflict_info' => $conflictInfo,
            ], 409);
        }

        $photoPaths = [];
        foreach ($validated['photos'] ?? [] as $photoData) {
            if (! is_string($photoData) || trim($photoData) === '') {
                continue;
            }

            $saved = $this->saveBase64Photo($photoData);
            if ($saved !== null) {
                $photoPaths[] = $saved;
            }
        }

        $typeKey = $this->extractEquipmentTypeKey($truck->name ?? '');

        $spectechRequest = DB::transaction(function () use ($user, $validated, $requestedStart, $requestedEnd, $truck, $typeKey, $photoPaths) {
            $schedule = SpectechSchedule::query()->create([
                'user_id' => $user->id,
                'truck_id' => $truck->id,
                'equipment_type_key' => $typeKey ?: ($truck->name ?? 'Спецтехника'),
                'equipment_type_label' => $typeKey ?: ($truck->name ?? 'Спецтехника'),
                'assigned_truck_name' => $truck->name.($truck->plate_number ? " ({$truck->plate_number})" : ''),
                'scheduled_start' => $requestedStart,
                'scheduled_end' => $requestedEnd,
                'purpose' => isset($validated['comment']) ? trim((string) $validated['comment']) : 'Заявка на спецтехнику',
                'address' => trim((string) $validated['address']),
                'notes' => isset($validated['comment']) ? trim((string) $validated['comment']) : null,
                'status' => SpectechSchedule::STATUS_PENDING,
            ]);

            return SpectechRequest::query()->create([
                'user_id' => $user->id,
                'truck_id' => $truck->id,
                'start_date' => $requestedStart->toDateString(),
                'end_date' => $requestedEnd->toDateString(),
                'requested_start' => $requestedStart,
                'requested_end' => $requestedEnd,
                'terminal' => trim((string) $validated['terminal']),
                'zone' => trim((string) $validated['zone']),
                'gate' => isset($validated['gate']) ? trim((string) $validated['gate']) : null,
                'address' => trim((string) $validated['address']),
                'comment' => isset($validated['comment']) ? trim((string) $validated['comment']) : null,
                'status' => SpectechRequest::STATUS_NEW,
                'photos' => $photoPaths,
                'timeline' => SpectechRequest::buildInitialTimeline(),
                'schedule_id' => $schedule->id,
            ]);
        });

        $spectechRequest->load(['truck:id,name,plate_number', 'user:id,name']);

        $this->notifySpectechOperators($spectechRequest, $chat);

        return response()->json([
            'data' => $this->formatSpectechRequest($spectechRequest),
        ], 201);
    }

    public function checkSpectechAvailability(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $this->ensureApproved($chat);

        $validated = $request->validate([
            'truck_id' => ['required', 'integer', 'exists:trucks,id'],
            'requested_start' => ['required', 'date'],
            'requested_end' => ['required', 'date', 'after:requested_start'],
        ]);

        $requestedStart = Carbon::parse($validated['requested_start']);
        $requestedEnd = Carbon::parse($validated['requested_end']);
        $availabilityService = new SpectechAvailabilityService;

        $isAvailable = $availabilityService->isTruckAvailable(
            (int) $validated['truck_id'],
            $requestedStart->toIso8601String(),
            $requestedEnd->toIso8601String(),
        );

        if ($isAvailable) {
            return response()->json([
                'available' => true,
                'message' => 'Техника доступна',
            ]);
        }

        $freeTruck = $availabilityService->findFreeAlternativeTruck(
            (int) $validated['truck_id'],
            $requestedStart->toIso8601String(),
            $requestedEnd->toIso8601String(),
        );

        $conflictInfo = $availabilityService->getTypeConflictInfo(
            (int) $validated['truck_id'],
            $requestedStart->toIso8601String(),
            $requestedEnd->toIso8601String(),
        );

        return response()->json([
            'available' => false,
            'message' => 'Выбранная техника занята на указанный период',
            'free_alternative' => $freeTruck ? [
                'id' => $freeTruck->id,
                'name' => $freeTruck->name,
                'plate_number' => $freeTruck->plate_number,
            ] : null,
            'conflict_info' => $conflictInfo,
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

    private function ensureApproved(TelegramBotChat $chat): void
    {
        if ($chat->approval_status !== TelegramBotChat::APPROVAL_APPROVED) {
            abort(403, 'Заявка не одобрена.');
        }

        if (! $chat->approved_user_id) {
            abort(403, 'Связанный пользователь не назначен.');
        }
    }

    private function resolveApprovedUser(TelegramBotChat $chat): User
    {
        $user = $chat->approvedUser()->first();

        if (! $user) {
            abort(403, 'Связанный пользователь не найден.');
        }

        return $user;
    }

    private function resolveOwnedVisit(int $visitId, int $userId): GuestVisit
    {
        return GuestVisit::query()
            ->with(['yard:id,name', 'vehicles:id,guest_visit_id,plate_number,brand,model,color,comment'])
            ->whereKey($visitId)
            ->where('created_by_user_id', $userId)
            ->firstOrFail();
    }

    private function validateVisitPayload(Request $request, array $allowedYardIds, bool $includeId = false): array
    {
        $rules = [
            'yard_id' => ['required', 'integer', Rule::in($allowedYardIds)],
            'guest_full_name' => ['required', 'string', 'max:160'],
            'guest_phone' => ['required', 'string', 'max:32'],
            'guest_position' => ['required', 'string', 'max:160'],
            'guest_company_name' => ['nullable', 'string', 'max:160'],
            'guest_iin' => ['nullable', 'string', 'max:32'],
            'visit_starts_at' => ['required', 'date'],
            'visit_ends_at' => [
                'nullable',
                'date',
                'after_or_equal:visit_starts_at',
                Rule::requiredIf(fn () => $request->input('permit_kind') === GuestVisit::PERMIT_KIND_MULTI_TIME),
            ],
            'permit_kind' => ['required', Rule::in([GuestVisit::PERMIT_KIND_ONE_TIME, GuestVisit::PERMIT_KIND_MULTI_TIME])],
            'comment' => ['required', 'string', 'max:500'],
            'vehicles' => ['nullable', 'array'],
            'vehicles.*.id' => ['nullable', 'integer'],
            'vehicles.*.plate_number' => ['required_with:vehicles', 'string', 'max:32'],
            'vehicles.*.brand' => ['nullable', 'string', 'max:160'],
            'vehicles.*.model' => ['nullable', 'string', 'max:160'],
            'vehicles.*.color' => ['nullable', 'string', 'max:160'],
            'vehicles.*.comment' => ['nullable', 'string', 'max:500'],
        ];

        if ($includeId) {
            $rules = ['id' => ['required', 'integer']] + $rules;
        }

        return $request->validate($rules);
    }

    private function buildVisitPayload(array $validated, User $user, TelegramBotChat $chat): array
    {
        return array_merge($validated, [
            'host_name' => $user->name,
            'host_phone' => $user->phone ?: ($chat->display_phone ?? 'не указан'),
            'source' => GuestVisit::SOURCE_TELEGRAM_BOT,
            'visit_starts_at' => Carbon::parse($validated['visit_starts_at'])->toDateTimeString(),
            'visit_ends_at' => isset($validated['visit_ends_at']) ? Carbon::parse($validated['visit_ends_at'])->toDateTimeString() : null,
            'vehicles' => $validated['vehicles'] ?? [],
        ]);
    }

    private function buildSessionPayload(TelegramBotChat $chat): array
    {
        $chat->loadMissing(['yards:id,name', 'approvedUser:id,name,phone']);

        return [
            'chat_id' => $chat->chat_id,
            'approval_status' => $chat->approval_status,
            'rejection_reason' => $chat->rejection_reason,
            'profile' => [
                'full_name' => $chat->display_full_name,
                'phone' => $chat->display_phone,
                'username' => $chat->username,
                'first_name' => $chat->first_name,
                'last_name' => $chat->last_name,
            ],
            'user' => $chat->approvedUser ? [
                'id' => $chat->approvedUser->id,
                'name' => $chat->approvedUser->name,
                'phone' => $chat->approvedUser->phone,
            ] : null,
            'yards' => $chat->yards->map(fn ($y) => ['id' => $y->id, 'name' => $y->name])->values(),
        ];
    }

    private function formatSpectechRequest(SpectechRequest $item): array
    {
        return [
            'id' => $item->id,
            'equipment_id' => $item->truck_id,
            'equipment_name' => $item->truck
                ? ($item->truck->name ?: ($item->truck->plate_number ? 'ТС '.$item->truck->plate_number : 'ТС #'.$item->truck_id))
                : '—',
            'plate_number' => $item->truck?->plate_number,
            'start_date' => $item->start_date?->toDateString(),
            'end_date' => $item->end_date?->toDateString(),
            'requested_start' => $item->requested_start?->toIso8601String(),
            'requested_end' => $item->requested_end?->toIso8601String(),
            'terminal' => $item->terminal,
            'zone' => $item->zone,
            'gate' => $item->gate,
            'address' => $item->address,
            'comment' => $item->comment,
            'status' => $item->status,
            'status_label' => SpectechRequest::STATUS_LABELS[$item->status] ?? $item->status,
            'photos' => collect($item->photos ?? [])->map(function ($photo) {
                $value = is_string($photo) ? trim($photo) : '';
                if ($value === '') {
                    return null;
                }

                if (
                    str_starts_with($value, 'http://') ||
                    str_starts_with($value, 'https://') ||
                    str_starts_with($value, 'data:image') ||
                    str_starts_with($value, '/storage/')
                ) {
                    return $value;
                }

                if (str_starts_with($value, 'storage/')) {
                    return '/'.$value;
                }

                return Storage::disk('public')->url(ltrim($value, '/'));
            })->filter()->values()->all(),
            'timeline' => $item->timeline ?? [],
            'client_name' => $item->user?->name,
            'created_at' => $item->created_at?->toIso8601String(),
        ];
    }

    private function extractEquipmentTypeKey(string $name): string
    {
        $cleaned = preg_replace('/[\s]+[№#]?\d+\s*$/', '', trim($name));

        return trim($cleaned ?: $name);
    }

    private function saveBase64Photo(string $dataUrl): ?string
    {
        if (! str_starts_with($dataUrl, 'data:image')) {
            return null;
        }

        try {
            $parts = explode(',', $dataUrl, 2);
            if (count($parts) !== 2) {
                return null;
            }

            preg_match('/image\/(\w+)/', $parts[0], $matches);
            $ext = isset($matches[1]) ? strtolower($matches[1]) : 'jpg';
            $ext = $ext === 'jpeg' ? 'jpg' : $ext;
            $binary = base64_decode($parts[1], true);

            if ($binary === false) {
                return null;
            }

            $path = 'spectech/'.uniqid('tg_photo_', true).'.'.$ext;
            Storage::disk('public')->put($path, $binary);

            return Storage::disk('public')->url($path);
        } catch (\Throwable) {
            return null;
        }
    }

    private function notifySpectechOperators(SpectechRequest $request, TelegramBotChat $chat): void
    {
        $chatIds = array_values(array_filter(array_map('strval', (array) config('telegram.admin_chat_ids', []))));
        if ($chatIds === []) {
            return;
        }

        $text = implode("\n", [
            '<b>Новая заявка на спецтехнику (Mini App)</b>',
            'ID: #'.e((string) $request->id),
            'Заявитель: '.e((string) ($chat->display_full_name ?: $request->user?->name ?: '—')),
            'Техника: '.e((string) ($request->truck?->name ?: 'ТС #'.$request->truck_id)),
            'Номер: '.e((string) ($request->truck?->plate_number ?: 'без номера')),
            'Локация: '.e(trim($request->terminal.' / '.$request->zone.($request->gate ? ' / '.$request->gate : ''))),
            'Адрес: '.e((string) $request->address),
            'Комментарий: '.e((string) ($request->comment ?: '—')),
        ]);

        foreach ($chatIds as $chatId) {
            try {
                $this->telegramMessaging->sendText($chatId, $text);
            } catch (\Throwable $exception) {
                Log::warning('Failed to notify spectech operator about miniapp request', [
                    'chat_id' => $chatId,
                    'spectech_request_id' => $request->id,
                    'error' => $exception->getMessage(),
                ]);
            }
        }
    }
}
