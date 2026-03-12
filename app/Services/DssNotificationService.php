<?php

namespace App\Services;

use App\Http\Controllers\TelegramController;
use Illuminate\Support\Facades\Log;

class DssNotificationService
{
    public function send(string $message): bool
    {
        try {
            (new TelegramController())->sendNotification($message);

            return true;
        } catch (\Throwable $exception) {
            Log::error('DSS: Не удалось отправить уведомление', [
                'error' => $exception->getMessage(),
            ]);

            return false;
        }
    }
}