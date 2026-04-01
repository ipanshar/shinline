<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class DssDeviceUpdateTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

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
}