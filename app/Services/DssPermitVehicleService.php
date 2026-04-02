<?php

namespace App\Services;

use App\Models\DssParkingPermit;
use App\Models\EntryPermit;
use App\Models\Status;
use App\Models\Truck;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

class DssPermitVehicleService extends DssBaseService
{
    private const ACTION_SYNC = 'sync';
    private const ACTION_REVOKE = 'revoke';

    public function __construct(
        private DssAuthService $authService,
        ?Client $client = null,
    ) {
        parent::__construct($client);
    }

    public function syncPermitVehicle(EntryPermit $permit): array
    {
        return $this->processPermitVehicleAction($permit, self::ACTION_SYNC);
    }

    public function revokePermitVehicle(EntryPermit $permit): array
    {
        return $this->processPermitVehicleAction($permit, self::ACTION_REVOKE);
    }

    public function syncPermitVehicleSafely(EntryPermit $permit): array
    {
        $result = $this->syncPermitVehicle($permit);

        if (isset($result['error'])) {
            Log::warning('DSS permit vehicle sync failed', [
                'permit_id' => $permit->id,
                'truck_id' => $permit->truck_id,
                'yard_id' => $permit->yard_id,
                'error' => $result['error'],
                'details' => $result['data'] ?? null,
            ]);
        }

        return $result;
    }

    public function revokePermitVehicleSafely(EntryPermit $permit): array
    {
        $result = $this->revokePermitVehicle($permit);

        if (isset($result['error'])) {
            Log::warning('DSS permit vehicle revoke failed', [
                'permit_id' => $permit->id,
                'truck_id' => $permit->truck_id,
                'yard_id' => $permit->yard_id,
                'error' => $result['error'],
                'details' => $result['data'] ?? null,
            ]);
        }

        return $result;
    }

