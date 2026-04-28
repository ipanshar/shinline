<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Telegram\ApproveTelegramUserRequest;
use App\Http\Requests\Telegram\RejectTelegramUserRequest;
use App\Http\Requests\Telegram\UpdateTelegramUserYardsRequest;
use App\Models\TelegramBotChat;
use App\Services\Telegram\TelegramRegistrationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TelegramUserAdminController extends Controller
{
    public function __construct(private TelegramRegistrationService $registrationService)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $status = $request->query('status');
        $search = trim((string) $request->query('search'));

        $query = TelegramBotChat::query()
            ->with(['approvedUser:id,name,login,phone', 'approvedBy:id,name', 'yards:id,name'])
            ->orderByDesc('updated_at');

        if ($status && $status !== 'all') {
            $query->where('approval_status', $status);
        }

        if ($search !== '') {
            $like = '%' . $search . '%';
            $query->where(function ($q) use ($like) {
                $q->where('display_full_name', 'like', $like)
                    ->orWhere('display_phone', 'like', $like)
                    ->orWhere('username', 'like', $like)
                    ->orWhere('chat_id', 'like', $like);
            });
        }

        return response()->json([
            'data' => $query->paginate((int) $request->query('per_page', 20)),
        ]);
    }

    public function approve(ApproveTelegramUserRequest $request, TelegramBotChat $chat): JsonResponse
    {
        $updated = $this->registrationService->approve(
            $chat,
            $request->validated('yard_ids'),
            $request->user(),
        );

        return response()->json(['data' => $updated->load(['yards', 'approvedUser'])]);
    }

    public function reject(RejectTelegramUserRequest $request, TelegramBotChat $chat): JsonResponse
    {
        $updated = $this->registrationService->reject(
            $chat,
            $request->validated('reason'),
            $request->user(),
        );

        return response()->json(['data' => $updated]);
    }

    public function block(Request $request, TelegramBotChat $chat): JsonResponse
    {
        abort_unless($request->user()?->hasPermission('telegram_users.block'), 403);

        $updated = $this->registrationService->block($chat, $request->user());

        return response()->json(['data' => $updated]);
    }

    public function updateYards(UpdateTelegramUserYardsRequest $request, TelegramBotChat $chat): JsonResponse
    {
        abort_unless($chat->isApproved(), 422, 'Заявка ещё не одобрена.');

        $updated = $this->registrationService->syncYards(
            $chat,
            $request->validated('yard_ids') ?? [],
        );

        return response()->json(['data' => $updated->load('yards')]);
    }
}
