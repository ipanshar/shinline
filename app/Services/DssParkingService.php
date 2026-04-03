<?php

namespace App\Services;

use App\Models\Devaice;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;

class DssParkingService extends DssBaseService
{
    public function __construct(
        private DssAuthService $authService,
        ?Client $client = null,
    ) {
        parent::__construct($client);
    }

    public function syncBarrierChannelsToDevices(): array
    {
        if ($error = $this->ensureSettings(['base_url'])) {
            return $error;
        }

        $authResult = $this->authService->ensureAuthorized();
        if (isset($authResult['error'])) {
            return ['error' => 'Ошибка авторизации DSS: ' . $authResult['error']];
        }

        $parkingLots = $this->fetchParkingLots();
        if (isset($parkingLots['error'])) {
            return $parkingLots;
        }

        $channelMap = $this->buildBarrierChannelMap($parkingLots['data']);

        $updated = 0;
        $matched = 0;
        $unmatched = [];

        foreach (Devaice::all() as $device) {
            $channelName = trim((string) $device->channelName);
            if ($channelName === '') {
                continue;
            }

            $barrierChannelId = $channelMap[$channelName] ?? null;
            if (!$barrierChannelId) {
                $unmatched[] = $channelName;
                continue;
            }

            $matched++;

            if ($device->barrier_channel_id !== $barrierChannelId) {
                $device->update([
                    'barrier_channel_id' => $barrierChannelId,
                ]);
                $updated++;
            }
        }

        return [
            'success' => true,
            'matched' => $matched,
            'updated' => $updated,
            'unmatched' => array_values(array_unique($unmatched)),
            'parking_lots' => count($parkingLots['data']),
            'channels_found' => count($channelMap),
        ];
    }

    public function openBarrierForDevice(?int $deviceId): array
    {
        if (!$deviceId) {
            return ['error' => 'Устройство для открытия шлагбаума не указано'];
        }

        $device = Devaice::find($deviceId);
        if (!$device) {
            return ['error' => 'Устройство для открытия шлагбаума не найдено'];
        }

        $barrierChannelId = trim((string) $device->barrier_channel_id);
        if ($barrierChannelId === '') {
            return ['error' => 'Для устройства не настроен barrier_channel_id'];
        }

        return $this->openBarrierByChannelId($barrierChannelId);
    }

    public function openBarrierByChannelId(string $barrierChannelId): array
    {
        if ($error = $this->ensureSettings(['base_url'])) {
            return $error;
        }

        $authResult = $this->authService->ensureAuthorized();
        if (isset($authResult['error'])) {
            return ['error' => 'Ошибка авторизации DSS: ' . $authResult['error']];
        }

        try {
            $response = $this->client->put(
                rtrim($this->baseUrl, '/') . '/ipms/api/v1.0/entrance/channel/remote-open-sluice/' . $barrierChannelId,
                [
                    'headers' => $this->getJsonHeaders($this->dssSettings->token),
                    'json' => [
                        'correctCarNo' => '',
                        'correctTime' => '0',
                        'forceRecapture' => '0',
                        'parkingSpaceStatisticsType' => '1',
                        'saveRecord' => '0',
                    ],
                ]
            );

            $responseData = json_decode($response->getBody(), true);

            if ((int) ($responseData['code'] ?? 0) !== 1000) {
                return [
                    'error' => $responseData['desc'] ?? 'DSS не подтвердил открытие шлагбаума',
                    'data' => $responseData,
                ];
            }

            return [
                'success' => true,
                'message' => $responseData['desc'] ?? 'Success',
                'data' => $responseData['data'] ?? null,
            ];
        } catch (RequestException $exception) {
            if ($exception->hasResponse()) {
                return [
                    'error' => 'Ошибка запроса к DSS при открытии шлагбаума',
                    'details' => json_decode($exception->getResponse()->getBody(), true),
                ];
            }

            return ['error' => 'Ошибка соединения с DSS: ' . $exception->getMessage()];
        }
    }

    private function fetchParkingLots(): array
    {
        try {
            $summaryResponse = $this->client->get(
                rtrim($this->baseUrl, '/') . '/ipms/api/v1.1/parking-lot/summary/list?parkingLotIds=&mode=3',
                ['headers' => $this->getJsonHeaders($this->dssSettings->token)]
            );

            $summaryData = json_decode($summaryResponse->getBody(), true);
            if ((int) ($summaryData['code'] ?? 0) !== 1000) {
                return ['error' => 'DSS не вернул список парковок', 'data' => $summaryData];
            }

            $results = $summaryData['data']['results'] ?? [];
            $parkingLots = [];

            foreach ($results as $parkingLot) {
                $parkingLotId = $parkingLot['id'] ?? null;
                if (!$parkingLotId) {
                    continue;
                }

                $detailResponse = $this->client->get(
                    rtrim($this->baseUrl, '/') . '/ipms/api/v1.1/parking-lot/' . $parkingLotId,
                    ['headers' => $this->getJsonHeaders($this->dssSettings->token)]
                );

                $detailData = json_decode($detailResponse->getBody(), true);
                if ((int) ($detailData['code'] ?? 0) === 1000 && isset($detailData['data'])) {
                    $parkingLots[] = $detailData['data'];
                }
            }

            return ['success' => true, 'data' => $parkingLots];
        } catch (RequestException $exception) {
            if ($exception->hasResponse()) {
                return [
                    'error' => 'Ошибка запроса к DSS при загрузке парковок',
                    'details' => json_decode($exception->getResponse()->getBody(), true),
                ];
            }

            return ['error' => 'Ошибка соединения с DSS: ' . $exception->getMessage()];
        }
    }

    private function buildBarrierChannelMap(array $parkingLots): array
    {
        $map = [];

        foreach ($parkingLots as $parkingLot) {
            foreach (($parkingLot['positions'] ?? []) as $position) {
                foreach (($position['points'] ?? []) as $point) {
                    $channelId = $point['bindingItcChannels'][0]['channelId'] ?? null;
                    if (!$channelId) {
                        continue;
                    }

                    $names = array_filter([
                        trim((string) ($point['pointName'] ?? '')),
                        trim((string) ($point['channelName'] ?? '')),
                        trim((string) ($point['bindingItcChannels'][0]['channelName'] ?? '')),
                    ]);

                    foreach ($names as $name) {
                        if (!isset($map[$name])) {
                            $map[$name] = $channelId;
                        }
                    }
                }
            }
        }

        return $map;
    }
}