    private function processPermitVehicleAction(EntryPermit $permit, string $action): array
    {
        $permit->loadMissing('truck');
        $parkingPermit = $permit->dssParkingPermit()->first();

        $truck = $permit->truck;
        if (!$truck) {
            return $this->storeParkingPermitRecord($permit, [
                'success' => false,
                'skipped' => true,
                'reason' => 'permit_has_no_truck',
                'action' => $action,
            ], action: $action, parkingPermit: $parkingPermit);
        }

        $plateNumber = Truck::normalizePlateNumber($truck->plate_number);
        if (!$plateNumber) {
            return $this->storeParkingPermitRecord($permit, [
                'success' => false,
                'skipped' => true,
                'reason' => 'truck_has_no_plate',
                'action' => $action,
            ], $plateNumber, action: $action, parkingPermit: $parkingPermit);
        }

        if ($action === self::ACTION_REVOKE && $this->hasOtherActivePermit($permit)) {
            return $this->storeParkingPermitRecord($permit, [
                'success' => false,
                'skipped' => true,
                'reason' => 'another_active_permit_exists',
                'action' => $action,
            ], $plateNumber, action: $action, parkingPermit: $parkingPermit);
        }

        if ($error = $this->ensureSettings(['base_url'])) {
            $error['action'] = $action;

            return $this->storeParkingPermitRecord($permit, $error, $plateNumber, action: $action, parkingPermit: $parkingPermit);
        }

        $authResult = $this->authService->ensureAuthorized();
        if (isset($authResult['error'])) {
            return $this->storeParkingPermitRecord($permit, [
                'error' => 'Ошибка авторизации DSS: ' . $authResult['error'],
                'action' => $action,
            ], $plateNumber, action: $action, parkingPermit: $parkingPermit);
        }

        $payload = $action === self::ACTION_REVOKE
            ? $this->buildRevokePayload($permit, $plateNumber, $parkingPermit)
            : $this->buildSyncPayload($permit, $plateNumber);

        try {
            $responseData = $this->sendVehicleBatchRequest($payload);
            if ($action === self::ACTION_SYNC && $this->isAlreadyExistsResponse($responseData, $plateNumber)) {
                Log::info('DSS permit vehicle already exists', [
                    'permit_id' => $permit->id,
                    'truck_id' => $truck->id,
                    'plate_number' => $plateNumber,
                ]);

                return $this->storeParkingPermitRecord($permit, [
                    'success' => true,
                    'already_exists' => true,
                    'status' => 'already_exists',
                    'plate_number' => $plateNumber,
                    'action' => $action,
                    'data' => $responseData['data'] ?? null,
                ], $plateNumber, $payload, $responseData, $action, $parkingPermit);
            }

            if ((int) ($responseData['code'] ?? 0) !== 1000) {
                return $this->storeParkingPermitRecord($permit, [
                    'error' => $action === self::ACTION_REVOKE
                        ? 'DSS вернул ошибку при отзыве парковочного доступа'
                        : 'DSS вернул ошибку при регистрации ТС для парковки',
                    'data' => $responseData,
                    'action' => $action,
                ], $plateNumber, $payload, null, $action, $parkingPermit);
            }

            $remoteVehicleId = $this->extractRemoteVehicleId($responseData, $plateNumber)
                ?? $this->resolveStoredRemoteVehicleId($parkingPermit, $payload);

            Log::info($action === self::ACTION_REVOKE ? 'DSS permit vehicle revoked' : 'DSS permit vehicle synced', [
                'permit_id' => $permit->id,
                'truck_id' => $truck->id,
                'plate_number' => $plateNumber,
                'remote_vehicle_id' => $remoteVehicleId,
            ]);

            return $this->storeParkingPermitRecord($permit, [
                'success' => true,
                'plate_number' => $plateNumber,
                'action' => $action,
                'remote_vehicle_id' => $remoteVehicleId,
                'data' => $responseData['data'] ?? null,
            ], $plateNumber, $payload, $responseData, $action, $parkingPermit);
        } catch (RequestException $exception) {
            if ($exception->hasResponse()) {
                $response = $exception->getResponse();
                $responseBody = (string) $response->getBody();
                $decodedResponse = json_decode($responseBody, true);
                $responseData = is_array($decodedResponse)
                    ? $decodedResponse
                    : [
                        'http_status' => $response->getStatusCode(),
                        'raw_body' => $responseBody,
                    ];

                return $this->storeParkingPermitRecord($permit, [
                    'error' => $action === self::ACTION_REVOKE
                        ? 'Ошибка запроса к DSS при отзыве парковочного доступа'
                        : 'Ошибка запроса к DSS при регистрации ТС',
                    'data' => $responseData,
                    'action' => $action,
                ], $plateNumber, $payload, $responseData, $action, $parkingPermit);
            }

            return $this->storeParkingPermitRecord($permit, [
                'error' => 'Ошибка соединения с DSS: ' . $exception->getMessage(),
                'action' => $action,
            ], $plateNumber, $payload, null, $action, $parkingPermit);
        }
    }

    private function buildSyncPayload(EntryPermit $permit, string $plateNumber): array
    {
        $syncConfig = config('dss.permit_vehicle_sync');
        $accessWindow = $this->resolvePermitAccessWindow($permit);

        $entranceGroups = array_map(function (array $group) use ($accessWindow): array {
            return [
                'parkingLotId' => (string) $group['parking_lot_id'],
                'entranceGroupIds' => array_map('strval', $group['entrance_group_ids'] ?? []),
                'entranceLongTerm' => (string) ($accessWindow['entranceLongTerm'] ?? ($group['entrance_long_term'] ?? '1')),
                'entranceStartTime' => (string) ($accessWindow['entranceStartTime'] ?? ($group['entrance_start_time'] ?? '-1')),
                'entranceEndTime' => (string) ($accessWindow['entranceEndTime'] ?? ($group['entrance_end_time'] ?? '-1')),
            ];
        }, $syncConfig['entrance_groups'] ?? []);

        return [
            'enableSurveyGroup' => (string) ($syncConfig['enable_survey_group'] ?? '0'),
            'enableEntranceGroup' => (string) ($syncConfig['enable_entrance_group'] ?? '1'),
            'orgCode' => (string) ($syncConfig['org_code'] ?? '001001'),
            'orgName' => (string) ($syncConfig['org_name'] ?? 'Shin-Line'),
            'person' => [
                'personId' => (string) ($syncConfig['person_id'] ?? '1'),
                'remark' => (string) ($syncConfig['person_remark'] ?? ''),
            ],
            'vehicles' => [[
                'id' => '',
                'plateNo' => $plateNumber,
                'vehicleColor' => (string) ($syncConfig['vehicle_color'] ?? '100'),
                'vehicleBrand' => (string) ($syncConfig['vehicle_brand'] ?? '-1'),
                'entranceLongTerm' => (string) ($accessWindow['entranceLongTerm'] ?? ($syncConfig['entrance_long_term'] ?? '1')),
                'entranceStartTime' => (string) ($accessWindow['entranceStartTime'] ?? ($syncConfig['entrance_start_time'] ?? '-1')),
                'entranceEndTime' => (string) ($accessWindow['entranceEndTime'] ?? ($syncConfig['entrance_end_time'] ?? '-1')),
                'entranceGroups' => $entranceGroups,
            ]],
        ];
    }

