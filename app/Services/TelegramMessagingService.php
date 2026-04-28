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

    /**
     * Отправить сообщение с inline-кнопкой, открывающей Telegram Mini App.
     */
    public function sendWithMiniAppButton(string $chatId, string $text, string $buttonText, string $miniAppUrl): void
    {
        $this->sendText($chatId, $text, [
            'reply_markup' => json_encode([
                'inline_keyboard' => [[
                    ['text' => $buttonText, 'web_app' => ['url' => $miniAppUrl]],
                ]],
            ], JSON_UNESCAPED_UNICODE),
        ]);
    }
}