<?php

namespace App\Jobs;

use App\Models\GuestVisit;
use App\Services\GuestVisitTelegramNotifier;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendGuestVisitArrivalNotificationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 30;

    public function __construct(
        public int $guestVisitId,
        public bool $isReentry = false,
    ) {
        $this->onQueue(config('dss.queues.notifications', 'dss-notifications'));
    }

    public function handle(GuestVisitTelegramNotifier $notifier): void
    {
        $guestVisit = GuestVisit::query()
            ->with(['yard:id,name', 'createdBy.telegramBotChat', 'vehicles'])
            ->find($this->guestVisitId);

        if (!$guestVisit) {
            return;
        }

        $notifier->notifyArrival($guestVisit, null, $this->isReentry);
    }
}
