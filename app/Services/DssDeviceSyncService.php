<?php

namespace App\Services;

use App\Models\Devaice;
use App\Models\Truck;
use App\Models\TruckBrand;
use App\Models\TruckCategory;
use App\Models\TruckModel;

class DssDeviceSyncService
{
    public function upsertDeviceFromCapture(array $capture): ?Devaice
    {
        if (empty($capture['channelId'])) {
            return null;
        }

        return Devaice::updateOrCreate(
            ['channelId' => $capture['channelId']],
            ['channelName' => $capture['channelName'] ?? null]
        );
    }

    public function syncVehicleDirectories(array $capture): array
    {
        $brandId = null;
        $truckCategory = null;
        $truckModel = null;

        $brandName = trim((string) ($capture['vehicleBrandName'] ?? ''));
        if ($brandName !== '') {
            $brand = TruckBrand::firstOrCreate(['name' => $brandName]);
            $brandId = $brand->id;
        }

        $categoryName = trim((string) ($capture['vehicleModelName'] ?? ''));
        if ($categoryName !== '') {
            $truckCategory = TruckCategory::firstOrCreate(
                ['name' => $categoryName],
                ['ru_name' => $categoryName]
            );

            $truckModel = TruckModel::firstOrCreate(
                ['name' => $truckCategory->ru_name],
                [
                    'truck_brand_id' => $brandId,
                    'truck_category_id' => $truckCategory->id,
                ]
            );

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
        $truck->save();

        return $truck;
    }
}