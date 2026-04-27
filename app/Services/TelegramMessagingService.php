<?php

namespace App\Services;

use Telegram\Bot\Laravel\Facades\Telegram;

class TelegramMessagingService
{
    public function sendText(string $chatId, string $text, array $options = []): void
    {
        Telegram::sendMessage(array_merge([
            'chat_id' => $chatId,
            'text' => $text,
            'parse_mode' => 'HTML',
        ], $options));
    }
}