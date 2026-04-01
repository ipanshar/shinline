<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\DssAuthService;
use App\Services\DssParkingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class DssDeviceUpdateTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();

        parent::tearDown();
    }

    public function test_dss_device_update_persists_barrier_channel_id(): void
    {
        $permission = Permission::create([
            'name' => 'integrations.dss',
            'description' => 'Настройка DSS',
            'group' => 'integrations',
        ]);

        $role = Role::create([
            'name' => 'Интегратор тест',
            'level' => 50,
            'description' => 'Тестовая роль для DSS',
        ]);
        $role->permissions()->attach($permission->id);

        $user = User::factory()->create();
        $user->roles()->attach($role->id);

        $yard = $this->createYard();
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint, 'Entry', [
            'barrier_channel_id' => null,
        ]);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/dss/dssdevices/update', [
            'id' => $device->id,
            'channelName' => 'ANPR-21-13',
            'checkpoint_id' => $checkpoint->id,
            'type' => 'Entry',
            'zone_id' => $zone->id,
            'barrier_channel_id' => '1000047$1$0$0',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.0.barrier_channel_id', '1000047$1$0$0');

        $this->assertDatabaseHas('devaices', [
            'id' => $device->id,
            'channelName' => 'ANPR-21-13',
            'barrier_channel_id' => '1000047$1$0$0',
        ]);
    }

    public function test_sync_barrier_channels_from_dss_updates_devices_by_channel_name(): void
    {
        $permission = Permission::create([
            'name' => 'integrations.dss',
            'description' => 'Настройка DSS',
            'group' => 'integrations',
        ]);

        $role = Role::create([
            'name' => 'Интегратор sync тест',
            'level' => 50,
            'description' => 'Тестовая роль для sync DSS',
        ]);
        $role->permissions()->attach($permission->id);

        $user = User::factory()->create();
        $user->roles()->attach($role->id);

        $this->createDssSettings([
            'base_url' => 'http://10.210.0.250',
            'token' => 'live-token',
        ]);

        $yard = $this->createYard();
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint, 'Entry', [
            'channelName' => 'ANPR-21-13',
            'barrier_channel_id' => null,
        ]);

        $history = [];
        $client = $this->makeHistoryMockClient([
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'results' => [
                        ['id' => '2'],
                    ],
                ],
            ], JSON_THROW_ON_ERROR)),
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'id' => '2',
                    'positions' => [
                        [
                            'points' => [
                                [
                                    'pointName' => 'ANPR-21-13',
                                    'bindingItcChannels' => [
                                        [
                                            'channelId' => '1000047$1$0$0',
                                            'channelName' => 'ANPR-21-13',
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ], JSON_THROW_ON_ERROR)),
        ], $history);

        $authService = Mockery::mock(DssAuthService::class);
        $authService->shouldReceive('ensureAuthorized')->once()->andReturn(['success' => true, 'token' => 'live-token']);

        app()->instance(DssParkingService::class, new DssParkingService($authService, $client));

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/dss/dssdevices/sync-barrier-channels');

        $response
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.updated', 1)
            ->assertJsonPath('data.matched', 1);

        $this->assertDatabaseHas('devaices', [
            'id' => $device->id,
            'barrier_channel_id' => '1000047$1$0$0',
        ]);

        $this->assertCount(2, $history);
        $this->assertStringContainsString('/ipms/api/v1.1/parking-lot/summary/list', (string) $history[0]['request']->getUri());
        $this->assertStringContainsString('/ipms/api/v1.1/parking-lot/2', (string) $history[1]['request']->getUri());
    }
}