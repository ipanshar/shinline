<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\TelegramBotService;
use Telegram\Bot\Laravel\Facades\Telegram;

class TelegramController extends Controller
{
    public function __construct(private TelegramBotService $telegramBotService)
    {
    }

   public function sendMessage(Request $request)
    {
        $text = $request->input('message', 'Тестовое сообщение из Laravel');

        Telegram::sendMessage([
            'chat_id' => env('TELEGRAM_CHAT_ID'),
            'text' => $text,
            'parse_mode' => 'HTML', // Или 'Markdown'
        ]);

        return response()->json(['status' => 'Сообщение отправлено']);
    }
    public function webhook(Request $request)
    {
        $this->telegramBotService->handleUpdate($request->all());

        return response()->json(['status' => 'Webhook received']);
    }
   
    public function setWebhook()
    {
        $webhookUrl = env('TELEGRAM_WEBHOOK_URL');

        Telegram::setWebhook(['url' => $webhookUrl]);

        return response()->json(['status' => 'Webhook установлен']);
    }
    public function deleteWebhook()
    {
        Telegram::removeWebhook();

        return response()->json(['status' => 'Webhook удален']);
    }

    public function sendNotification($text)
    {
        // Отправка уведомления в Telegram

        Telegram::sendMessage([
            'chat_id' => env('TELEGRAM_CHAT_ID'),
            'text' => $text,
            'parse_mode' => 'HTML', // Или 'Markdown'
        ]);

        return response()->json(['status' => 'Уведомление отправлено']);
    }
}
