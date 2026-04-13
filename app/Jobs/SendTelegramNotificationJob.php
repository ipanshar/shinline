<?php

namespace App\Jobs;

use App\Services\DssTelegramNotificationManager;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendTelegramNotificationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(
        public string $eventKey,
        public string $message,
        public array $context = [],
    )
    {
        $this->onQueue(config('dss.queues.notifications', 'dss-notifications'));
    }

    public function handle(): void
    {
        app(DssTelegramNotificationManager::class)->sendNow($this->eventKey, $this->message, $this->context);
    }
}