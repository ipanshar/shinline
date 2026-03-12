<?php

namespace App\Jobs;

use App\Services\DssMediaService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class DownloadVehicleCaptureImageJob implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $uniqueFor = 3600;

    public function __construct(public int $vehicleCaptureId)
    {
        $this->onQueue(config('dss.queues.media', 'dss-media'));
    }

    public function uniqueId(): string
    {
        return 'vehicle-capture-image:' . $this->vehicleCaptureId;
    }

    public function handle(DssMediaService $mediaService): void
    {
        $mediaService->downloadVehicleCaptureImageById($this->vehicleCaptureId);
    }
}