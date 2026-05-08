<?php

namespace Tests\Feature;

use App\Models\DssParkingPermit;
use App\Services\DssPermitVehicleService;
use Database\Seeders\DeleteDssVehiclesWithoutActivePermitsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class DeleteDssVehiclesWithoutActivePermitsSeederTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();

        parent::tearDown();
    }

    public function test_seeder_deletes_only_vehicles_without_active_permit(): void
    {
        $statuses = $this->seedDssStatuses();
        $yard = $this->createYard();

        $activeTruck = $this->createTruck(['plate_number' => 'A111AA01']);
        $activePermit = $this->createPermit($activeTruck, $yard, [
            'status_id' => $statuses['active']->id,
            'end_date' => now()->addDay(),
        ]);

        DssParkingPermit::create([
            'entry_permit_id' => $activePermit->id,
            'truck_id' => $activeTruck->id,
            'yard_id' => $yard->id,
            'plate_number' => $activeTruck->plate_number,
            'remote_vehicle_id' => '101',
            'status' => 'synced',
        ]);

        $inactiveTruck = $this->createTruck(['plate_number' => 'B222BB02']);
        $inactivePermit = $this->createPermit($inactiveTruck, $yard, [
            'status_id' => $statuses['not_active']->id,
            'begin_date' => now()->subDays(2),
            'end_date' => now()->subDay(),
        ]);

        DssParkingPermit::create([
            'entry_permit_id' => $inactivePermit->id,
            'truck_id' => $inactiveTruck->id,
            'yard_id' => $yard->id,
            'plate_number' => $inactiveTruck->plate_number,
            'remote_vehicle_id' => '202',
            'status' => 'synced',
        ]);

        $olderInactivePermit = $this->createPermit($inactiveTruck, $yard, [
            'status_id' => $statuses['not_active']->id,
            'begin_date' => now()->subDays(4),
            'end_date' => now()->subDays(3),
        ]);

        DssParkingPermit::create([
            'entry_permit_id' => $olderInactivePermit->id,
            'truck_id' => $inactiveTruck->id,
            'yard_id' => $yard->id,
            'plate_number' => $inactiveTruck->plate_number,
            'remote_vehicle_id' => '202',
            'status' => 'deleted',
        ]);

        $permitVehicleService = Mockery::mock(DssPermitVehicleService::class);
        $permitVehicleService->shouldReceive('revokePermitVehicleSafely')
            ->once()
            ->with(Mockery::on(fn ($permit) => $permit->id === $inactivePermit->id))
            ->andReturn(['success' => true, 'action' => 'delete']);

        $this->app->instance(DssPermitVehicleService::class, $permitVehicleService);

        $this->seed(DeleteDssVehiclesWithoutActivePermitsSeeder::class);

        $this->assertDatabaseCount('dss_parking_permits', 3);
        $this->assertDatabaseHas('entry_permits', [
            'id' => $activePermit->id,
            'status_id' => $statuses['active']->id,
        ]);
        $this->assertDatabaseHas('entry_permits', [
            'id' => $inactivePermit->id,
            'status_id' => $statuses['not_active']->id,
        ]);
    }
}