    private function buildRevokePayload(EntryPermit $permit, string $plateNumber, ?DssParkingPermit $parkingPermit): array
    {
        $syncConfig = config('dss.permit_vehicle_sync');
        $parkingLotIds = $this->resolveParkingLotIds($parkingPermit, $syncConfig);
        $accessWindow = $this->resolvePermitAccessWindow($permit, $parkingPermit);

        return [
            'enableSurveyGroup' => (string) ($syncConfig['enable_survey_group'] ?? '0'),
            'enableEntranceGroup' => (string) ($syncConfig['enable_entrance_group'] ?? '1'),
            'orgCode' => (string) ($syncConfig['org_code'] ?? '001001'),
            'orgName' => (string) ($syncConfig['org_name'] ?? 'Shin-Line'),
            'person' => [
                'personId' => (string) ($parkingPermit?->person_id ?? ($syncConfig['person_id'] ?? '1')),
                'remark' => (string) ($syncConfig['person_remark'] ?? ''),
            ],
            'vehicles' => [[
                'id' => (string) ($this->resolveStoredRemoteVehicleId($parkingPermit) ?? ''),
                'plateNo' => $plateNumber,
                'entranceLongTerm' => (string) ($accessWindow['entranceLongTerm'] ?? ($syncConfig['entrance_long_term'] ?? '1')),
                'entranceStartTime' => (string) ($accessWindow['entranceStartTime'] ?? ($syncConfig['entrance_start_time'] ?? '-1')),
                'entranceEndTime' => (string) ($accessWindow['entranceEndTime'] ?? ($syncConfig['entrance_end_time'] ?? '-1')),
                'entranceGroups' => array_map(function (string $parkingLotId) use ($syncConfig, $accessWindow): array {
                    return [
                        'parkingLotId' => $parkingLotId,
                        'entranceGroupIds' => [],
                        'entranceLongTerm' => (string) ($accessWindow['entranceLongTerm'] ?? ($syncConfig['entrance_long_term'] ?? '1')),
                        'entranceStartTime' => (string) ($accessWindow['entranceStartTime'] ?? ($syncConfig['entrance_start_time'] ?? '-1')),
                        'entranceEndTime' => (string) ($accessWindow['entranceEndTime'] ?? ($syncConfig['entrance_end_time'] ?? '-1')),
                    ];
                }, $parkingLotIds),
            ]],
        ];
    }

    private function resolvePermitAccessWindow(EntryPermit $permit, ?DssParkingPermit $parkingPermit = null): ?array
    {
        $storedVehiclePayload = $parkingPermit?->request_payload['vehicles'][0] ?? null;
        if (is_array($storedVehiclePayload) && ($storedVehiclePayload['entranceLongTerm'] ?? null) === '0') {
            return [
                'entranceLongTerm' => '0',
                'entranceStartTime' => (string) ($storedVehiclePayload['entranceStartTime'] ?? '-1'),
                'entranceEndTime' => (string) ($storedVehiclePayload['entranceEndTime'] ?? '-1'),
            ];
        }

        if (!$permit->begin_date) {
            return null;
        }

        $timezone = config('app.timezone', 'UTC');
        $startDate = Carbon::parse($permit->begin_date, $timezone)->startOfDay();

        $endSource = $permit->end_date;
        if (!$endSource && $permit->one_permission) {
            $endSource = $permit->begin_date;
        }

        if (!$endSource) {
            return null;
        }

        $endDate = Carbon::parse($endSource, $timezone)->endOfDay();
        if ($endDate->lt($startDate)) {
            $endDate = $startDate->copy()->endOfDay();
        }

        return [
            'entranceLongTerm' => '0',
            'entranceStartTime' => (string) $startDate->timestamp,
            'entranceEndTime' => (string) $endDate->timestamp,
        ];
    }

