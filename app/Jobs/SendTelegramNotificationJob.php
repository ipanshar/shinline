<?php

namespace App\Jobs;

use App\Http\Controllers\TelegramController;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendTelegramNotificationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public string $message)
    {
        $this->onQueue(config('dss.queues.notifications', 'dss-notifications'));
    }

    public function handle(): void
    {
        (new TelegramController())->sendNotification($this->message);
    }
}