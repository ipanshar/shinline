<?php

namespace App\Jobs;

use App\Services\DssCaptureEnrichmentService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class EnrichVehicleCaptureJob implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $uniqueFor = 3600;

    public function __construct(
        public int $vehicleCaptureId,
        public string $captureKey,
    ) {
        $this->onQueue(config('dss.queues.enrichment', 'dss-enrichment'));
    }

    public function uniqueId(): string
    {
        return $this->captureKey;
    }

    public function handle(DssCaptureEnrichmentService $enrichmentService): void
    {
        $enrichmentService->processCaptureById($this->vehicleCaptureId);
    }
}