    private function sendVehicleBatchRequest(array $payload): array
    {
        $attempts = max(1, (int) config('dss.permit_vehicle_sync.retry_attempts', 3));
        $retryDelayMs = max(0, (int) config('dss.permit_vehicle_sync.retry_delay_ms', 1000));

        for ($attempt = 1; $attempt <= $attempts; $attempt++) {
            try {
                $response = $this->client->post(
                    rtrim($this->baseUrl, '/') . '/ipms/api/v1.1/vehicle/save/batch',
                    [
                        'headers' => $this->getJsonHeaders($this->dssSettings->token),
                        'json' => $payload,
                    ]
                );

                return json_decode($response->getBody(), true);
            } catch (RequestException $exception) {
                $statusCode = $exception->hasResponse() ? $exception->getResponse()->getStatusCode() : null;
                $shouldRetry = $statusCode === 429 && $attempt < $attempts;

                if (!$shouldRetry) {
                    throw $exception;
                }

                if ($retryDelayMs > 0) {
                    usleep($retryDelayMs * 1000 * $attempt);
                }
            }
        }

        throw new \RuntimeException('DSS vehicle batch retry loop terminated unexpectedly');
    }

    private function resolveParkingLotIds(?DssParkingPermit $parkingPermit, array $syncConfig): array
    {
        $parkingLotIds = array_values(array_filter(array_map('strval', $parkingPermit?->parking_lot_ids ?? [])));

        if ($parkingLotIds !== []) {
            return $parkingLotIds;
        }

        return array_values(array_filter(array_map(
            static fn (array $group): ?string => isset($group['parking_lot_id']) ? (string) $group['parking_lot_id'] : null,
            $syncConfig['entrance_groups'] ?? []
        )));
    }

    private function resolveStoredRemoteVehicleId(?DssParkingPermit $parkingPermit, ?array $payload = null): ?string
    {
        $vehicleId = $parkingPermit?->remote_vehicle_id;
        if (!empty($vehicleId)) {
            return (string) $vehicleId;
        }

        $responseData = $parkingPermit?->response_payload;
        if (is_array($responseData)) {
            $vehicleId = $this->extractRemoteVehicleId($responseData, $parkingPermit?->plate_number);
            if (!empty($vehicleId)) {
                return $vehicleId;
            }
        }

        $payloadVehicleId = $payload['vehicles'][0]['id'] ?? null;

        return !empty($payloadVehicleId) ? (string) $payloadVehicleId : null;
    }

    private function extractRemoteVehicleId(array $responseData, ?string $plateNumber = null): ?string
    {
        $candidates = [];

        if (isset($responseData['data'])) {
            $candidates[] = $responseData['data'];
        }

        foreach (['vehicles', 'list', 'rows', 'records'] as $key) {
            if (isset($responseData[$key])) {
                $candidates[] = $responseData[$key];
            }
            if (isset($responseData['data'][$key])) {
                $candidates[] = $responseData['data'][$key];
            }
        }

        foreach ($candidates as $candidate) {
            $vehicleId = $this->extractVehicleIdFromCandidate($candidate, $plateNumber);
            if ($vehicleId !== null) {
                return $vehicleId;
            }
        }

        return null;
    }

    private function isAlreadyExistsResponse(array $responseData, string $plateNumber): bool
    {
        if ((int) ($responseData['code'] ?? 0) !== 10004) {
            return false;
        }

        $repeatPlateNos = $responseData['data']['repeatPlateNos'] ?? [];
        if (!is_array($repeatPlateNos)) {
            return false;
        }

        $normalizedRepeatPlateNos = array_map(
            static fn (mixed $value): ?string => Truck::normalizePlateNumber((string) $value),
            $repeatPlateNos
        );

        return in_array($plateNumber, array_filter($normalizedRepeatPlateNos), true);
    }

