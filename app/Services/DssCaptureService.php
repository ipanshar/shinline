<?php

namespace App\Services;

use App\Events\DssUnknownVehicleDetected;
use App\Jobs\EnrichVehicleCaptureJob;
use App\Models\VehicleCapture;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;

class DssCaptureService extends DssBaseService
{
    public function __construct(
        private DssAuthService $authService,
        private DssDeviceSyncService $deviceSyncService,
        private DssMediaService $mediaService,
        private DssStructuredLogger $structuredLogger,
        ?Client $client = null,
    ) {
        parent::__construct($client);
    }

    public function dssVehicleCapture(int $lookbackSeconds = 4): array
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
        $startTime = $currentTimestamp - max(1, $lookbackSeconds);

        try {
            $response = $this->client->post($this->baseUrl . $dssApi->request_url, [
                'headers' => $this->getJsonHeaders($this->dssSettings->token),
                'json' => [
                    'plateNoMatchMode' => 1,
                    'startTime' => $startTime,
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
                    'startTime' => $startTime,
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

        return $this->processCaptureItems($pageData);
    }

    public function ingestRealtimeCaptureItems(array $items): array
    {
        return $this->processCaptureItems($items);
    }

    public function handleAlarmEvent(array $alarmPayload): array
    {
        $expectedAlarmType = (string) config('dss.alarms.unknown_vehicle_type', '10708');
        $alarmType = trim((string) ($alarmPayload['alarmType'] ?? ''));

        if ($alarmType === '' || $alarmType !== $expectedAlarmType) {
            return [
                'success' => true,
                'ignored' => true,
                'reason' => 'alarm_type_not_supported',
            ];
        }

        $alarmCode = trim((string) ($alarmPayload['alarmCode'] ?? ''));
        if ($alarmCode === '') {
            return ['error' => 'DSS alarmCode is required'];
        }

        $detailResult = $this->fetchAlarmEntranceDetail($alarmCode);
        if (isset($detailResult['error'])) {
            return $detailResult;
        }

        $detail = $detailResult['data'] ?? [];
        if (!is_array($detail) || $detail === []) {
            return ['error' => 'DSS alarm detail payload is empty'];
        }

        $captureItem = $this->mapAlarmDetailToCaptureItem($detail, $alarmPayload);
        if ($captureItem === null) {
            return [
                'success' => true,
                'ignored' => true,
                'reason' => 'alarm_detail_incomplete',
            ];
        }

        $result = $this->processCaptureItems([$captureItem]);
        $vehicleCaptureId = $result['vehicle_capture_ids'][0] ?? null;
        $vehicleCapture = $vehicleCaptureId ? VehicleCapture::find($vehicleCaptureId) : null;

        if ($vehicleCapture && $vehicleCapture->capturePicture && !$vehicleCapture->local_capturePicture) {
            $this->mediaService->downloadVehicleCaptureImage($vehicleCapture);
            $vehicleCapture->refresh();
        }

        event(new DssUnknownVehicleDetected($alarmPayload, $detail, $vehicleCapture, $result));

        $this->structuredLogger->info('alarm_event_processed', [
            'alarm_code' => $alarmCode,
            'alarm_type' => $alarmType,
            'processed' => $result['processed'] ?? 0,
            'duplicates_skipped' => $result['duplicates_skipped'] ?? 0,
            'broadcasted' => true,
        ]);

        return $result;
    }

    private function processCaptureItems(array $pageData): array
    {
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
        $vehicleCaptureIds = [];
        foreach ($pageData as $item) {
            $item = $this->normalizeCaptureItem($item);
            if ($item === null) {
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
                'dss_alarm_code' => $item['dss_alarm_code'] ?? null,
                'dss_alarm_type' => $item['dss_alarm_type'] ?? null,
                'dss_alarm_source_code' => $item['dss_alarm_source_code'] ?? null,
                'dss_alarm_source_name' => $item['dss_alarm_source_name'] ?? null,
                'dss_alarm_payload' => $item['dss_alarm_payload'] ?? null,
                'dss_alarm_detail_payload' => $item['dss_alarm_detail_payload'] ?? null,
            ]);

            if ($isNew || $vehicleCapture->isDirty()) {
                $vehicleCapture->save();
            }

            $vehicleCaptureIds[] = $vehicleCapture->id;

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
            'vehicle_capture_ids' => array_values(array_unique(array_filter($vehicleCaptureIds))),
        ];
    }

    private function buildCaptureKey(int $deviceId, string $captureTime, string $plateNo, string $direction): string
    {
        $normalizedPlate = strtolower(str_replace([' ', '-'], '', $plateNo));

        return sha1(implode('|', [$deviceId, $captureTime, $normalizedPlate, $direction]));
    }

    private function fetchAlarmEntranceDetail(string $alarmCode): array
    {
        if ($error = $this->ensureSettings(['base_url'])) {
            return $error;
        }

        $authResult = $this->authService->ensureAuthorized();
        if (isset($authResult['error'])) {
            return $authResult;
        }

        $requestUrl = $this->getApiDefinition('AlarmEntranceDetail')?->request_url
            ?: (string) config('dss.endpoints.alarm_entrance_detail', '/eams/api/v1.1/alarm/record/entrance/detail');

        if ($requestUrl === '') {
            return ['error' => 'DSS alarm entrance detail endpoint is not configured'];
        }

        try {
            $response = $this->client->get($this->baseUrl . $requestUrl, [
                'headers' => $this->getJsonHeaders($this->dssSettings->token),
                'query' => [
                    'alarmCode' => $alarmCode,
                ],
            ]);
        } catch (RequestException $exception) {
            $authResult = $this->authService->dssAutorize();
            if (isset($authResult['error'])) {
                return $authResult;
            }

            $response = $this->client->get($this->baseUrl . $requestUrl, [
                'headers' => $this->getJsonHeaders($this->dssSettings->token),
                'query' => [
                    'alarmCode' => $alarmCode,
                ],
            ]);
        }

        if ($response->getStatusCode() !== 200 || !$response->getBody()) {
            return ['error' => 'Ошибка запроса детализации тревоги: ' . $response->getStatusCode()];
        }

        $responseData = json_decode($response->getBody(), true);
        if ((int) ($responseData['code'] ?? 0) !== 1000) {
            return [
                'error' => 'Неверный код ответа детализации тревоги: ' . ($responseData['code'] ?? 'unknown'),
                'data' => $responseData,
            ];
        }

        return $responseData;
    }

    private function mapAlarmDetailToCaptureItem(array $detail, array $alarmPayload): ?array
    {
        $plateNo = trim((string) ($detail['plateNo'] ?? ''));
        $channelId = trim((string) ($detail['channelId'] ?? $detail['pointId'] ?? ''));
        $captureTime = $this->normalizeCaptureTimestamp($detail['captureTime'] ?? $alarmPayload['alarmTime'] ?? null);

        if ($plateNo === '' || $channelId === '' || $captureTime === null) {
            return null;
        }

        $capturePicture = $detail['vehiclePicture'] ?? null;
        if ($capturePicture === null && isset($alarmPayload['alarmPictures'][0])) {
            $capturePicture = $alarmPayload['alarmPictures'][0];
        }

        return [
            'channelId' => $channelId,
            'channelName' => (string) ($detail['channelName'] ?? $detail['pointName'] ?? $detail['parkingLotName'] ?? $alarmPayload['sourceName'] ?? $channelId),
            'plateNo' => $plateNo,
            'capturePicture' => $capturePicture,
            'plateNoPicture' => $detail['plateNoPicture'] ?? null,
            'vehicleBrandName' => isset($detail['carBrand']) ? (string) $detail['carBrand'] : null,
            'captureTime' => (string) $captureTime,
            'vehicleColorName' => isset($detail['carColor']) ? (string) $detail['carColor'] : null,
            'vehicleModelName' => isset($detail['vehicleType']) ? (string) $detail['vehicleType'] : null,
            'dss_alarm_code' => (string) ($detail['alarmCode'] ?? $alarmPayload['alarmCode'] ?? ''),
            'dss_alarm_type' => (string) ($detail['alarmType'] ?? $alarmPayload['alarmType'] ?? ''),
            'dss_alarm_source_code' => isset($alarmPayload['sourceCode']) ? (string) $alarmPayload['sourceCode'] : null,
            'dss_alarm_source_name' => isset($alarmPayload['sourceName']) ? (string) $alarmPayload['sourceName'] : null,
            'dss_alarm_payload' => $alarmPayload,
            'dss_alarm_detail_payload' => $detail,
        ];
    }

    private function normalizeCaptureItem(array $item): ?array
    {
        $channelId = trim((string) ($item['channelId'] ?? ''));
        $plateNo = trim((string) ($item['plateNo'] ?? ''));
        $captureTime = $this->normalizeCaptureTimestamp($item['captureTime'] ?? null);

        if ($channelId === '' || $plateNo === '' || mb_strlen($plateNo) < 4 || $captureTime === null) {
            return null;
        }

        $item['channelId'] = $channelId;
        $item['plateNo'] = $plateNo;
        $item['captureTime'] = (string) $captureTime;
        $item['channelName'] = trim((string) ($item['channelName'] ?? $channelId));

        return $item;
    }

    private function normalizeCaptureTimestamp(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (!is_numeric($value)) {
            return null;
        }

        $timestamp = (int) floor((float) $value);
        if ($timestamp > 9999999999) {
            $timestamp = (int) floor($timestamp / 1000);
        }

        return $timestamp > 0 ? $timestamp : null;
    }
}