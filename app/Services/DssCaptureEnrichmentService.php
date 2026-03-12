<?php

namespace App\Services;

use App\Models\Devaice;
use App\Models\EntryPermit;
use App\Models\Truck;
use App\Models\VehicleCapture;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class DssCaptureEnrichmentService
{
    private array $truckLookupCache = [];
    private array $permitPlateCache = [];

    public function __construct(
        private DssDeviceSyncService $deviceSyncService,
        private DssZoneHistoryService $zoneHistoryService,
        private DssVisitorFlowService $visitorFlowService,
        private DssStatusCacheService $statusCache,
    ) {
    }

    public function processCaptureById(int $vehicleCaptureId): array
    {
        $capture = VehicleCapture::find($vehicleCaptureId);
        if (!$capture) {
            return ['success' => false, 'error' => 'Vehicle capture not found'];
        }

        if ($capture->processed_at) {
            return ['success' => true, 'skipped' => true, 'reason' => 'already_processed'];
        }

        $device = Devaice::find($capture->devaice_id);
        if (!$device) {
            return ['success' => false, 'error' => 'Device not found'];
        }

        $captureData = [
            'plateNo' => $capture->plateNo,
            'capturePicture' => $capture->capturePicture,
            'plateNoPicture' => $capture->plateNoPicture,
            'vehicleBrandName' => $capture->vehicleBrandName,
            'captureTime' => (int) $capture->captureTime,
            'vehicleColorName' => $capture->vehicleColorName,
            'vehicleModelName' => $capture->vehicleModelName,
            'confidence' => null,
            'plateScore' => null,
        ];

        $metadata = $this->deviceSyncService->syncVehicleDirectories($captureData);
        [$truck, $truckWasFound, $confidence] = $this->resolveTruckFromCapture($captureData);

        if ($truck) {
            $this->deviceSyncService->updateTruckMetadata($truck, $metadata, $captureData);
            $capturedAt = Carbon::createFromTimestamp((int) $capture->captureTime)->setTimezone(config('app.timezone'));

            if ($device->type === 'Exit') {
                $this->zoneHistoryService->exitTerritory($truck->id, $capturedAt);
            } elseif ($device->zone_id) {
                $this->zoneHistoryService->enterZone($truck, $device, null, $capturedAt);
            }
        }

        $capture->truck_id = $truck?->id;
        $capture->processed_at = now();
        $capture->save();

        $this->visitorFlowService->handleCapture($device, $truck, array_merge($captureData, [
            'confidence' => $confidence,
            'truck_was_found' => $truckWasFound,
        ]));

        return ['success' => true, 'truck_id' => $truck?->id];
    }

    private function resolveTruckFromCapture(array $capture): array
    {
        $plateNo = (string) $capture['plateNo'];
        $normalizedPlate = $this->normalizePlate($plateNo);
        $confidence = $capture['confidence'] ?? $capture['plateScore'] ?? null;
        $cacheKey = 'truck:' . $normalizedPlate;

        $truck = $this->remember($this->truckLookupCache, $cacheKey, function () use ($plateNo, $normalizedPlate) {
            $exact = Truck::where('plate_number', $plateNo)->first();
            if ($exact) {
                return $exact;
            }

            return Truck::whereRaw(
                "REPLACE(REPLACE(LOWER(plate_number), ' ', ''), '-', '') = ?",
                [$normalizedPlate]
            )->first();
        });

        $truckWasFound = $truck !== null;

        if (!$truck && $confidence !== null && $confidence >= 95 && !$this->hasPermitForPlate($normalizedPlate)) {
            Log::info("DSS: Номер {$plateNo} не найден в базе, confidence={$confidence}. Не создаём грузовик - ждём подтверждения оператора.");
        }

        return [$truck, $truckWasFound, $confidence];
    }

    private function hasPermitForPlate(string $normalizedPlate): bool
    {
        return $this->remember($this->permitPlateCache, 'permit:' . $normalizedPlate, function () use ($normalizedPlate) {
            $activeStatusId = $this->statusCache->getId('active') ?? 0;

            return EntryPermit::whereHas('truck', function ($query) use ($normalizedPlate) {
                $query->whereRaw(
                    "REPLACE(REPLACE(LOWER(plate_number), ' ', ''), '-', '') = ?",
                    [$normalizedPlate]
                );
            })
                ->where('status_id', $activeStatusId)
                ->where(function ($query) {
                    $query->whereNull('end_date')
                        ->orWhere('end_date', '>=', now()->startOfDay());
                })
                ->exists();
        });
    }

    private function normalizePlate(string $plateNumber): string
    {
        return strtolower(str_replace([' ', '-'], '', $plateNumber));
    }

    private function remember(array &$cache, string $key, callable $resolver)
    {
        $now = time();
        $ttl = max(1, (int) config('dss.cache.truck_lookup_ttl_seconds', 30));

        if (isset($cache[$key]) && $cache[$key]['expires_at'] > $now) {
            return $cache[$key]['value'];
        }

        $value = $resolver();
        $cache[$key] = [
            'value' => $value,
            'expires_at' => $now + $ttl,
        ];

        return $value;
    }
}