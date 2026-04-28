<?php

namespace App\Services;

use App\Models\GuestVisit;
use App\Models\TelegramBotChat;
use App\Models\Visitor;
use Illuminate\Support\Facades\Log;

class GuestVisitTelegramNotifier
{
    public function __construct(private TelegramMessagingService $telegramMessaging)
    {
    }

    public function notifyArrival(GuestVisit $guestVisit, ?Visitor $visitor = null, bool $isReentry = false): void
    {
        // Уведомление шлём только по визитам, созданным через Telegram-бот.
        if ($guestVisit->source !== GuestVisit::SOURCE_TELEGRAM_BOT) {
            return;
        }

        $guestVisit->loadMissing(['yard:id,name', 'createdBy.telegramBotChat', 'vehicles']);

        $chat = $guestVisit->createdBy?->telegramBotChat;

        if (!$chat) {
            // fallback: пользователь мог быть создан через approve и связан как approved_user_id
            $chat = TelegramBotChat::query()
                ->where('approved_user_id', $guestVisit->created_by_user_id)
                ->first();
        }

        if (!$chat) {
            return;
        }

        // Уведомления о прибытии гостя отправляем только одобренным/привязанным чатам.
        if ($chat->approval_status !== TelegramBotChat::APPROVAL_APPROVED && !$chat->user_id) {
            return;
        }

        $message = $this->buildArrivalMessage($guestVisit, $visitor, $isReentry);

        try {
            $this->telegramMessaging->sendText($chat->chat_id, $message);
        } catch (\Throwable $exception) {
            Log::error('Guest visit arrival Telegram notification failed', [
                'guest_visit_id' => $guestVisit->id,
                'user_id' => $guestVisit->created_by_user_id,
                'chat_id' => $chat->chat_id,
                'error' => $exception->getMessage(),
            ]);

            throw $exception;
        }
    }

    private function buildArrivalMessage(GuestVisit $guestVisit, ?Visitor $visitor, bool $isReentry): string
    {
        $title = $isReentry
            ? '<b>🔁 Повторный вход гостя на территорию</b>'
            : '<b>✅ Гость прибыл на территорию</b>';

        $lines = [
            $title,
            '',
            '<b>Гость:</b> ' . e($guestVisit->guest_full_name),
            '<b>Объект:</b> ' . e($guestVisit->yard?->name ?? 'Не указан'),
            '<b>Время:</b> ' . e(optional($guestVisit->last_entry_at)->format('d.m.Y H:i') ?? now()->format('d.m.Y H:i')),
            '<b>Принимающий:</b> ' . e($guestVisit->host_name),
            '<b>Телефон гостя:</b> ' . e($guestVisit->guest_phone),
        ];

        $vehicleLines = $this->buildVehicleLines($guestVisit, $visitor);
        if ($vehicleLines !== []) {
            $lines[] = '';
            $lines = array_merge($lines, $vehicleLines);
        }

        if ($guestVisit->comment) {
            $lines[] = '';
            $lines[] = '<b>Комментарий:</b> ' . e($guestVisit->comment);
        }

        return implode("\n", $lines);
    }

    /**
     * @return string[]
     */
    private function buildVehicleLines(GuestVisit $guestVisit, ?Visitor $visitor): array
    {
        $vehicles = $guestVisit->relationLoaded('vehicles')
            ? $guestVisit->vehicles
            : $guestVisit->vehicles()->get();

        $lines = [];
        $index = 1;
        $count = $vehicles->count();

        foreach ($vehicles as $vehicle) {
            $parts = array_filter([
                $vehicle->plate_number,
                trim((string) ($vehicle->brand . ' ' . $vehicle->model)) ?: null,
                $vehicle->color,
            ]);

            if ($parts === []) {
                continue;
            }

            $prefix = $count > 1 ? '<b>ТС ' . $index . ':</b> ' : '<b>ТС:</b> ';
            $lines[] = $prefix . e(implode(', ', $parts));
            $index++;
        }

        // fallback: если у визита нет машин, но передан Visitor с гос.номером — выводим его.
        if ($lines === [] && $visitor?->plate_number) {
            $lines[] = '<b>ТС:</b> ' . e($visitor->plate_number);
        }

        return $lines;
    }
}
