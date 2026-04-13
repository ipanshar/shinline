<?php

namespace App\Services;

use App\Jobs\SendTelegramNotificationJob;
use App\Models\DssSetings;
use App\Models\DssTelegramChat;
use App\Models\DssTelegramNotification;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Telegram\Bot\Laravel\Facades\Telegram;

class DssTelegramNotificationManager
{
    public function __construct(private DssTelegramEventRegistry $eventRegistry)
    {
    }

    public function queue(string $eventKey, string $message, array $context = []): bool
    {
        SendTelegramNotificationJob::dispatch($eventKey, $message, $context);

        return true;
    }

    public function sendNow(string $eventKey, string $message, array $context = []): bool
    {
        $rules = DssTelegramNotification::query()
            ->with('chat')
            ->where('event_key', $eventKey)
            ->where('is_enabled', true)
            ->get();

        if ($rules->isEmpty()) {
            return true;
        }

        $sent = false;

        foreach ($rules as $rule) {
            $chat = $rule->chat;

            if (!$chat || !$chat->is_enabled || !$this->shouldSend($rule)) {
                continue;
            }

            try {
                $this->sendToChat($chat, $message, [
                    'disable_notification' => $rule->send_silently || $chat->send_silently_default,
                ]);

                $rule->forceFill([
                    'last_sent_at' => now(),
                    'last_error' => null,
                    'last_error_at' => null,
                ])->save();

                $sent = true;
            } catch (\Throwable $exception) {
                $rule->forceFill([
                    'last_error' => $exception->getMessage(),
                    'last_error_at' => now(),
                ])->save();

                Log::error('DSS Telegram notification delivery failed', [
                    'event_key' => $eventKey,
                    'chat_id' => $chat->chat_id,
                    'rule_id' => $rule->id,
                    'context' => $context,
                    'error' => $exception->getMessage(),
                ]);
            }
        }

        return $sent || $rules->every(fn (DssTelegramNotification $rule) => !$rule->chat || !$rule->chat->is_enabled);
    }

    public function sendTest(DssTelegramChat $chat): bool
    {
        $message = '<b>🧪 Тест Telegram уведомлений</b>' . "\n\n"
            . '<b>Чат:</b> ' . e($chat->name) . "\n"
            . '<b>Chat ID:</b> ' . e($chat->chat_id) . "\n"
            . '<b>Время:</b> ' . now()->format('d.m.Y H:i:s');

        $this->sendToChat($chat, $message, [
            'disable_notification' => $chat->send_silently_default,
        ]);

        return true;
    }

    public function syncDefaultNotificationsForChat(DssTelegramChat $chat): void
    {
        $settingsId = DssSetings::query()->value('id');

        foreach ($this->eventRegistry->definitions() as $definition) {
            DssTelegramNotification::query()->firstOrCreate([
                'telegram_chat_id' => $chat->id,
                'event_key' => $definition['key'],
            ], [
                'dss_setings_id' => $chat->dss_setings_id ?? $settingsId,
                'is_enabled' => $definition['default_enabled'],
                'send_silently' => $definition['default_send_silently'],
                'cooldown_minutes' => $definition['default_cooldown_minutes'],
            ]);
        }
    }

    public function syncDefaultNotificationsForAllChats(): void
    {
        DssTelegramChat::query()->get()->each(function (DssTelegramChat $chat) {
            $this->syncDefaultNotificationsForChat($chat);
        });
    }

    private function shouldSend(DssTelegramNotification $rule): bool
    {
        if ($rule->cooldown_minutes <= 0 || !$rule->last_sent_at instanceof Carbon) {
            return true;
        }

        return $rule->last_sent_at->copy()->addMinutes($rule->cooldown_minutes)->lte(now());
    }

    private function sendToChat(DssTelegramChat $chat, string $message, array $options = []): void
    {
        $payload = [
            'chat_id' => $chat->chat_id,
            'text' => $message,
            'parse_mode' => 'HTML',
        ];

        if ($chat->message_thread_id) {
            $payload['message_thread_id'] = $chat->message_thread_id;
        }

        Telegram::sendMessage(array_merge($payload, $options));
    }
}