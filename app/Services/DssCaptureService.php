<?php

namespace App\Services;

use App\Models\EntryPermit;
use App\Models\Status;
use App\Models\Truck;
use App\Models\VehicleCapture;
use GuzzleHttp\Exception\RequestException;
use Illuminate\Support\Facades\Log;

class DssCaptureService extends DssBaseService
{
    public function __construct(
        private DssAuthService $authService,
        private DssDeviceSyncService $deviceSyncService,
        private DssMediaService $mediaService,
        private DssVisitorFlowService $visitorFlowService,
    ) {
        parent::__construct();
    }

    public function dssVehicleCapture(): array
    {
        if ($error = $this->ensureSettings(['base_url'])) {
            return $error;
        }

        $authResult = $this->authService->ensureAuthorized();
        if (isset($authResult['error'])) {
            return $authResult;
        }

        $dssApi = $this->getApiDefinition('VehicleCapture');
        if (!$dssApi) {
            return ['error' => 'DSS API method VehicleCapture not found'];
        }

        $currentTimestamp = time();

        try {
            $response = $this->client->post($this->baseUrl . $dssApi->request_url, [
                'headers' => $this->getJsonHeaders($this->dssSettings->token),
                'json' => [
                    'plateNoMatchMode' => 1,
                    'startTime' => $currentTimestamp - 4,
                    'endTime' => $currentTimestamp,
                    'page' => 1,
                    'currentPage' => 1,
                    'pageSize' => 200,
                    'orderDirection' => 'asc',
                ],
            ]);
        } catch (RequestException $exception) {
            $authResult = $this->authService->dssAutorize();
            if (isset($authResult['error'])) {
                return $authResult;
            }

            $response = $this->client->post($this->baseUrl . $dssApi->request_url, [
                'headers' => $this->getJsonHeaders($this->dssSettings->token),
                'json' => [
                    'plateNoMatchMode' => 1,
                    'startTime' => $currentTimestamp - 4,
                    'endTime' => $currentTimestamp,
                    'page' => 1,
                    'currentPage' => 1,
                    'pageSize' => 200,
                    'orderDirection' => 'asc',
                ],
            ]);
        }

        if ($response->getStatusCode() !== 200 || !$response->getBody()) {
            return ['error' => 'Ошибка запроса: ' . $response->getStatusCode()];
        }

        $responseData = json_decode($response->getBody(), true);
        if ((int) ($responseData['code'] ?? 0) !== 1000) {
            return [
                'error' => 'Неверный код ответа: ' . ($responseData['code'] ?? 'unknown'),
                'data' => $responseData,
            ];
        }

        $pageData = $responseData['data']['pageData'] ?? [];
        if (empty($pageData)) {
            return ['success' => true, 'processed' => 0];
        }

        $processed = 0;
        foreach ($pageData as $item) {
            if (empty($item['channelId']) || empty($item['plateNo']) || mb_strlen($item['plateNo']) < 4) {
                continue;
            }

            $device = $this->deviceSyncService->upsertDeviceFromCapture($item);
            if (!$device) {
                continue;
            }

            $metadata = $this->deviceSyncService->syncVehicleDirectories($item);
            [$truck, $truckWasFound, $confidence] = $this->resolveTruckFromCapture($item);

            if ($truck) {
                $this->deviceSyncService->updateTruckMetadata($truck, $metadata, $item);
            }

            $vehicleCapture = VehicleCapture::updateOrCreate(
                [
                    'devaice_id' => $device->id,
                    'captureTime' => $item['captureTime'],
                    'plateNo' => $item['plateNo'],
                ],
                [
                    'devaice_id' => $device->id,
                    'truck_id' => $truck?->id,
                    'plateNo' => $item['plateNo'],
                    'capturePicture' => $item['capturePicture'] ?? null,
                    'plateNoPicture' => $item['plateNoPicture'] ?? null,
                    'vehicleBrandName' => $item['vehicleBrandName'] ?? null,
                    'captureTime' => $item['captureTime'],
                    'vehicleColorName' => $item['vehicleColorName'] ?? null,
                    'vehicleModelName' => $item['vehicleModelName'] ?? null,
                ]
            );

            $this->mediaService->ensureVehicleCaptureImage($vehicleCapture);
            $this->visitorFlowService->recordZoneEntry($device, $truck, array_merge($item, [
                'confidence' => $confidence,
                'truck_was_found' => $truckWasFound,
            ]));

            $processed++;
        }

        return ['success' => true, 'processed' => $processed];
    }

    private function resolveTruckFromCapture(array $capture): array
    {
        $plateNo = $capture['plateNo'];
        $confidence = $capture['confidence'] ?? $capture['plateScore'] ?? null;
        $truck = Truck::where('plate_number', $plateNo)->first();
        $truckWasFound = $truck !== null;

        if (!$truck) {
            $normalizedPlate = $this->normalizePlate($plateNo);
            $truck = Truck::whereRaw(
                "REPLACE(REPLACE(LOWER(plate_number), ' ', ''), '-', '') = ?",
                [$normalizedPlate]
            )->first();

            $truckWasFound = $truck !== null;

            if (!$truck && $confidence !== null && $confidence >= 95) {
                $activeStatus = Status::where('key', 'active')->first();
                $hasPermitForPlate = EntryPermit::whereHas('truck', function ($query) use ($normalizedPlate) {
                    $query->whereRaw(
                        "REPLACE(REPLACE(LOWER(plate_number), ' ', ''), '-', '') = ?",
                        [$normalizedPlate]
                    );
                })
                    ->where('status_id', $activeStatus?->id ?? 0)
                    ->where(function ($query) {
                        $query->whereNull('end_date')
                            ->orWhere('end_date', '>=', now()->startOfDay());
                    })
                    ->exists();

                if (!$hasPermitForPlate) {
                    Log::info("DSS: Номер {$plateNo} не найден в базе, confidence={$confidence}. Не создаём грузовик - ждём подтверждения оператора.");
                }
            }
        }

        return [$truck, $truckWasFound, $confidence];
    }

    private function normalizePlate(string $plateNumber): string
    {
        return strtolower(str_replace([' ', '-'], '', $plateNumber));
    }
}