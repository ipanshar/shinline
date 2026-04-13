<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

class DssNotificationService
{
    public function __construct(private DssTelegramNotificationManager $telegramNotifications)
    {
    }

    public function send(string $eventKey, string $message, array $context = []): bool
    {
        return $this->telegramNotifications->queue($eventKey, $message, $context);
    }

    public function sendNow(string $eventKey, string $message, array $context = []): bool
    {
        try {
            return $this->telegramNotifications->sendNow($eventKey, $message, $context);
        } catch (\Throwable $exception) {
            Log::error('DSS: Не удалось отправить уведомление', [
                'event_key' => $eventKey,
                'error' => $exception->getMessage(),
                'context' => $context,
            ]);

            return false;
        }
    }
}