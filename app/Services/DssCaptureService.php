<?php

namespace App\Services;

use App\Jobs\EnrichVehicleCaptureJob;
use App\Models\VehicleCapture;
use GuzzleHttp\Exception\RequestException;

class DssCaptureService extends DssBaseService
{
    public function __construct(
        private DssAuthService $authService,
        private DssDeviceSyncService $deviceSyncService,
        private DssMediaService $mediaService,
        private DssStructuredLogger $structuredLogger,
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
            $this->structuredLogger->info('capture_received', [
                'processed' => 0,
                'duplicates_skipped' => 0,
                'items_received' => 0,
            ]);

            return ['success' => true, 'processed' => 0];
        }

        $processed = 0;
        $duplicatesSkipped = 0;
        foreach ($pageData as $item) {
            if (empty($item['channelId']) || empty($item['plateNo']) || mb_strlen($item['plateNo']) < 4) {
                continue;
            }

            $device = $this->deviceSyncService->upsertDeviceFromCapture($item);
            if (!$device) {
                continue;
            }

            $direction = strtolower((string) ($device->type ?: 'unknown'));
            $captureKey = $this->buildCaptureKey($device->id, (string) $item['captureTime'], (string) $item['plateNo'], $direction);

            $vehicleCapture = VehicleCapture::firstOrNew(['capture_key' => $captureKey]);
            $isNew = !$vehicleCapture->exists;

            $vehicleCapture->fill([
                'devaice_id' => $device->id,
                'plateNo' => $item['plateNo'],
                'capture_direction' => $direction,
                'capture_key' => $captureKey,
                'capturePicture' => $item['capturePicture'] ?? null,
                'plateNoPicture' => $item['plateNoPicture'] ?? null,
                'vehicleBrandName' => $item['vehicleBrandName'] ?? null,
                'captureTime' => (string) $item['captureTime'],
                'vehicleColorName' => $item['vehicleColorName'] ?? null,
                'vehicleModelName' => $item['vehicleModelName'] ?? null,
            ]);

            if ($isNew || $vehicleCapture->isDirty()) {
                $vehicleCapture->save();
            }

            if (!$isNew && $vehicleCapture->processed_at) {
                $duplicatesSkipped++;
                continue;
            }

            EnrichVehicleCaptureJob::dispatch($vehicleCapture->id, $captureKey);
            $this->mediaService->ensureVehicleCaptureImage($vehicleCapture);

            $processed++;
        }

        $this->structuredLogger->info('capture_received', [
            'processed' => $processed,
            'duplicates_skipped' => $duplicatesSkipped,
            'items_received' => count($pageData),
        ]);

        if ($duplicatesSkipped > 0) {
            $this->structuredLogger->warning('capture_skipped', [
                'reason' => 'duplicate_processed_capture',
                'duplicates_skipped' => $duplicatesSkipped,
            ]);
        }

        return [
            'success' => true,
            'processed' => $processed,
            'duplicates_skipped' => $duplicatesSkipped,
        ];
    }

    private function buildCaptureKey(int $deviceId, string $captureTime, string $plateNo, string $direction): string
    {
        $normalizedPlate = strtolower(str_replace([' ', '-'], '', $plateNo));

        return sha1(implode('|', [$deviceId, $captureTime, $normalizedPlate, $direction]));
    }
}