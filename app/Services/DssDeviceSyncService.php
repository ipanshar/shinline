<?php

namespace App\Services;

use App\Models\Devaice;
use App\Models\Truck;
use App\Models\TruckBrand;
use App\Models\TruckCategory;
use App\Models\TruckModel;

class DssDeviceSyncService
{
    private array $deviceCache = [];
    private array $brandCache = [];
    private array $categoryCache = [];
    private array $modelCache = [];

    public function upsertDeviceFromCapture(array $capture): ?Devaice
    {
        if (empty($capture['channelId'])) {
            return null;
        }

        $channelId = (string) $capture['channelId'];
        $channelName = $capture['channelName'] ?? null;

        return $this->remember($this->deviceCache, 'device:' . $channelId, function () use ($channelId, $channelName) {
            $device = Devaice::firstOrNew(['channelId' => $channelId]);

            if ($device->channelName !== $channelName) {
                $device->channelName = $channelName;
                $device->save();
            } elseif (!$device->exists) {
                $device->save();
            }

            return $device->fresh();
        });
    }

    public function syncVehicleDirectories(array $capture): array
    {
        $brandId = null;
        $truckCategory = null;
        $truckModel = null;

        $brandName = trim((string) ($capture['vehicleBrandName'] ?? ''));
        if ($brandName !== '') {
            $brand = $this->remember($this->brandCache, 'brand:' . mb_strtolower($brandName), function () use ($brandName) {
                return TruckBrand::firstOrCreate(['name' => $brandName]);
            });
            $brandId = $brand->id;
        }

        $categoryName = trim((string) ($capture['vehicleModelName'] ?? ''));
        if ($categoryName !== '') {
            $truckCategory = $this->remember($this->categoryCache, 'category:' . mb_strtolower($categoryName), function () use ($categoryName) {
                return TruckCategory::firstOrCreate(
                    ['name' => $categoryName],
                    ['ru_name' => $categoryName]
                );
            });

            $modelName = $truckCategory->ru_name;
            $truckModel = $this->remember($this->modelCache, 'model:' . mb_strtolower($modelName), function () use ($modelName, $brandId, $truckCategory) {
                return TruckModel::firstOrCreate(
                    ['name' => $modelName],
                    [
                        'truck_brand_id' => $brandId,
                        'truck_category_id' => $truckCategory->id,
                    ]
                );
            });

            $updates = [];
            if (!$truckModel->truck_brand_id && $brandId) {
                $updates['truck_brand_id'] = $brandId;
            }

            if (!$truckModel->truck_category_id) {
                $updates['truck_category_id'] = $truckCategory->id;
            }

            if ($updates) {
                $truckModel->update($updates);
            }
        }

        return [
            'truck_brand_id' => $brandId,
            'truck_category' => $truckCategory,
            'truck_model' => $truckModel,
        ];
    }

    public function updateTruckMetadata(Truck $truck, array $metadata, array $capture): Truck
    {
        $truck->color = $capture['vehicleColorName'] ?? null;
        $truck->truck_brand_id = $metadata['truck_brand_id'] ?? null;
        $truck->truck_model_id = $metadata['truck_model']?->id;
        $truck->truck_category_id = $metadata['truck_category']?->id;

        if ($truck->isDirty()) {
            $truck->save();
        }

        return $truck;
    }

    private function remember(array &$cache, string $key, callable $resolver)
    {
        $now = time();
        $ttl = max(1, (int) config('dss.cache.lookup_ttl_seconds', 60));

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