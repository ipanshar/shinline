<?php

namespace App\Services;

use App\Models\GuestVisit;
use App\Models\Visitor;
use Illuminate\Support\Facades\Log;

class GuestVisitTelegramNotifier
{
    public function __construct(private TelegramMessagingService $telegramMessaging)
    {
    }

    public function notifyArrival(GuestVisit $guestVisit, ?Visitor $visitor = null): void
    {
        $guestVisit->loadMissing(['yard:id,name', 'createdBy.telegramBotChat']);

        $chat = $guestVisit->createdBy?->telegramBotChat;

        if (!$chat) {
            return;
        }

        $message = $this->buildArrivalMessage($guestVisit, $visitor);

        try {
            $this->telegramMessaging->sendText($chat->chat_id, $message);
        } catch (\Throwable $exception) {
            Log::error('Guest visit arrival Telegram notification failed', [
                'guest_visit_id' => $guestVisit->id,
                'user_id' => $guestVisit->created_by_user_id,
                'chat_id' => $chat->chat_id,
                'error' => $exception->getMessage(),
            ]);
        }
    }

    private function buildArrivalMessage(GuestVisit $guestVisit, ?Visitor $visitor = null): string
    {
        $lines = [
            '<b>Гость прибыл на территорию</b>',
            '',
            '<b>Гость:</b> ' . e($guestVisit->guest_full_name),
            '<b>Объект:</b> ' . e($guestVisit->yard?->name ?? 'Не указан'),
            '<b>Время:</b> ' . e(optional($guestVisit->last_entry_at)->format('d.m.Y H:i') ?? now()->format('d.m.Y H:i')),
            '<b>Принимающий:</b> ' . e($guestVisit->host_name),
            '<b>Телефон гостя:</b> ' . e($guestVisit->guest_phone),
        ];

        if ($visitor?->plate_number) {
            $lines[] = '<b>Номер ТС:</b> ' . e($visitor->plate_number);
        }

        if ($guestVisit->comment) {
            $lines[] = '<b>Комментарий:</b> ' . e($guestVisit->comment);
        }

        return implode("\n", $lines);
    }
}