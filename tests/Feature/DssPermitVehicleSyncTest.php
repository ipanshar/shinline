<?php

namespace Tests\Feature;

use App\Models\EntryPermit;
use App\Models\DssParkingPermit;
use App\Models\Status;
use App\Models\Truck;
use App\Models\User;
use App\Models\Yard;
use App\Services\DssAuthService;
use App\Services\DssPermitVehicleService;
use App\Services\EntryPermitReplacementService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class DssPermitVehicleSyncTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();

        parent::tearDown();
    }

    public function test_entry_permit_replacement_service_deactivates_and_revokes_existing_permits(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $inactiveStatus = Status::create([
            'key' => 'not_active',
            'name' => 'Неактивный',
        ]);

        $yard = Yard::create([
            'name' => 'Main yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $truck = Truck::create([
            'plate_number' => '111AA01',
            'name' => 'Truck 111AA01',
        ]);

        $permit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now()->subDay(),
        ]);

        $dssService = Mockery::mock(DssPermitVehicleService::class);
        $dssService->shouldReceive('revokePermitVehicleSafely')
            ->once()
            ->with(Mockery::on(fn (EntryPermit $argument) => $argument->id === $permit->id))
            ->andReturn(['success' => true, 'action' => 'revoke']);

        app()->instance(DssPermitVehicleService::class, $dssService);

        $replacementService = app(EntryPermitReplacementService::class);

        $result = DB::transaction(fn () => $replacementService->deactivateExistingActivePermits($truck->id, $yard->id));

        $this->assertCount(1, $result['permits']);
        $this->assertSame($permit->id, $result['permits']->first()->id);
        $this->assertSame([
            'success' => true,
            'action' => 'revoke',
        ], $result['dss_results']->all()[0]);

        $this->assertDatabaseHas('entry_permits', [
            'id' => $permit->id,
            'status_id' => $inactiveStatus->id,
        ]);
    }

    public function test_dss_permit_vehicle_service_sends_expected_payload(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $yard = Yard::create([
            'name' => 'Main yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $truck = Truck::create([
            'plate_number' => '777SL05',
            'name' => 'Truck 777SL05',
        ]);

        $permit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
        ]);

        $this->createDssSettings([
            'base_url' => 'http://10.210.0.250',
            'token' => 'live-token',
        ]);

        $history = [];
        $client = $this->makeHistoryMockClient([
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'id' => '25',
                    'plateNo' => '777SL05',
                ],
            ], JSON_THROW_ON_ERROR)),
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'vehicles' => [
                        [
                            'id' => '25',
                            'plateNo' => '777SL05',
                        ],
                    ],
                    'repeatPlateNos' => null,
                ],
            ], JSON_THROW_ON_ERROR)),
        ], $history);

        $authService = Mockery::mock(DssAuthService::class);
        $authService->shouldReceive('ensureAuthorized')->once()->andReturn(['success' => true, 'token' => 'live-token']);

        $service = new DssPermitVehicleService($authService, $client);

        $result = $service->syncPermitVehicle($permit);

        $this->assertTrue($result['success']);
    $this->assertCount(2, $history);
    $this->assertSame('/ipms/api/v1.1/vehicle/fetch-by-plate-no', $history[0]['request']->getUri()->getPath());
    $this->assertSame('/ipms/api/v1.1/vehicle/save/batch', $history[1]['request']->getUri()->getPath());
        $this->assertSame('live-token', $history[0]['request']->getHeaderLine('X-Subject-Token'));

    $payload = json_decode((string) $history[1]['request']->getBody(), true, 512, JSON_THROW_ON_ERROR);

        $this->assertSame('001001', $payload['orgCode']);
        $this->assertSame('Shin-Line', $payload['orgName']);
        $this->assertSame('1', $payload['person']['personId']);
        $this->assertSame('777SL05', $payload['vehicles'][0]['plateNo']);
        $this->assertSame('2', $payload['vehicles'][0]['entranceGroups'][0]['parkingLotId']);
        $this->assertSame(['14'], $payload['vehicles'][0]['entranceGroups'][0]['entranceGroupIds']);

        $this->assertDatabaseHas('dss_parking_permits', [
            'entry_permit_id' => $permit->id,
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'plate_number' => '777SL05',
            'remote_vehicle_id' => '25',
            'status' => 'synced',
            'person_id' => '1',
        ]);
    }

    public function test_dss_permit_vehicle_service_batches_multiple_sync_permits_into_single_dss_request(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $yard = Yard::create([
            'name' => 'Batch yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $firstTruck = Truck::create([
            'plate_number' => 'BAT11105',
            'name' => 'Truck BAT11105',
        ]);

        $secondTruck = Truck::create([
            'plate_number' => 'BAT22205',
            'name' => 'Truck BAT22205',
        ]);

        $firstPermit = EntryPermit::create([
            'truck_id' => $firstTruck->id,
            'yard_id' => $yard->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
            'end_date' => now()->addDay(),
        ]);

        $secondPermit = EntryPermit::create([
            'truck_id' => $secondTruck->id,
            'yard_id' => $yard->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
            'end_date' => now()->addDay(),
        ]);

        $this->createDssSettings([
            'base_url' => 'http://10.210.0.250',
            'token' => 'live-token',
        ]);

        $history = [];
        $client = $this->makeHistoryMockClient([
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'id' => '251',
                    'plateNo' => 'BAT11105',
                ],
            ], JSON_THROW_ON_ERROR)),
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'id' => '252',
                    'plateNo' => 'BAT22205',
                ],
            ], JSON_THROW_ON_ERROR)),
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'vehicles' => [
                        [
                            'id' => '251',
                            'plateNo' => 'BAT11105',
                        ],
                        [
                            'id' => '252',
                            'plateNo' => 'BAT22205',
                        ],
                    ],
                ],
            ], JSON_THROW_ON_ERROR)),
        ], $history);

        $authService = Mockery::mock(DssAuthService::class);
        $authService->shouldReceive('ensureAuthorized')->once()->andReturn(['success' => true, 'token' => 'live-token']);

        $service = new DssPermitVehicleService($authService, $client);

        $results = $service->smartSyncPermitsBatchSafely([$firstPermit, $secondPermit]);

        $this->assertTrue($results[$firstPermit->id]['success']);
        $this->assertTrue($results[$secondPermit->id]['success']);
        $this->assertCount(3, $history);
        $this->assertSame('/ipms/api/v1.1/vehicle/fetch-by-plate-no', $history[0]['request']->getUri()->getPath());
        $this->assertSame('/ipms/api/v1.1/vehicle/fetch-by-plate-no', $history[1]['request']->getUri()->getPath());
        $this->assertSame('/ipms/api/v1.1/vehicle/save/batch', $history[2]['request']->getUri()->getPath());

        $payload = json_decode((string) $history[2]['request']->getBody(), true, 512, JSON_THROW_ON_ERROR);

        $this->assertCount(2, $payload['vehicles']);
        $this->assertSame('BAT11105', $payload['vehicles'][0]['plateNo']);
        $this->assertSame('BAT22205', $payload['vehicles'][1]['plateNo']);

        $this->assertDatabaseHas('dss_parking_permits', [
            'entry_permit_id' => $firstPermit->id,
            'remote_vehicle_id' => '251',
            'status' => 'synced',
        ]);

        $this->assertDatabaseHas('dss_parking_permits', [
            'entry_permit_id' => $secondPermit->id,
            'remote_vehicle_id' => '252',
            'status' => 'synced',
        ]);
    }

    public function test_revoke_permit_vehicle_service_sends_expected_payload(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $yard = Yard::create([
            'name' => 'Main yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $truck = Truck::create([
            'plate_number' => '043AAX01',
            'name' => 'Truck 043AAX01',
        ]);

        $permit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
        ]);

        DssParkingPermit::create([
            'entry_permit_id' => $permit->id,
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'plate_number' => '043AAX01',
            'remote_vehicle_id' => '25',
            'status' => 'synced',
            'person_id' => '1',
            'parking_lot_ids' => ['2'],
            'entrance_group_ids' => ['14'],
            'request_payload' => ['vehicles' => [['plateNo' => '043AAX01']]],
            'response_payload' => ['vehicles' => [['id' => '25', 'plateNo' => '043AAX01']]],
            'synced_at' => now(),
        ]);

        $this->createDssSettings([
            'base_url' => 'http://10.210.0.250',
            'token' => 'live-token',
        ]);

        $history = [];
        $client = $this->makeHistoryMockClient([
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'id' => '25',
                    'plateNo' => '777SL05',
                ],
            ], JSON_THROW_ON_ERROR)),
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'vehicles' => [
                        [
                            'id' => '25',
                            'plateNo' => '043AAX01',
                        ],
                    ],
                ],
            ], JSON_THROW_ON_ERROR)),
        ], $history);

        $authService = Mockery::mock(DssAuthService::class);
        $authService->shouldReceive('ensureAuthorized')->once()->andReturn(['success' => true, 'token' => 'live-token']);

        $service = new DssPermitVehicleService($authService, $client);

        $result = $service->revokePermitVehicle($permit);

        $this->assertTrue($result['success']);
        $this->assertCount(1, $history);

        $payload = json_decode((string) $history[0]['request']->getBody(), true, 512, JSON_THROW_ON_ERROR);

        $this->assertSame('25', $payload['vehicles'][0]['id']);
        $this->assertSame('043AAX01', $payload['vehicles'][0]['plateNo']);
        $this->assertSame('2', $payload['vehicles'][0]['entranceGroups'][0]['parkingLotId']);
        $this->assertSame([], $payload['vehicles'][0]['entranceGroups'][0]['entranceGroupIds']);

        $this->assertDatabaseHas('dss_parking_permits', [
            'entry_permit_id' => $permit->id,
            'status' => 'revoked',
            'remote_vehicle_id' => '25',
        ]);
    }

    public function test_dss_permit_vehicle_service_uses_permit_dates_for_dss_payload(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $yard = Yard::create([
            'name' => 'Main yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $truck = Truck::create([
            'plate_number' => '777SL05',
            'name' => 'Truck 777SL05',
        ]);

        $permit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => '2026-04-02',
            'end_date' => '2026-04-02',
        ]);

        $this->createDssSettings([
            'base_url' => 'http://10.210.0.250',
            'token' => 'live-token',
        ]);

        $history = [];
        $client = $this->makeHistoryMockClient([
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'id' => '25',
                    'plateNo' => '777SL05',
                ],
            ], JSON_THROW_ON_ERROR)),
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'vehicles' => [
                        [
                            'id' => '25',
                            'plateNo' => '777SL05',
                        ],
                    ],
                ],
            ], JSON_THROW_ON_ERROR)),
        ], $history);

        $authService = Mockery::mock(DssAuthService::class);
        $authService->shouldReceive('ensureAuthorized')->once()->andReturn(['success' => true, 'token' => 'live-token']);

        $service = new DssPermitVehicleService($authService, $client);

        $service->syncPermitVehicle($permit);

        $payload = json_decode((string) $history[1]['request']->getBody(), true, 512, JSON_THROW_ON_ERROR);
        $expectedStart = Carbon::parse('2026-04-02', config('app.timezone'))->startOfDay()->timestamp;
        $expectedEnd = Carbon::parse('2026-04-02', config('app.timezone'))->endOfDay()->timestamp;

        $this->assertSame('0', $payload['vehicles'][0]['entranceLongTerm']);
        $this->assertSame((string) $expectedStart, $payload['vehicles'][0]['entranceStartTime']);
        $this->assertSame((string) $expectedEnd, $payload['vehicles'][0]['entranceEndTime']);
        $this->assertSame('0', $payload['vehicles'][0]['entranceGroups'][0]['entranceLongTerm']);
        $this->assertSame((string) $expectedStart, $payload['vehicles'][0]['entranceGroups'][0]['entranceStartTime']);
        $this->assertSame((string) $expectedEnd, $payload['vehicles'][0]['entranceGroups'][0]['entranceEndTime']);
    }

    public function test_dss_permit_vehicle_service_handles_already_existing_vehicle(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $yard = Yard::create([
            'name' => 'Main yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $truck = Truck::create([
            'plate_number' => '777SL05',
            'name' => 'Truck 777SL05',
        ]);

        $permit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
        ]);

        $this->createDssSettings([
            'base_url' => 'http://10.210.0.250',
            'token' => 'live-token',
        ]);

        $history = [];
        $client = $this->makeHistoryMockClient([
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'id' => '13',
                    'plateNo' => '777SL05',
                    'entranceEffectiveStatus' => '1',
                ],
            ], JSON_THROW_ON_ERROR)),
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 10004,
                'desc' => 'The car num is already exists or repeat.',
                'data' => [
                    'repeatPlateNos' => ['777SL05'],
                    'visiterExistingPlateNos' => [],
                    'groupExistingPlateNos' => [],
                    'overstepPlateNos' => null,
                ],
            ], JSON_THROW_ON_ERROR)),
        ], $history);

        $authService = Mockery::mock(DssAuthService::class);
        $authService->shouldReceive('ensureAuthorized')->once()->andReturn(['success' => true, 'token' => 'live-token']);

        $service = new DssPermitVehicleService($authService, $client);

        $result = $service->syncPermitVehicle($permit);

        $this->assertTrue($result['success']);
        $this->assertTrue($result['already_exists']);
        $this->assertSame('already_exists', $result['status']);

        $this->assertDatabaseHas('dss_parking_permits', [
            'entry_permit_id' => $permit->id,
            'plate_number' => '777SL05',
            'status' => 'already_exists',
        ]);
    }

    public function test_dss_permit_vehicle_service_ignores_html_lookup_response_without_failing_sync(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $yard = Yard::create([
            'name' => 'HTML lookup yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $truck = Truck::create([
            'plate_number' => 'HTM11105',
            'name' => 'Truck HTM11105',
        ]);

        $permit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
        ]);

        $this->createDssSettings([
            'base_url' => 'http://10.210.0.250',
            'token' => 'live-token',
        ]);

        $history = [];
        $client = $this->makeHistoryMockClient([
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'text/html; charset=windows-1251'], '<html><body>500 - Internal server error.</body></html>'),
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'vehicles' => [
                        [
                            'id' => '88',
                            'plateNo' => 'HTM11105',
                        ],
                    ],
                ],
            ], JSON_THROW_ON_ERROR)),
        ], $history);

        $authService = Mockery::mock(DssAuthService::class);
        $authService->shouldReceive('ensureAuthorized')->once()->andReturn(['success' => true, 'token' => 'live-token']);

        $service = new DssPermitVehicleService($authService, $client);

        $result = $service->syncPermitVehicle($permit);

        $this->assertTrue($result['success']);
        $this->assertCount(2, $history);
        $this->assertDatabaseHas('dss_parking_permits', [
            'entry_permit_id' => $permit->id,
            'status' => 'synced',
            'remote_vehicle_id' => '88',
        ]);
    }

    public function test_dss_permit_vehicle_service_handles_html_batch_response_as_sync_failure(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $yard = Yard::create([
            'name' => 'HTML batch yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $truck = Truck::create([
            'plate_number' => 'HTM22205',
            'name' => 'Truck HTM22205',
        ]);

        $permit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
        ]);

        $this->createDssSettings([
            'base_url' => 'http://10.210.0.250',
            'token' => 'live-token',
        ]);

        $history = [];
        $client = $this->makeHistoryMockClient([
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'id' => '89',
                    'plateNo' => 'HTM22205',
                ],
            ], JSON_THROW_ON_ERROR)),
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'text/html; charset=windows-1251'], '<html><body>500 - Internal server error.</body></html>'),
        ], $history);

        $authService = Mockery::mock(DssAuthService::class);
        $authService->shouldReceive('ensureAuthorized')->once()->andReturn(['success' => true, 'token' => 'live-token']);

        $service = new DssPermitVehicleService($authService, $client);

        $result = $service->syncPermitVehicle($permit);

        $this->assertFalse($result['success'] ?? false);
        $this->assertStringContainsString('DSS вернул некорректный ответ при регистрации ТС для парковки', $result['error']);
        $this->assertCount(2, $history);
        $this->assertDatabaseHas('dss_parking_permits', [
            'entry_permit_id' => $permit->id,
            'status' => 'failed',
        ]);
    }

    public function test_dss_permit_vehicle_service_reuses_previous_remote_vehicle_id_for_same_truck_and_yard(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $inactiveStatus = Status::create([
            'key' => 'not_active',
            'name' => 'Неактивный',
        ]);

        $yard = Yard::create([
            'name' => 'Main yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $truck = Truck::create([
            'plate_number' => '187AAB17',
            'name' => 'Truck 187AAB17',
        ]);

        $oldPermit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'one_permission' => true,
            'status_id' => $inactiveStatus->id,
            'begin_date' => now()->subDays(3),
            'end_date' => now()->subDays(2),
        ]);

        DssParkingPermit::create([
            'entry_permit_id' => $oldPermit->id,
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'plate_number' => '187AAB17',
            'remote_vehicle_id' => '25',
            'status' => 'revoked',
            'person_id' => '1',
            'parking_lot_ids' => ['2'],
            'entrance_group_ids' => ['14'],
            'request_payload' => ['vehicles' => [['id' => '25', 'plateNo' => '187AAB17']]],
            'response_payload' => ['vehicles' => [['id' => '25', 'plateNo' => '187AAB17']]],
            'synced_at' => now()->subDays(3),
            'revoked_at' => now()->subDays(2),
        ]);

        $newPermit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => '2026-04-02',
            'end_date' => '2026-04-02',
        ]);

        $this->createDssSettings([
            'base_url' => 'http://10.210.0.250',
            'token' => 'live-token',
        ]);

        $history = [];
        $client = $this->makeHistoryMockClient([
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'vehicles' => [
                        [
                            'id' => '25',
                            'plateNo' => '187AAB17',
                        ],
                    ],
                ],
            ], JSON_THROW_ON_ERROR)),
        ], $history);

        $authService = Mockery::mock(DssAuthService::class);
        $authService->shouldReceive('ensureAuthorized')->once()->andReturn(['success' => true, 'token' => 'live-token']);

        $service = new DssPermitVehicleService($authService, $client);

        $result = $service->syncPermitVehicle($newPermit);

        $this->assertTrue($result['success']);
        $payload = json_decode((string) $history[0]['request']->getBody(), true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('25', $payload['vehicles'][0]['id']);

        $this->assertDatabaseHas('dss_parking_permits', [
            'entry_permit_id' => $newPermit->id,
            'remote_vehicle_id' => '25',
            'status' => 'synced',
        ]);
    }

    public function test_dss_permit_vehicle_service_looks_up_remote_vehicle_id_by_plate_when_local_mapping_missing(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $yard = Yard::create([
            'name' => 'Lookup yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $truck = Truck::create([
            'plate_number' => '187AAB17',
            'name' => 'Truck 187AAB17',
        ]);

        $permit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => '2026-04-02',
            'end_date' => '2026-04-02',
        ]);

        $this->createDssSettings([
            'base_url' => 'http://10.210.0.250',
            'token' => 'live-token',
        ]);

        $history = [];
        $client = $this->makeHistoryMockClient([
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'id' => '549',
                    'plateNo' => '187AAB17',
                    'personId' => '',
                    'personInfo' => ['personId' => ''],
                    'entranceGroups' => [[
                        'groupId' => '14',
                        'parkingLotId' => '2',
                    ]],
                ],
            ], JSON_THROW_ON_ERROR)),
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'vehicles' => [[
                        'id' => '549',
                        'plateNo' => '187AAB17',
                    ]],
                ],
            ], JSON_THROW_ON_ERROR)),
        ], $history);

        $authService = Mockery::mock(DssAuthService::class);
        $authService->shouldReceive('ensureAuthorized')->once()->andReturn(['success' => true, 'token' => 'live-token']);

        $service = new DssPermitVehicleService($authService, $client);

        $result = $service->syncPermitVehicle($permit);

        $this->assertTrue($result['success']);
        $this->assertCount(2, $history);
        $this->assertSame('/ipms/api/v1.1/vehicle/fetch-by-plate-no', $history[0]['request']->getUri()->getPath());
        $lookupPayload = json_decode((string) $history[0]['request']->getBody(), true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('187AAB17', $lookupPayload['plateNo']);
        $this->assertSame('0', $lookupPayload['filterAuthorityOrg']);

        $payload = json_decode((string) $history[1]['request']->getBody(), true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('549', $payload['vehicles'][0]['id']);

        $this->assertDatabaseHas('dss_parking_permits', [
            'entry_permit_id' => $permit->id,
            'remote_vehicle_id' => '549',
            'status' => 'synced',
        ]);
    }

    public function test_dss_permit_vehicle_service_can_backfill_remote_vehicle_ids_for_processed_permits(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $yard = Yard::create([
            'name' => 'Backfill yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $truck = Truck::create([
            'plate_number' => '187AAB17',
            'name' => 'Truck 187AAB17',
        ]);

        $permit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
        ]);

        DssParkingPermit::create([
            'entry_permit_id' => $permit->id,
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'plate_number' => '187AAB17',
            'remote_vehicle_id' => null,
            'status' => 'already_exists',
            'person_id' => '1',
            'parking_lot_ids' => [],
            'entrance_group_ids' => [],
            'request_payload' => ['vehicles' => [['plateNo' => '187AAB17']]],
            'response_payload' => ['code' => 10004],
        ]);

        $this->createDssSettings([
            'base_url' => 'http://10.210.0.250',
            'token' => 'live-token',
        ]);

        $history = [];
        $client = $this->makeHistoryMockClient([
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'id' => '549',
                    'plateNo' => '187AAB17',
                    'personId' => '',
                    'personInfo' => ['personId' => ''],
                    'entranceGroups' => [[
                        'groupId' => '14',
                        'parkingLotId' => '2',
                    ]],
                ],
            ], JSON_THROW_ON_ERROR)),
        ], $history);

        $authService = Mockery::mock(DssAuthService::class);
        $authService->shouldReceive('ensureAuthorized')->once()->andReturn(['success' => true, 'token' => 'live-token']);

        $service = new DssPermitVehicleService($authService, $client);

        $result = $service->backfillRemoteVehicleIdsForPermits([$permit->id]);

        $this->assertSame(['checked' => 1, 'updated' => 1, 'not_found' => 0, 'failed' => 0], $result);
        $this->assertCount(1, $history);
        $this->assertSame('/ipms/api/v1.1/vehicle/fetch-by-plate-no', $history[0]['request']->getUri()->getPath());

        $this->assertDatabaseHas('dss_parking_permits', [
            'entry_permit_id' => $permit->id,
            'remote_vehicle_id' => '549',
            'person_id' => '1',
        ]);
    }

    public function test_dss_permit_vehicle_service_smart_sync_skips_when_active_permit_already_exists_in_dss(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $yard = Yard::create([
            'name' => 'Smart sync yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $truck = Truck::create([
            'plate_number' => '555TT05',
            'name' => 'Truck 555TT05',
        ]);

        $permit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
            'end_date' => now()->addDay(),
        ]);

        DssParkingPermit::create([
            'entry_permit_id' => $permit->id,
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'plate_number' => '555TT05',
            'remote_vehicle_id' => null,
            'status' => 'synced',
            'person_id' => '1',
            'parking_lot_ids' => ['2'],
            'entrance_group_ids' => ['14'],
        ]);

        $this->createDssSettings([
            'base_url' => 'http://10.210.0.250',
            'token' => 'live-token',
        ]);

        $history = [];
        $client = $this->makeHistoryMockClient([
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'id' => '549',
                    'plateNo' => '555TT05',
                    'entranceEffectiveStatus' => '1',
                    'entranceLongTerm' => '1',
                    'entranceGroups' => [[
                        'groupId' => '14',
                        'parkingLotId' => '2',
                        'entranceLongTerm' => '1',
                    ]],
                ],
            ], JSON_THROW_ON_ERROR)),
        ], $history);

        $authService = Mockery::mock(DssAuthService::class);
        $authService->shouldReceive('ensureAuthorized')->once()->andReturn(['success' => true, 'token' => 'live-token']);

        $service = new DssPermitVehicleService($authService, $client);

        $result = $service->smartSyncPermitVehicle($permit);

        $this->assertFalse($result['success']);
        $this->assertTrue($result['skipped']);
        $this->assertSame('dss_permission_already_active', $result['reason']);
        $this->assertCount(1, $history);
        $this->assertDatabaseHas('dss_parking_permits', [
            'entry_permit_id' => $permit->id,
            'remote_vehicle_id' => '549',
            'status' => 'synced',
        ]);
    }

    public function test_dss_permit_vehicle_service_smart_sync_skips_when_inactive_permit_absent_in_dss(): void
    {
        $inactiveStatus = Status::create([
            'key' => 'not_active',
            'name' => 'Неактивный',
        ]);

        $yard = Yard::create([
            'name' => 'Smart revoke yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $truck = Truck::create([
            'plate_number' => '666TT06',
            'name' => 'Truck 666TT06',
        ]);

        $permit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'one_permission' => true,
            'status_id' => $inactiveStatus->id,
            'begin_date' => now()->subDays(2),
            'end_date' => now()->subDay(),
        ]);

        $this->createDssSettings([
            'base_url' => 'http://10.210.0.250',
            'token' => 'live-token',
        ]);

        $history = [];
        $client = $this->makeHistoryMockClient([
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'id' => '701',
                    'plateNo' => '666TT06',
                ],
            ], JSON_THROW_ON_ERROR)),
        ], $history);

        $authService = Mockery::mock(DssAuthService::class);
        $authService->shouldReceive('ensureAuthorized')->once()->andReturn(['success' => true, 'token' => 'live-token']);

        $service = new DssPermitVehicleService($authService, $client);

        $result = $service->smartSyncPermitVehicle($permit);

        $this->assertFalse($result['success']);
        $this->assertTrue($result['skipped']);
        $this->assertSame('dss_permission_not_active', $result['reason']);
        $this->assertCount(1, $history);
    }

    public function test_dss_permit_vehicle_service_retries_on_rate_limit(): void
    {
        config()->set('dss.permit_vehicle_sync.retry_attempts', 2);
        config()->set('dss.permit_vehicle_sync.retry_delay_ms', 0);

        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $yard = Yard::create([
            'name' => 'Main yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $truck = Truck::create([
            'plate_number' => '701AA05',
            'name' => 'Truck 701AA05',
        ]);

        $permit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
        ]);

        $this->createDssSettings([
            'base_url' => 'http://10.210.0.250',
            'token' => 'live-token',
        ]);

        $history = [];
        $client = $this->makeHistoryMockClient([
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'id' => '77',
                    'plateNo' => '701AA05',
                ],
            ], JSON_THROW_ON_ERROR)),
            new \GuzzleHttp\Exception\ClientException(
                '429 Too Many Requests',
                new \GuzzleHttp\Psr7\Request('POST', 'http://10.210.0.250/ipms/api/v1.1/vehicle/save/batch'),
                new \GuzzleHttp\Psr7\Response(429, ['Content-Type' => 'text/html'], '<html><body>429 Too Many Requests</body></html>')
            ),
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'vehicles' => [
                        [
                            'id' => '77',
                            'plateNo' => '701AA05',
                        ],
                    ],
                ],
            ], JSON_THROW_ON_ERROR)),
        ], $history);

        $authService = Mockery::mock(DssAuthService::class);
        $authService->shouldReceive('ensureAuthorized')->once()->andReturn(['success' => true, 'token' => 'live-token']);

        $service = new DssPermitVehicleService($authService, $client);

        $result = $service->syncPermitVehicle($permit);

        $this->assertTrue($result['success']);
        $this->assertCount(3, $history);
        $this->assertDatabaseHas('dss_parking_permits', [
            'entry_permit_id' => $permit->id,
            'status' => 'synced',
            'remote_vehicle_id' => '77',
        ]);
    }

    public function test_add_permit_triggers_dss_vehicle_sync(): void
    {
        Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $user = User::factory()->create();
        $yard = Yard::create([
            'name' => 'North yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);
        $truck = Truck::create([
            'plate_number' => 'A123BC77',
            'name' => 'Truck A123BC77',
        ]);

        $service = Mockery::mock(DssPermitVehicleService::class);
        $service->shouldReceive('syncPermitVehicleSafely')
            ->once()
            ->andReturn(['success' => true, 'plate_number' => 'A123BC77']);

        app()->instance(DssPermitVehicleService::class, $service);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/security/addpermit', [
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'granted_by_user_id' => $user->id,
            'one_permission' => true,
            'begin_date' => now()->toDateString(),
            'end_date' => now()->addDay()->toDateString(),
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('dss_vehicle_sync.success', true);

        $this->assertDatabaseHas('entry_permits', [
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
        ]);
    }

    public function test_add_permit_replaces_existing_active_permit(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $inactiveStatus = Status::create([
            'key' => 'not_active',
            'name' => 'Неактивный',
        ]);

        $user = User::factory()->create();
        $yard = Yard::create([
            'name' => 'North yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);
        $truck = Truck::create([
            'plate_number' => 'A123BC77',
            'name' => 'Truck A123BC77',
        ]);

        $oldPermit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'granted_by_user_id' => $user->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now()->subDay(),
        ]);

        $service = Mockery::mock(DssPermitVehicleService::class);
        $service->shouldReceive('revokePermitVehicleSafely')
            ->once()
            ->with(Mockery::on(fn (EntryPermit $argument) => $argument->id === $oldPermit->id))
            ->andReturn(['success' => true, 'action' => 'revoke']);
        $service->shouldReceive('syncPermitVehicleSafely')
            ->once()
            ->with(Mockery::on(fn (EntryPermit $argument) => $argument->id !== $oldPermit->id))
            ->andReturn(['success' => true, 'action' => 'sync']);

        app()->instance(DssPermitVehicleService::class, $service);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/security/addpermit', [
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'granted_by_user_id' => $user->id,
            'one_permission' => false,
            'begin_date' => now()->toDateString(),
            'end_date' => now()->addDay()->toDateString(),
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('replaced_permits_count', 1)
            ->assertJsonPath('data.truck_id', $truck->id)
            ->assertJsonPath('data.status_id', $activeStatus->id);

        $this->assertDatabaseHas('entry_permits', [
            'id' => $oldPermit->id,
            'status_id' => $inactiveStatus->id,
        ]);

        $this->assertSame(2, EntryPermit::count());
    }

    public function test_get_permits_returns_dss_parking_sync_fields(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $user = User::factory()->create();
        $yard = Yard::create([
            'name' => 'South yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);
        $truck = Truck::create([
            'plate_number' => 'B456CD01',
            'name' => 'Truck B456CD01',
        ]);

        $permit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'granted_by_user_id' => $user->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
        ]);

        DssParkingPermit::create([
            'entry_permit_id' => $permit->id,
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'plate_number' => 'B456CD01',
            'status' => 'failed',
            'person_id' => '1',
            'parking_lot_ids' => ['2'],
            'entrance_group_ids' => ['14'],
            'request_payload' => ['vehicles' => [['plateNo' => 'B456CD01']]],
            'response_payload' => ['code' => 5000],
            'error_message' => 'DSS temporary error',
            'synced_at' => null,
        ]);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/security/getpermits', []);

        $response
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.0.id', $permit->id)
            ->assertJsonPath('data.0.dss_parking_status', 'failed')
            ->assertJsonPath('data.0.dss_parking_error_message', 'DSS temporary error');
    }

    public function test_add_permit_requires_begin_and_end_dates(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $user = User::factory()->create();
        $yard = Yard::create([
            'name' => 'Dates yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);
        $truck = Truck::create([
            'plate_number' => 'C789DE02',
            'name' => 'Truck C789DE02',
        ]);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/security/addpermit', [
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'granted_by_user_id' => $user->id,
            'one_permission' => false,
        ]);

        $response
            ->assertStatus(422)
            ->assertJsonPath('status', false)
            ->assertJsonValidationErrors(['begin_date', 'end_date']);

        $this->assertDatabaseMissing('entry_permits', [
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'status_id' => $activeStatus->id,
        ]);
    }

    public function test_deactivate_permit_triggers_dss_vehicle_revoke(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $inactiveStatus = Status::create([
            'key' => 'not_active',
            'name' => 'Неактивный',
        ]);

        $user = User::factory()->create();
        $yard = Yard::create([
            'name' => 'West yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);
        $truck = Truck::create([
            'plate_number' => 'K700AA01',
            'name' => 'Truck K700AA01',
        ]);

        $permit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'granted_by_user_id' => $user->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
        ]);

        $service = Mockery::mock(DssPermitVehicleService::class);
        $service->shouldReceive('revokePermitVehicleSafely')
            ->once()
            ->with(Mockery::on(fn (EntryPermit $argument) => $argument->id === $permit->id))
            ->andReturn(['success' => true, 'parking_permit_id' => 123]);

        app()->instance(DssPermitVehicleService::class, $service);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/security/deactivatepermit', [
            'id' => $permit->id,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.status_id', $inactiveStatus->id)
            ->assertJsonPath('dss_vehicle_revoke.success', true);
    }

    public function test_delete_inactive_permit_runs_dss_smart_sync_before_deletion(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $inactiveStatus = Status::create([
            'key' => 'not_active',
            'name' => 'Неактивный',
        ]);

        $user = User::factory()->create();
        $yard = Yard::create([
            'name' => 'Delete yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);
        $truck = Truck::create([
            'plate_number' => 'DEL70001',
            'name' => 'Truck DEL70001',
        ]);

        $permit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'granted_by_user_id' => $user->id,
            'one_permission' => true,
            'status_id' => $inactiveStatus->id,
            'begin_date' => now()->subDay(),
            'end_date' => now()->subHour(),
        ]);

        $service = Mockery::mock(DssPermitVehicleService::class);
        $service->shouldReceive('smartSyncPermitVehicleSafely')
            ->once()
            ->with(Mockery::on(fn (EntryPermit $argument) => $argument->id === $permit->id))
            ->andReturn(['success' => false, 'skipped' => true, 'reason' => 'dss_permission_not_active', 'action' => 'revoke']);

        app()->instance(DssPermitVehicleService::class, $service);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/security/deletepermit', [
            'id' => $permit->id,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('dss_vehicle_sync.reason', 'dss_permission_not_active');

        $this->assertDatabaseMissing('entry_permits', [
            'id' => $permit->id,
        ]);
    }

    public function test_delete_inactive_permit_is_cancelled_when_dss_sync_fails(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $inactiveStatus = Status::create([
            'key' => 'not_active',
            'name' => 'Неактивный',
        ]);

        $user = User::factory()->create();
        $yard = Yard::create([
            'name' => 'Delete fail yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);
        $truck = Truck::create([
            'plate_number' => 'DEL70002',
            'name' => 'Truck DEL70002',
        ]);

        $permit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'granted_by_user_id' => $user->id,
            'one_permission' => true,
            'status_id' => $inactiveStatus->id,
            'begin_date' => now()->subDay(),
            'end_date' => now()->subHour(),
        ]);

        $service = Mockery::mock(DssPermitVehicleService::class);
        $service->shouldReceive('smartSyncPermitVehicleSafely')
            ->once()
            ->with(Mockery::on(fn (EntryPermit $argument) => $argument->id === $permit->id))
            ->andReturn(['error' => 'DSS unavailable', 'action' => 'revoke']);

        app()->instance(DssPermitVehicleService::class, $service);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/security/deletepermit', [
            'id' => $permit->id,
        ]);

        $response
            ->assertStatus(422)
            ->assertJsonPath('status', false)
            ->assertJsonPath('dss_vehicle_sync.error', 'DSS unavailable');

        $this->assertDatabaseHas('entry_permits', [
            'id' => $permit->id,
        ]);
    }

    public function test_sync_permits_with_dss_processes_active_and_inactive_permits(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $inactiveStatus = Status::create([
            'key' => 'not_active',
            'name' => 'Неактивный',
        ]);

        $user = User::factory()->create();
        $yard = Yard::create([
            'name' => 'Sync yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $activeTruck = Truck::create([
            'plate_number' => 'S111AA01',
            'name' => 'Truck S111AA01',
        ]);

        $inactiveTruck = Truck::create([
            'plate_number' => 'S222BB01',
            'name' => 'Truck S222BB01',
        ]);

        $activePermit = EntryPermit::create([
            'truck_id' => $activeTruck->id,
            'yard_id' => $yard->id,
            'granted_by_user_id' => $user->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
            'end_date' => now()->addDay(),
        ]);

        $inactivePermit = EntryPermit::create([
            'truck_id' => $inactiveTruck->id,
            'yard_id' => $yard->id,
            'granted_by_user_id' => $user->id,
            'one_permission' => true,
            'status_id' => $inactiveStatus->id,
            'begin_date' => now()->subDay(),
            'end_date' => now()->subHour(),
        ]);

        $service = Mockery::mock(DssPermitVehicleService::class);
        $service->shouldReceive('smartSyncPermitsBatchSafely')
            ->once()
            ->with(Mockery::on(fn (array $arguments) => count($arguments) === 2
                && collect($arguments)->pluck('id')->sort()->values()->all() === [$activePermit->id, $inactivePermit->id]))
            ->andReturn([
                $activePermit->id => ['success' => true, 'action' => 'sync'],
                $inactivePermit->id => ['success' => true, 'action' => 'revoke', 'status' => 'revoked'],
            ]);
        $service->shouldReceive('backfillRemoteVehicleIdsForPermits')
            ->once()
            ->with(Mockery::type('array'))
            ->andReturn(['checked' => 0, 'updated' => 0, 'not_found' => 0, 'failed' => 0]);

        app()->instance(DssPermitVehicleService::class, $service);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/security/syncpermitsdss', [
            'yard_id' => $yard->id,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('summary.processed', 2)
            ->assertJsonPath('summary.synced', 1)
            ->assertJsonPath('summary.revoked', 1)
            ->assertJsonPath('summary.failed', 0)
            ->assertJsonPath('summary.skipped', 0)
            ->assertJsonPath('remote_vehicle_id_backfill.updated', 0);
    }

    public function test_sync_permits_with_dss_deactivates_expired_active_permit_before_dss_revoke(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $inactiveStatus = Status::create([
            'key' => 'not_active',
            'name' => 'Неактивный',
        ]);

        $user = User::factory()->create();
        $yard = Yard::create([
            'name' => 'Expired sync yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $truck = Truck::create([
            'plate_number' => 'EXP11105',
            'name' => 'Truck EXP11105',
        ]);

        $expiredPermit = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'granted_by_user_id' => $user->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now()->subDays(2),
            'end_date' => now()->subDay(),
        ]);

        $service = Mockery::mock(DssPermitVehicleService::class);
        $service->shouldReceive('smartSyncPermitsBatchSafely')
            ->once()
            ->with(Mockery::on(fn (array $arguments) => count($arguments) === 1
                && $arguments[0] instanceof EntryPermit
                && $arguments[0]->id === $expiredPermit->id
                && (int) $arguments[0]->status_id === $inactiveStatus->id))
            ->andReturn([
                $expiredPermit->id => ['success' => true, 'action' => 'revoke', 'status' => 'revoked'],
            ]);
        $service->shouldReceive('backfillRemoteVehicleIdsForPermits')
            ->once()
            ->with(Mockery::type('array'))
            ->andReturn(['checked' => 1, 'updated' => 1, 'not_found' => 0, 'failed' => 0]);

        app()->instance(DssPermitVehicleService::class, $service);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/security/syncpermitsdss', [
            'yard_id' => $yard->id,
            'dss_sync_scope' => 'all',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('summary.processed', 1)
            ->assertJsonPath('summary.revoked', 1);

        $this->assertDatabaseHas('entry_permits', [
            'id' => $expiredPermit->id,
            'status_id' => $inactiveStatus->id,
        ]);
    }

    public function test_sync_permits_with_dss_can_filter_only_failed_records(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $user = User::factory()->create();
        $yard = Yard::create([
            'name' => 'Sync yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $failedTruck = Truck::create([
            'plate_number' => 'F111AA05',
            'name' => 'Truck F111AA05',
        ]);

        $alreadyExistsTruck = Truck::create([
            'plate_number' => 'E111AA05',
            'name' => 'Truck E111AA05',
        ]);

        $noStatusTruck = Truck::create([
            'plate_number' => 'N111AA05',
            'name' => 'Truck N111AA05',
        ]);

        $failedPermit = EntryPermit::create([
            'truck_id' => $failedTruck->id,
            'yard_id' => $yard->id,
            'granted_by_user_id' => $user->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
            'end_date' => now()->addDay(),
        ]);

        $alreadyExistsPermit = EntryPermit::create([
            'truck_id' => $alreadyExistsTruck->id,
            'yard_id' => $yard->id,
            'granted_by_user_id' => $user->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
            'end_date' => now()->addDay(),
        ]);

        $noStatusPermit = EntryPermit::create([
            'truck_id' => $noStatusTruck->id,
            'yard_id' => $yard->id,
            'granted_by_user_id' => $user->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
            'end_date' => now()->addDay(),
        ]);

        DssParkingPermit::create([
            'entry_permit_id' => $failedPermit->id,
            'truck_id' => $failedTruck->id,
            'yard_id' => $yard->id,
            'plate_number' => 'F111AA05',
            'status' => 'failed',
            'person_id' => '1',
        ]);

        DssParkingPermit::create([
            'entry_permit_id' => $alreadyExistsPermit->id,
            'truck_id' => $alreadyExistsTruck->id,
            'yard_id' => $yard->id,
            'plate_number' => 'E111AA05',
            'status' => 'already_exists',
            'person_id' => '1',
        ]);

        $service = Mockery::mock(DssPermitVehicleService::class);
        $service->shouldReceive('smartSyncPermitsBatchSafely')
            ->once()
            ->with(Mockery::on(fn (array $arguments) => count($arguments) === 1
                && $arguments[0] instanceof EntryPermit
                && $arguments[0]->id === $failedPermit->id))
            ->andReturn([
                $failedPermit->id => ['success' => true, 'action' => 'sync'],
            ]);
        $service->shouldReceive('backfillRemoteVehicleIdsForPermits')
            ->once()
            ->with(Mockery::type('array'))
            ->andReturn(['checked' => 1, 'updated' => 0, 'not_found' => 1, 'failed' => 0]);

        app()->instance(DssPermitVehicleService::class, $service);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/security/syncpermitsdss', [
            'yard_id' => $yard->id,
            'dss_sync_scope' => 'failed',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('summary.processed', 1)
            ->assertJsonPath('summary.synced', 1)
            ->assertJsonPath('summary.revoked', 0);
    }

    public function test_sync_permits_with_dss_respects_batch_limit(): void
    {
        config()->set('dss.permit_vehicle_sync.max_batch_size', 2);

        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $user = User::factory()->create();
        $yard = Yard::create([
            'name' => 'Limited sync yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $permits = collect(range(1, 3))->map(function (int $index) use ($activeStatus, $user, $yard) {
            $truck = Truck::create([
                'plate_number' => 'LIM' . $index . 'AA05',
                'name' => 'Truck LIM' . $index,
            ]);

            return EntryPermit::create([
                'truck_id' => $truck->id,
                'yard_id' => $yard->id,
                'granted_by_user_id' => $user->id,
                'one_permission' => true,
                'status_id' => $activeStatus->id,
                'begin_date' => now(),
                'end_date' => now()->addDay(),
            ]);
        });

        $service = Mockery::mock(DssPermitVehicleService::class);
        $service->shouldReceive('smartSyncPermitsBatchSafely')
            ->once()
            ->with(Mockery::on(fn (array $arguments) => count($arguments) === 2
                && collect($arguments)->pluck('id')->sort()->values()->all() === [$permits[0]->id, $permits[1]->id]))
            ->andReturn([
                $permits[0]->id => ['success' => true, 'action' => 'sync'],
                $permits[1]->id => ['success' => true, 'action' => 'sync'],
            ]);
        $service->shouldReceive('backfillRemoteVehicleIdsForPermits')
            ->once()
            ->with(Mockery::type('array'))
            ->andReturn(['checked' => 2, 'updated' => 0, 'not_found' => 2, 'failed' => 0]);

        app()->instance(DssPermitVehicleService::class, $service);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/security/syncpermitsdss', [
            'yard_id' => $yard->id,
            'dss_sync_scope' => 'all',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('summary.processed', 2)
            ->assertJsonPath('matching_total', 3)
            ->assertJsonPath('remaining', 1)
            ->assertJsonPath('batch_limit', 2);
    }

    public function test_sync_permits_with_dss_can_exclude_already_processed_permits(): void
    {
        config()->set('dss.permit_vehicle_sync.max_batch_size', 2);

        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $user = User::factory()->create();
        $yard = Yard::create([
            'name' => 'Excluded sync yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $permits = collect(range(1, 3))->map(function (int $index) use ($activeStatus, $user, $yard) {
            $truck = Truck::create([
                'plate_number' => 'EXC' . $index . 'AA05',
                'name' => 'Truck EXC' . $index,
            ]);

            return EntryPermit::create([
                'truck_id' => $truck->id,
                'yard_id' => $yard->id,
                'granted_by_user_id' => $user->id,
                'one_permission' => true,
                'status_id' => $activeStatus->id,
                'begin_date' => now(),
                'end_date' => now()->addDay(),
            ]);
        });

        $service = Mockery::mock(DssPermitVehicleService::class);
        $service->shouldReceive('smartSyncPermitsBatchSafely')
            ->once()
            ->with(Mockery::on(fn (array $arguments) => count($arguments) === 1
                && $arguments[0] instanceof EntryPermit
                && $arguments[0]->id === $permits[2]->id))
            ->andReturn([
                $permits[2]->id => ['success' => true, 'action' => 'sync'],
            ]);
        $service->shouldReceive('backfillRemoteVehicleIdsForPermits')
            ->once()
            ->with(Mockery::type('array'))
            ->andReturn(['checked' => 1, 'updated' => 0, 'not_found' => 1, 'failed' => 0]);

        app()->instance(DssPermitVehicleService::class, $service);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/security/syncpermitsdss', [
            'yard_id' => $yard->id,
            'dss_sync_scope' => 'all',
            'exclude_permit_ids' => [$permits[0]->id, $permits[1]->id],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('summary.processed', 1)
            ->assertJsonPath('matching_total', 1)
            ->assertJsonPath('remaining', 0)
            ->assertJsonPath('processed_permit_ids.0', $permits[2]->id);
    }

    public function test_revoke_is_skipped_when_another_active_permit_exists(): void
    {
        $activeStatus = Status::create([
            'key' => 'active',
            'name' => 'Активный',
        ]);

        $yard = Yard::create([
            'name' => 'Reserve yard',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $truck = Truck::create([
            'plate_number' => 'T555TT01',
            'name' => 'Truck T555TT01',
        ]);

        $permitToDeactivate = EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'one_permission' => true,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
        ]);

        EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'one_permission' => false,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
            'end_date' => now()->addDay(),
        ]);

        DssParkingPermit::create([
            'entry_permit_id' => $permitToDeactivate->id,
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'plate_number' => 'T555TT01',
            'remote_vehicle_id' => '77',
            'status' => 'synced',
            'person_id' => '1',
            'parking_lot_ids' => ['2'],
            'entrance_group_ids' => ['14'],
            'synced_at' => now(),
        ]);

        $this->createDssSettings([
            'base_url' => 'http://10.210.0.250',
            'token' => 'live-token',
        ]);

        $history = [];
        $client = $this->makeHistoryMockClient([], $history);

        $authService = Mockery::mock(DssAuthService::class);
        $authService->shouldNotReceive('ensureAuthorized');

        $service = new DssPermitVehicleService($authService, $client);

        $result = $service->revokePermitVehicle($permitToDeactivate);

        $this->assertArrayNotHasKey('error', $result);
        $this->assertTrue($result['skipped']);
        $this->assertSame('another_active_permit_exists', $result['reason']);
        $this->assertCount(0, $history);

        $this->assertDatabaseHas('dss_parking_permits', [
            'entry_permit_id' => $permitToDeactivate->id,
            'status' => 'revoke_skipped',
            'remote_vehicle_id' => '77',
        ]);
    }
}