    private function extractVehicleIdFromCandidate(mixed $candidate, ?string $plateNumber = null): ?string
    {
        if (is_array($candidate) && array_is_list($candidate)) {
            foreach ($candidate as $item) {
                $vehicleId = $this->extractVehicleIdFromCandidate($item, $plateNumber);
                if ($vehicleId !== null) {
                    return $vehicleId;
                }
            }

            return null;
        }

        if (!is_array($candidate)) {
            return null;
        }

        $candidatePlate = Truck::normalizePlateNumber((string) ($candidate['plateNo'] ?? $candidate['plate_number'] ?? ''));
        if ($plateNumber && $candidatePlate && $candidatePlate !== $plateNumber) {
            foreach ($candidate as $value) {
                if (is_array($value)) {
                    $vehicleId = $this->extractVehicleIdFromCandidate($value, $plateNumber);
                    if ($vehicleId !== null) {
                        return $vehicleId;
                    }
                }
            }

            return null;
        }

        foreach (['id', 'vehicleId', 'vehicle_id'] as $idKey) {
            $value = $candidate[$idKey] ?? null;
            if ($value !== null && $value !== '') {
                return (string) $value;
            }
        }

        foreach ($candidate as $value) {
            if (is_array($value)) {
                $vehicleId = $this->extractVehicleIdFromCandidate($value, $plateNumber);
                if ($vehicleId !== null) {
                    return $vehicleId;
                }
            }
        }

        return null;
    }

    private function hasOtherActivePermit(EntryPermit $permit): bool
    {
        if (!$permit->truck_id) {
            return false;
        }

        $activeStatusId = Status::where('key', 'active')->value('id');
        if (!$activeStatusId) {
            return false;
        }

        return EntryPermit::query()
            ->where('truck_id', $permit->truck_id)
            ->where('status_id', $activeStatusId)
            ->whereKeyNot($permit->id)
            ->where(function ($query) {
                $query->whereNull('end_date')
                    ->orWhere('end_date', '>=', now()->startOfDay());
            })
            ->exists();
    }

    private function storeParkingPermitRecord(
        EntryPermit $permit,
        array $result,
        ?string $plateNumber = null,
        ?array $payload = null,
        ?array $responseData = null,
        string $action = self::ACTION_SYNC,
        ?DssParkingPermit $parkingPermit = null,
    ): array {
        $syncConfig = config('dss.permit_vehicle_sync');
        $entranceGroups = $payload['vehicles'][0]['entranceGroups'] ?? [];
        $entranceGroupIds = [];

        foreach ($entranceGroups as $group) {
            foreach (($group['entranceGroupIds'] ?? []) as $entranceGroupId) {
                $entranceGroupIds[] = $entranceGroupId;
            }
        }

        $status = $result['status'] ?? match (true) {
            isset($result['error']) => $action === self::ACTION_REVOKE ? 'revoke_failed' : 'failed',
            !empty($result['success']) => $action === self::ACTION_REVOKE ? 'revoked' : 'synced',
            default => $action === self::ACTION_REVOKE ? 'revoke_skipped' : 'skipped',
        };

        $remoteVehicleId = $result['remote_vehicle_id']
            ?? $this->resolveStoredRemoteVehicleId($parkingPermit, $payload);

        $parkingPermit = DssParkingPermit::updateOrCreate(
            ['entry_permit_id' => $permit->id],
            [
                'truck_id' => $permit->truck_id,
                'yard_id' => $permit->yard_id,
                'plate_number' => $plateNumber,
                'remote_vehicle_id' => $remoteVehicleId,
                'status' => $status,
                'person_id' => (string) ($parkingPermit?->person_id ?? ($syncConfig['person_id'] ?? '1')),
                'parking_lot_ids' => array_values(array_filter(array_map(static fn (array $group) => $group['parkingLotId'] ?? null, $entranceGroups))),
                'entrance_group_ids' => array_values($entranceGroupIds),
                'request_payload' => $payload,
                'response_payload' => $responseData ?? ($result['data'] ?? null),
                'error_message' => $result['error'] ?? ($result['reason'] ?? null),
                'synced_at' => $action === self::ACTION_SYNC && !isset($result['error']) && !empty($result['success'])
                    ? now()
                    : ($parkingPermit?->synced_at),
                'revoked_at' => $action === self::ACTION_REVOKE && !isset($result['error']) && !empty($result['success'])
                    ? now()
                    : ($parkingPermit?->revoked_at),
            ]
        );

        $result['parking_permit_id'] = $parkingPermit->id;

        return $result;
    }
}