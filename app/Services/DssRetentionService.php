<?php

namespace App\Services;

use App\Models\TruckZoneHistory;
use App\Models\VehicleCapture;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;

class DssRetentionService
{
    public function archiveOldVehicleCaptures(?int $days = null): array
    {
        $days ??= (int) config('dss.retention.vehicle_captures_days', 90);
        $threshold = now()->subDays($days)->timestamp;
        $chunkSize = (int) config('dss.retention.chunk_size', 500);
        $archived = 0;

        VehicleCapture::where('captureTime', '<', (string) $threshold)
            ->orderBy('id')
            ->chunkById($chunkSize, function (Collection $captures) use (&$archived) {
                $this->appendArchiveLines('vehicle-captures', $captures->map(function (VehicleCapture $capture) {
                    return [
                        'id' => $capture->id,
                        'devaice_id' => $capture->devaice_id,
                        'truck_id' => $capture->truck_id,
                        'plateNo' => $capture->plateNo,
                        'captureTime' => $capture->captureTime,
                        'capture_direction' => $capture->capture_direction,
                        'capture_key' => $capture->capture_key,
                        'processed_at' => $capture->processed_at,
                        'payload' => $capture->only([
                            'capturePicture',
                            'plateNoPicture',
                            'vehicleBrandName',
                            'vehicleColorName',
                            'vehicleModelName',
                            'local_capturePicture',
                            'imageDownload',
                            'views',
                            'created_at',
                            'updated_at',
                        ]),
                    ];
                }));

                foreach ($captures as $capture) {
                    if ($capture->local_capturePicture && Storage::disk('public')->exists($capture->local_capturePicture)) {
                        Storage::disk('public')->delete($capture->local_capturePicture);
                    }

                    $capture->delete();
                }

                $archived += $captures->count();
            });

        return ['success' => true, 'archived_vehicle_captures' => $archived, 'days' => $days];
    }

    public function archiveOldTruckZoneHistory(?int $days = null): array
    {
        $days ??= (int) config('dss.retention.truck_zone_history_days', 180);
        $threshold = now()->subDays($days);
        $chunkSize = (int) config('dss.retention.chunk_size', 500);
        $archived = 0;

        TruckZoneHistory::whereNotNull('exit_time')
            ->where('exit_time', '<', $threshold)
            ->orderBy('id')
            ->chunkById($chunkSize, function (Collection $records) use (&$archived) {
                $this->appendArchiveLines('truck-zone-history', $records->map(function (TruckZoneHistory $record) {
                    return [
                        'id' => $record->id,
                        'truck_id' => $record->truck_id,
                        'device_id' => $record->device_id,
                        'zone_id' => $record->zone_id,
                        'task_id' => $record->task_id,
                        'entry_time' => $record->entry_time,
                        'exit_time' => $record->exit_time,
                        'created_at' => $record->created_at,
                        'updated_at' => $record->updated_at,
                    ];
                }));

                foreach ($records as $record) {
                    $record->delete();
                }

                $archived += $records->count();
            });

        return ['success' => true, 'archived_truck_zone_history' => $archived, 'days' => $days];
    }

    public function archiveAll(): array
    {
        return [
            'vehicle_captures' => $this->archiveOldVehicleCaptures(),
            'truck_zone_history' => $this->archiveOldTruckZoneHistory(),
        ];
    }

    private function appendArchiveLines(string $channel, Collection $rows): void
    {
        $disk = config('dss.retention.archive_disk', 'local');
        $date = now();
        $path = sprintf(
            'dss-archive/%s/%s/%s-%s.jsonl',
            $channel,
            $date->format('Y-m'),
            $channel,
            $date->format('Y-m-d')
        );

        foreach ($rows as $row) {
            Storage::disk($disk)->append(
                $path,
                json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            );
        }
    }
}