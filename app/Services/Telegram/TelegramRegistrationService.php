<?php

namespace App\Services\Telegram;

use App\Models\Role;
use App\Models\TelegramBotChat;
use App\Models\User;
use App\Models\Yard;
use App\Services\TelegramMessagingService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class TelegramRegistrationService
{
    public const ROLE_NAME = 'Telegram приглашающий';

    public function __construct(private TelegramMessagingService $messaging)
    {
    }

    /**
     * Сохранить заявку: пользователь представился ФИО + телефоном через Mini App.
     */
    public function registerOrUpdateApplicant(TelegramBotChat $chat, string $fullName, string $phone): TelegramBotChat
    {
        if ($chat->approval_status === TelegramBotChat::APPROVAL_BLOCKED) {
            return $chat;
        }

        $chat->forceFill([
            'display_full_name' => trim($fullName),
            'display_phone' => trim($phone),
            'approval_status' => TelegramBotChat::APPROVAL_AWAITING_REVIEW,
            'rejection_reason' => null,
            'last_interaction_at' => now(),
        ])->save();

        $this->notifyAdmins($chat);

        return $chat->fresh();
    }

    /**
     * Одобрить заявку: создаёт/привязывает User, синхронит площадки.
     *
     * @param array<int> $yardIds
     */
    public function approve(TelegramBotChat $chat, array $yardIds, User $admin): TelegramBotChat
    {
        return DB::transaction(function () use ($chat, $yardIds, $admin) {
            $user = $this->ensureInviterUser($chat);

            $validYardIds = Yard::query()->whereIn('id', $yardIds)->pluck('id')->all();
            $chat->yards()->sync($validYardIds);

            $chat->forceFill([
                'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
                'approved_user_id' => $user->id,
                'approved_by' => $admin->id,
                'approved_at' => now(),
                'rejection_reason' => null,
            ])->save();

            $this->notifyApproved($chat);

            return $chat->fresh(['yards', 'approvedUser']);
        });
    }

    public function reject(TelegramBotChat $chat, string $reason, User $admin): TelegramBotChat
    {
        $chat->forceFill([
            'approval_status' => TelegramBotChat::APPROVAL_REJECTED,
            'rejection_reason' => $reason,
            'approved_by' => $admin->id,
            'approved_at' => now(),
        ])->save();

        $this->safeSend($chat->chat_id, "Ваша заявка отклонена.\nПричина: " . $reason);

        return $chat->fresh();
    }

    public function block(TelegramBotChat $chat, User $admin): TelegramBotChat
    {
        if ($chat->approved_user_id) {
            User::query()->whereKey($chat->approved_user_id)->update([
                'is_telegram_guest_inviter' => false,
            ]);
        }

        $chat->forceFill([
            'approval_status' => TelegramBotChat::APPROVAL_BLOCKED,
            'approved_by' => $admin->id,
            'approved_at' => now(),
        ])->save();

        $chat->yards()->sync([]);

        $this->safeSend($chat->chat_id, 'Доступ к функциям бота заблокирован администратором.');

        return $chat->fresh();
    }

    /**
     * @param array<int> $yardIds
     */
    public function syncYards(TelegramBotChat $chat, array $yardIds): TelegramBotChat
    {
        $validYardIds = Yard::query()->whereIn('id', $yardIds)->pluck('id')->all();
        $chat->yards()->sync($validYardIds);

        return $chat->fresh(['yards']);
    }

    private function ensureInviterUser(TelegramBotChat $chat): User
    {
        $user = $chat->approvedUser()->first();

        if (!$user) {
            $login = 'tg_' . $chat->chat_id;
            $user = User::query()->where('login', $login)->first();
        }

        $name = $chat->display_full_name
            ?: trim(($chat->first_name ?? '') . ' ' . ($chat->last_name ?? ''))
            ?: ('Telegram ' . $chat->chat_id);

        $payload = [
            'name' => $name,
            'login' => $user->login ?? ('tg_' . $chat->chat_id),
            'phone' => $chat->display_phone,
            'is_telegram_guest_inviter' => true,
        ];

        if (!$user) {
            $payload['password'] = bcrypt(Str::random(40));
            $user = User::query()->create($payload);
        } else {
            $user->fill($payload)->save();
        }

        $role = Role::firstOrCreate(['name' => self::ROLE_NAME], ['level' => 0]);

        if (!$user->roles()->where('roles.id', $role->id)->exists()) {
            $user->roles()->attach($role->id);
        }

        return $user;
    }

    private function notifyAdmins(TelegramBotChat $chat): void
    {
        $adminChatIds = (array) config('telegram.admin_chat_ids', []);

        if (empty($adminChatIds)) {
            return;
        }

        $text = implode("\n", [
            '<b>Новая заявка в Telegram-бот</b>',
            'ФИО: ' . e((string) $chat->display_full_name),
            'Телефон: ' . e((string) $chat->display_phone),
            'Username: ' . e('@' . ($chat->username ?? '—')),
            'Chat ID: ' . e($chat->chat_id),
        ]);

        foreach ($adminChatIds as $adminChatId) {
            $this->safeSend((string) $adminChatId, $text);
        }
    }

    private function notifyApproved(TelegramBotChat $chat): void
    {
        $miniAppUrl = config('telegram.mini_app.url');

        $options = [];
        if ($miniAppUrl) {
            $options['reply_markup'] = json_encode([
                'inline_keyboard' => [[
                    ['text' => 'Открыть кабинет', 'web_app' => ['url' => $miniAppUrl]],
                ]],
            ], JSON_UNESCAPED_UNICODE);
        }

        $text = "Ваша заявка одобрена. Теперь вы можете создавать гостевые визиты.";

        $this->safeSend($chat->chat_id, $text, $options);
    }

    private function safeSend(string $chatId, string $text, array $options = []): void
    {
        try {
            $this->messaging->sendText($chatId, $text, $options);
        } catch (\Throwable $exception) {
            Log::warning('Telegram registration notification failed', [
                'chat_id' => $chatId,
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
