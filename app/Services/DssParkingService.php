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