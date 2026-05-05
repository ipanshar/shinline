<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GuestVisit;
use App\Models\User;
use App\Models\TelegramBotChat;
use App\Models\Visitor;
use App\Services\ExitPermitService;
use App\Services\GuestVisitService;
use App\Services\Telegram\TelegramRegistrationService;
use App\Services\Telegram\TelegramWebAppAuthService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

class TelegramMiniAppController extends Controller
{
    public function __construct(
        private TelegramWebAppAuthService $auth,
        private TelegramRegistrationService $registration,
        private GuestVisitService $guestVisitService,
        private ExitPermitService $exitPermitService,
    ) {
    }

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

        if ($yardId && !in_array($yardId, $allowedYardIds, true)) {
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

        if (!in_array((int) $visitor->yard_id, $allowedYardIds, true)) {
            abort(403, 'Двор визита недоступен для вашего Telegram-пользователя.');
        }

        $user = $chat->approvedUser()->first();
        if (!$user) {
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

    private function authChat(Request $request): TelegramBotChat
    {
        $initData = (string) ($request->input('init_data') ?? $request->header('X-Telegram-Init-Data', ''));

        $verified = $this->auth->verify($initData);

        if (!$verified) {
            abort(401, 'Невалидный initData.');
        }

        return $this->auth->resolveChat($verified['user']);
    }

    private function ensureApproved(TelegramBotChat $chat): void
    {
        if ($chat->approval_status !== TelegramBotChat::APPROVAL_APPROVED) {
            abort(403, 'Заявка не одобрена.');
        }

        if (!$chat->approved_user_id) {
            abort(403, 'Связанный пользователь не назначен.');
        }
    }

    private function resolveApprovedUser(TelegramBotChat $chat): User
    {
        $user = $chat->approvedUser()->first();

        if (!$user) {
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
}
