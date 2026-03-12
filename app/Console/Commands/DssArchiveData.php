<?php

namespace App\Console\Commands;

use App\Services\DssRetentionService;
use Illuminate\Console\Command;

class DssArchiveData extends Command
{
    protected $signature = 'dss:archive-data
                            {--captures-days= : Retention window for vehicle captures}
                            {--zone-history-days= : Retention window for truck zone history}';

    protected $description = 'Архивирует и очищает старые DSS события и историю зон';

    public function handle(DssRetentionService $retentionService): int
    {
        $capturesDays = $this->option('captures-days');
        $zoneHistoryDays = $this->option('zone-history-days');

        $capturesResult = $retentionService->archiveOldVehicleCaptures(
            $capturesDays !== null ? (int) $capturesDays : null
        );
        $zoneHistoryResult = $retentionService->archiveOldTruckZoneHistory(
            $zoneHistoryDays !== null ? (int) $zoneHistoryDays : null
        );

        $this->info('DSS archive complete');
        $this->line(json_encode([
            'vehicle_captures' => $capturesResult,
            'truck_zone_history' => $zoneHistoryResult,
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

        return self::SUCCESS;
    }
}