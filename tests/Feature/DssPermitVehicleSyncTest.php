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
use Illuminate\Support\Carbon;
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
        $this->assertCount(1, $history);
        $this->assertSame('/ipms/api/v1.1/vehicle/save/batch', $history[0]['request']->getUri()->getPath());
        $this->assertSame('live-token', $history[0]['request']->getHeaderLine('X-Subject-Token'));

        $payload = json_decode((string) $history[0]['request']->getBody(), true, 512, JSON_THROW_ON_ERROR);

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

        $payload = json_decode((string) $history[0]['request']->getBody(), true, 512, JSON_THROW_ON_ERROR);
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
        $service->shouldReceive('syncPermitVehicleSafely')
            ->once()
            ->with(Mockery::on(fn (EntryPermit $argument) => $argument->id === $activePermit->id))
            ->andReturn(['success' => true, 'action' => 'sync']);
        $service->shouldReceive('revokePermitVehicleSafely')
            ->once()
            ->with(Mockery::on(fn (EntryPermit $argument) => $argument->id === $inactivePermit->id))
            ->andReturn(['success' => true, 'action' => 'revoke', 'status' => 'revoked']);

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
            ->assertJsonPath('summary.skipped', 0);
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