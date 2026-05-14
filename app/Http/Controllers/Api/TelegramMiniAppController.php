<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GuestVisit;
use App\Models\SpectechRequest;
use App\Models\TelegramBotChat;
use App\Models\Truck;
use App\Models\TruckCategory;
use App\Models\User;
use App\Models\UtilizationRequest;
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
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
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

    public function utilizationTrucks(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);

        if ($chat->approval_status === TelegramBotChat::APPROVAL_BLOCKED) {
            abort(403, 'Доступ заблокирован.');
        }

        $trucks = Truck::query()
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

    public function utilizationRequests(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);

        if ($chat->approval_status === TelegramBotChat::APPROVAL_BLOCKED) {
            abort(403, 'Доступ заблокирован.');
        }

        $user = $this->resolveUtilizationUser($chat);

        $requests = UtilizationRequest::query()
            ->with(['truck:id,name,plate_number'])
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get()
            ->map(fn (UtilizationRequest $item) => $this->formatUtilizationRequest($item))
            ->values();

        return response()->json(['data' => $requests]);
    }

    public function createUtilizationRequest(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);

        if ($chat->approval_status === TelegramBotChat::APPROVAL_BLOCKED) {
            abort(403, 'Доступ заблокирован.');
        }

        $user = $this->resolveUtilizationUser($chat);

        $validated = $request->validate([
            'plate_number'    => ['required', 'string', 'max:32'],
            'driver_name'     => ['required', 'string', 'max:160'],
            'comment'         => ['nullable', 'string', 'max:2000'],
            'photos'          => ['required', 'array', 'min:1', 'max:5'],
            'photos.*'        => ['required', 'string'],
            'create_truck_confirmation' => ['nullable', 'integer', 'min:0', 'max:2'],
        ]);

        $plateNumber = Truck::normalizePlateNumber((string) $validated['plate_number']);
        if ($plateNumber === null) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'plate_number' => 'Укажите номер машины.',
            ]);
        }

        $truck = Truck::query()->where('plate_number', $plateNumber)->first();
        $createTruckConfirmation = (int) ($validated['create_truck_confirmation'] ?? 0);

        if ($truck === null && $createTruckConfirmation < 2) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'plate_number' => 'Такой машины нет в базе. Проверьте номер и подтвердите его ещё раз.',
            ]);
        }

        if ($truck === null) {
            $truck = Truck::query()->firstOrCreate([
                'plate_number' => $plateNumber,
            ], [
                'name' => null,
            ]);
        }

        $requestDate = Carbon::today();

        $photoPaths = [];
        foreach ($validated['photos'] ?? [] as $photoData) {
            if (! is_string($photoData) || trim($photoData) === '') {
                continue;
            }

            $saved = $this->saveBase64Photo($photoData, 'utilization');
            if ($saved !== null) {
                $photoPaths[] = $saved;
            }
        }

        $utilizationRequest = UtilizationRequest::query()->create([
            'user_id' => $user->id,
            'truck_id' => $truck->id,
            'driver_name' => trim((string) $validated['driver_name']),
            'requested_start' => $requestDate,
            'requested_end' => $requestDate->copy(),
            'terminal' => 'miniapp',
            'zone' => 'telegram_miniapp',
            'gate' => null,
            'address' => 'telegram_miniapp',
            'comment' => isset($validated['comment']) ? trim((string) $validated['comment']) : null,
            'status' => UtilizationRequest::STATUS_REVIEWING,
            'photos' => $photoPaths,
            'timeline' => UtilizationRequest::buildInitialTimeline(),
            'source' => 'telegram_miniapp',
            'meta' => [
                'chat_id' => $chat->chat_id,
                'plate_number' => $plateNumber,
            ],
        ]);

        $utilizationRequest->load(['truck:id,name,plate_number', 'user:id,name']);

        $this->notifyUtilizationOperators($utilizationRequest, $chat);

        return response()->json([
            'data' => $this->formatUtilizationRequest($utilizationRequest),
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

    public function operatorSpectechRequests(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $this->resolveSpectechOperator($chat);

        $requests = SpectechRequest::query()
            ->with(['truck:id,name,plate_number', 'user:id,name', 'user.telegramApprovedChat'])
            ->when($request->filled('status'), fn ($query) => $query->where('status', (string) $request->input('status')))
            ->orderByDesc('created_at')
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
            'driver_name' => ['required', 'string', 'max:160'],
            'driver_phone' => ['nullable', 'string', 'max:20'],
            'requested_start' => ['required', 'date', 'after_or_equal:now'],
            'requested_end' => ['required', 'date', 'after:requested_start'],
            'terminal' => ['required', 'string', 'max:10'],
            'zone' => ['required', 'string', 'max:100'],
            'gate' => ['nullable', 'string', 'max:50'],
            'address' => ['required', 'string', 'max:500'],
            'comment' => ['nullable', 'string', 'max:2000'],
            'photos' => ['nullable', 'array', 'max:5'],
            'photos.*' => ['nullable', 'string'],
        ]);

        // Проверить доступность техники перед созданием заявки
        $availabilityService = new SpectechAvailabilityService();
        $startCarbon = Carbon::parse($validated['requested_start']);
        $endCarbon   = Carbon::parse($validated['requested_end']);

        if (! $availabilityService->isTruckAvailable($validated['truck_id'], $startCarbon->toIso8601String(), $endCarbon->toIso8601String())) {
            $freeTruck    = $availabilityService->findFreeAlternativeTruck($validated['truck_id'], $startCarbon->toIso8601String(), $endCarbon->toIso8601String());
            $conflictInfo = $availabilityService->getTypeConflictInfo($validated['truck_id'], $startCarbon->toIso8601String(), $endCarbon->toIso8601String());

            return response()->json([
                'available'        => false,
                'message'          => 'Техника занята на указанный период',
                'free_alternative' => $freeTruck ? [
                    'id'           => $freeTruck->id,
                    'name'         => $freeTruck->name,
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

        $spectechRequest = SpectechRequest::query()->create([
            'user_id' => $user->id,
            'truck_id' => (int) $validated['truck_id'],
            'driver_name' => trim((string) $validated['driver_name']),
            'driver_phone' => isset($validated['driver_phone']) ? trim((string) $validated['driver_phone']) : null,
            'start_date' => Carbon::parse($validated['requested_start'])->toDateString(),
            'end_date' => Carbon::parse($validated['requested_end'])->toDateString(),
            'requested_start' => Carbon::parse($validated['requested_start']),
            'requested_end' => Carbon::parse($validated['requested_end']),
            'terminal' => trim((string) $validated['terminal']),
            'zone' => trim((string) $validated['zone']),
            'gate' => isset($validated['gate']) ? trim((string) $validated['gate']) : null,
            'address' => trim((string) $validated['address']),
            'comment' => isset($validated['comment']) ? trim((string) $validated['comment']) : null,
            'status' => SpectechRequest::STATUS_NEW,
            'photos' => $photoPaths,
            'timeline' => SpectechRequest::buildInitialTimeline(),
        ]);

        $spectechRequest->load(['truck:id,name,plate_number', 'user:id,name']);

        $this->notifySpectechOperators($spectechRequest, $chat);

        return response()->json([
            'data' => $this->formatSpectechRequest($spectechRequest),
        ], 201);
    }

    public function updateOperatorSpectechRequestStatus(Request $request, int $id): JsonResponse
    {
        $chat = $this->authChat($request);
        $this->resolveSpectechOperator($chat);

        $validated = $request->validate([
            'status' => ['required', Rule::in([
                SpectechRequest::STATUS_NEW,
                SpectechRequest::STATUS_DEPARTURE,
                SpectechRequest::STATUS_ON_LOCATION,
                SpectechRequest::STATUS_WORK_STARTED,
                SpectechRequest::STATUS_COMPLETED,
                SpectechRequest::STATUS_RETURNED,
            ])],
        ]);

        $spectechRequest = SpectechRequest::query()
            ->with(['truck:id,name,plate_number', 'user:id,name', 'user.telegramApprovedChat'])
            ->findOrFail($id);

        $timeline = $this->buildUpdatedSpectechTimeline(
            $spectechRequest->timeline ?? SpectechRequest::buildInitialTimeline(),
            $validated['status'],
        );

        $spectechRequest->forceFill([
            'status' => $validated['status'],
            'timeline' => $timeline,
        ])->save();

        return response()->json([
            'data' => $this->formatSpectechRequest($spectechRequest->fresh(['truck:id,name,plate_number', 'user:id,name', 'user.telegramApprovedChat'])),
        ]);
    }

    public function checkSpectechAvailability(Request $request): JsonResponse
    {
        $chat = $this->authChat($request);
        $this->ensureApproved($chat);

        $validated = $request->validate([
            'truck_id'        => 'required|exists:trucks,id',
            'requested_start' => 'required|date',
            'requested_end'   => 'required|date|after:requested_start',
        ]);

        $start = Carbon::parse($validated['requested_start']);
        $end   = Carbon::parse($validated['requested_end']);

        $svc = new SpectechAvailabilityService();

        if ($svc->isTruckAvailable((int) $validated['truck_id'], $start->toIso8601String(), $end->toIso8601String())) {
            return response()->json(['available' => true, 'message' => 'Техника доступна']);
        }

        $freeTruck    = $svc->findFreeAlternativeTruck((int) $validated['truck_id'], $start->toIso8601String(), $end->toIso8601String());
        $conflictInfo = $svc->getTypeConflictInfo((int) $validated['truck_id'], $start->toIso8601String(), $end->toIso8601String());

        return response()->json([
            'available'        => false,
            'message'          => 'Техника занята на указанный период',
            'free_alternative' => $freeTruck ? [
                'id'           => $freeTruck->id,
                'name'         => $freeTruck->name,
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

    private function resolveSpectechOperator(TelegramBotChat $chat): User
    {
        $this->ensureApproved($chat);

        $user = $this->resolveApprovedUser($chat);

        if (! $user->canManageSpectech()) {
            abort(403, 'Доступ к управлению заявками спецтехники запрещён.');
        }

        return $user;
    }

    private function resolveUtilizationUser(TelegramBotChat $chat): User
    {
        $approvedUser = $chat->approvedUser()->first();
        if ($approvedUser) {
            return $approvedUser;
        }

        $linkedUser = $chat->user()->first();
        if ($linkedUser) {
            return $linkedUser;
        }

        $login = 'tg_'.$chat->chat_id;
        $name = $chat->display_full_name
            ?: trim(($chat->first_name ?? '').' '.($chat->last_name ?? ''))
            ?: ('Telegram '.$chat->chat_id);
        $email = $login.'@telegram.local';

        $user = User::query()->firstOrCreate(
            ['login' => $login],
            [
                'name' => $name,
                'email' => $email,
                'phone' => $chat->display_phone,
                'password' => bcrypt(Str::random(40)),
            ]
        );

        $user->forceFill([
            'name' => $name,
            'phone' => $chat->display_phone,
        ])->save();

        if (! $chat->user_id) {
            $chat->forceFill(['user_id' => $user->id])->save();
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
        $approvedUser = $chat->approvedUser;

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
            'user' => $approvedUser ? [
                'id' => $approvedUser->id,
                'name' => $approvedUser->name,
                'phone' => $approvedUser->phone,
            ] : null,
            'can_manage_spectech' => $approvedUser?->canManageSpectech() ?? false,
            'yards' => $chat->yards->map(fn ($y) => ['id' => $y->id, 'name' => $y->name])->values(),
        ];
    }

    private function formatSpectechRequest(SpectechRequest $item): array
    {
        $photos = array_values(array_filter(array_map(
            fn ($photo) => $this->normalizePhotoUrl(is_string($photo) ? $photo : ''),
            $item->photos ?? []
        )));

        return [
            'id' => $item->id,
            'equipment_id' => $item->truck_id,
            'equipment_name' => $item->truck
                ? ($item->truck->name ?: ($item->truck->plate_number ? 'ТС '.$item->truck->plate_number : 'ТС #'.$item->truck_id))
                : '—',
            'plate_number' => $item->truck?->plate_number,
            'driver_name' => $item->driver_name,
            'driver_phone' => $item->driver_phone,
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
            'status_frozen' => $item->isStatusFrozen(),
            'status_frozen_reason' => $item->getStatusFreezeReason(),
            'photos' => $photos,
            'photo_urls' => $photos,
            'timeline' => $item->timeline ?? [],
            'client_name' => $item->user?->name,
            'is_telegram_miniapp' => (bool) ($item->user?->telegramApprovedChat),
            'source_label' => $item->user?->telegramApprovedChat ? 'Telegram Mini App' : 'Веб-кабинет',
            'schedule_id' => $item->schedule_id,
            'from_scheduling' => (bool) $item->from_scheduling,
            'created_at' => $item->created_at?->toIso8601String(),
        ];
    }

    private function buildUpdatedSpectechTimeline(array $timeline, string $newStatus): array
    {
        $statusToTimelineIndex = [
            SpectechRequest::STATUS_NEW => 0,
            SpectechRequest::STATUS_DEPARTURE => 1,
            SpectechRequest::STATUS_ON_LOCATION => 2,
            SpectechRequest::STATUS_WORK_STARTED => 3,
            SpectechRequest::STATUS_COMPLETED => 4,
            SpectechRequest::STATUS_RETURNED => 5,
        ];

        $index = $statusToTimelineIndex[$newStatus] ?? null;
        if ($index === null) {
            return $timeline;
        }

        if (isset($timeline[$index]) && ($timeline[$index]['time'] ?? null) === null) {
            $timeline[$index]['time'] = now()->toIso8601String();
        }

        return $timeline;
    }

    private function saveBase64Photo(string $dataUrl, string $folder = 'spectech'): ?string
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

            $binary = $this->optimizeImageBytes($binary);

            $path = trim($folder, '/').'/'.uniqid('tg_photo_', true).'.'.$ext;
            Storage::disk('public')->put($path, $binary);

            return Storage::disk('public')->url($path);
        } catch (\Throwable) {
            return null;
        }
    }

    private function optimizeImageBytes(string $imageBytes): string
    {
        if ($imageBytes === '' || ! function_exists('imagecreatefromstring') || ! function_exists('imagejpeg')) {
            return $imageBytes;
        }

        $sourceImage = @imagecreatefromstring($imageBytes);

        if ($sourceImage === false) {
            return $imageBytes;
        }

        $sourceWidth = imagesx($sourceImage);
        $sourceHeight = imagesy($sourceImage);

        if ($sourceWidth <= 0 || $sourceHeight <= 0) {
            imagedestroy($sourceImage);

            return $imageBytes;
        }

        $maxWidth = 1600;
        $maxHeight = 1600;
        $quality = 78;

        $scale = min($maxWidth / $sourceWidth, $maxHeight / $sourceHeight, 1);
        $targetWidth = max(1, (int) round($sourceWidth * $scale));
        $targetHeight = max(1, (int) round($sourceHeight * $scale));
        $targetImage = $sourceImage;

        if ($scale < 1) {
            $targetImage = imagecreatetruecolor($targetWidth, $targetHeight);

            if ($targetImage === false) {
                imagedestroy($sourceImage);

                return $imageBytes;
            }

            $background = imagecolorallocate($targetImage, 255, 255, 255);
            imagefill($targetImage, 0, 0, $background);
            imagecopyresampled($targetImage, $sourceImage, 0, 0, 0, 0, $targetWidth, $targetHeight, $sourceWidth, $sourceHeight);
        }

        ob_start();
        imagejpeg($targetImage, null, $quality);
        $optimizedImage = ob_get_clean();

        if ($targetImage !== $sourceImage) {
            imagedestroy($targetImage);
        }

        imagedestroy($sourceImage);

        if (! is_string($optimizedImage) || $optimizedImage === '') {
            return $imageBytes;
        }

        if ($scale >= 1 && strlen($optimizedImage) >= strlen($imageBytes)) {
            return $imageBytes;
        }

        return $optimizedImage;
    }

    private function normalizePhotoUrl(string $photo): ?string
    {
        $photo = trim($photo);
        if ($photo === '') {
            return null;
        }

        if (
            str_starts_with($photo, 'http://') ||
            str_starts_with($photo, 'https://') ||
            str_starts_with($photo, 'data:image') ||
            str_starts_with($photo, '/storage/')
        ) {
            return $photo;
        }

        if (str_starts_with($photo, 'storage/')) {
            return '/'.$photo;
        }

        return Storage::disk('public')->url(ltrim($photo, '/'));
    }

    private function notifySpectechOperators(SpectechRequest $request, TelegramBotChat $chat): void
    {
        $chatIds = array_values(array_filter(array_map('strval', (array) config('telegram.admin_chat_ids', []))));
        if ($chatIds === []) {
            return;
        }

        $text = implode("\n", [
            '<b>Новая заявка на спецтехнику</b>',
            'ID: #'.e((string) $request->id),
            'Заявитель: '.e((string) ($chat->display_full_name ?: $request->user?->name ?: '—')),
            'Техника: '.e((string) ($request->truck?->name ?: 'ТС #'.$request->truck_id)),
            'Номер: '.e((string) ($request->truck?->plate_number ?: 'без номера')),
            'Водитель: '.e((string) ($request->driver_name ?: '—')),
            'Тел. водителя: '.e((string) ($request->driver_phone ?: '—')),
            'Локация: '.e(trim($request->terminal.' / '.$request->zone.($request->gate ? ' / '.$request->gate : ''))),
            'Адрес: '.e((string) $request->address),
            'Фото: '.e((string) count((array) ($request->photos ?? []))),
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

    private function formatUtilizationRequest(UtilizationRequest $item): array
    {
        $plateNumber = $item->truck?->plate_number ?: (is_array($item->meta) ? ($item->meta['plate_number'] ?? null) : null);

        return [
            'id' => $item->id,
            'equipment_id' => $item->truck_id,
            'equipment_name' => $item->truck
                ? ($item->truck->name ?: ($item->truck->plate_number ? 'ТС ' . $item->truck->plate_number : 'ТС #' . $item->truck_id))
                : ($plateNumber ?: '—'),
            'plate_number' => $plateNumber,
            'driver_name' => $item->driver_name,
            'start_date' => $item->requested_start?->toDateString(),
            'end_date' => null,
            'requested_start' => $item->requested_start?->toIso8601String(),
            'requested_end' => null,
            'terminal' => null,
            'zone' => null,
            'gate' => null,
            'address' => null,
            'comment' => $item->comment,
            'status' => UtilizationRequest::normalizeWorkflowStatus($item->status),
            'status_label' => UtilizationRequest::labelFor($item->status),
            'photos' => $item->photos ?? [],
            'photo_urls' => $item->photos ?? [],
            'timeline' => $item->timeline ?? [],
            'client_name' => $item->user?->name,
            'source' => $item->source,
            'created_at' => $item->created_at?->toIso8601String(),
        ];
    }

    private function notifyUtilizationOperators(UtilizationRequest $request, TelegramBotChat $chat): void
    {
        $chatIds = array_values(array_filter(array_map('strval', (array) config('telegram.admin_chat_ids', []))));
        if ($chatIds === []) {
            return;
        }

        $plateNumber = $request->truck?->plate_number ?: (is_array($request->meta) ? ($request->meta['plate_number'] ?? null) : null);

        $text = implode("\n", [
            '<b>Новая заявка на аварийный выезд</b>',
            'ID: #' . e((string) $request->id),
            'Заявитель: ' . e((string) ($chat->display_full_name ?: $request->user?->name ?: '—')),
            'Машина: ' . e((string) ($plateNumber ?: 'без номера')),
            'Водитель: ' . e((string) ($request->driver_name ?: '—')),
            'Дата: ' . e((string) ($request->requested_start?->format('d.m.Y') ?: '—')),
            'Фото: ' . e((string) count((array) ($request->photos ?? []))),
            'Комментарий: ' . e((string) ($request->comment ?: '—')),
        ]);

        foreach ($chatIds as $chatId) {
            try {
                $this->telegramMessaging->sendText($chatId, $text);
            } catch (\Throwable $exception) {
                Log::warning('Failed to notify utilization operator about miniapp request', [
                    'chat_id' => $chatId,
                    'utilization_request_id' => $request->id,
                    'error' => $exception->getMessage(),
                ]);
            }
        }
    }
}
