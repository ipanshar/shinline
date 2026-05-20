<?php

namespace Tests\Feature;

use App\Models\DssParkingPermit;
use App\Models\Task;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class CleanupGarbageTrucksCommandTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    public function test_command_deletes_only_trucks_without_active_permits_tasks_or_drivers(): void
    {
        $statuses = $this->seedDssStatuses();
        $yard = $this->createYard();
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint);
        $driver = User::factory()->create();

        $garbageTruck = $this->createTruck([
            'plate_number' => 'G111GG01',
            'anpr_source' => true,
            'last_seen_at' => now()->subDay(),
        ]);
        $inactivePermit = $this->createPermit($garbageTruck, $yard, [
            'status_id' => $statuses['not_active']->id,
            'begin_date' => now()->subDays(3),
            'end_date' => now()->subDay(),
        ]);

        DssParkingPermit::create([
            'entry_permit_id' => $inactivePermit->id,
            'truck_id' => $garbageTruck->id,
            'yard_id' => $yard->id,
            'plate_number' => $garbageTruck->plate_number,
            'remote_vehicle_id' => 'garbage-remote-id',
            'status' => 'deleted',
        ]);

        $capture = $this->createVehicleCapture($device, [
            'truck_id' => $garbageTruck->id,
            'plateNo' => $garbageTruck->plate_number,
        ]);
        $visitor = $this->createVisitor([
            'truck_id' => $garbageTruck->id,
            'yard_id' => $yard->id,
            'entry_permit_id' => $inactivePermit->id,
            'plate_number' => $garbageTruck->plate_number,
            'original_plate_number' => $garbageTruck->plate_number,
        ]);

        DB::table('truck_zone_history')->insert([
            'truck_id' => $garbageTruck->id,
            'device_id' => $device->id,
            'zone_id' => $zone->id,
            'entry_time' => now()->subHour(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $activeTruck = $this->createTruck(['plate_number' => 'A111AA01']);
        $this->createPermit($activeTruck, $yard, [
            'status_id' => $statuses['active']->id,
            'end_date' => now()->addDay(),
        ]);

        $taskTruck = $this->createTruck(['plate_number' => 'T222TT02']);
        Task::create([
            'name' => 'Delivery task',
            'user_id' => $driver->id,
            'status_id' => $statuses['active']->id,
            'truck_id' => $taskTruck->id,
            'avtor' => 'test',
        ]);

        $pivotDriverTruck = $this->createTruck(['plate_number' => 'D333DD03']);
        DB::table('truck_user')->insert([
            'user_id' => $driver->id,
            'truck_id' => $pivotDriverTruck->id,
            'assigned_date' => now()->toDateString(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $truckUserColumnTruck = $this->createTruck([
            'plate_number' => 'U444UU04',
            'user_id' => $driver->id,
        ]);

        $permitDriverTruck = $this->createTruck(['plate_number' => 'P555PP05']);
        $driverPermit = $this->createPermit($permitDriverTruck, $yard, [
            'status_id' => $statuses['not_active']->id,
            'user_id' => $driver->id,
            'end_date' => now()->subDay(),
        ]);

        $permitTaskTruck = $this->createTruck(['plate_number' => 'L666LL06']);
        $legacyTaskPermit = $this->createPermit($permitTaskTruck, $yard, [
            'status_id' => $statuses['not_active']->id,
            'task_id' => 'legacy-task-1',
            'end_date' => now()->subDay(),
        ]);

        $visitorDriverTruck = $this->createTruck(['plate_number' => 'V777VV07']);
        $this->createVisitor([
            'truck_id' => $visitorDriverTruck->id,
            'yard_id' => $yard->id,
            'user_id' => $driver->id,
            'plate_number' => $visitorDriverTruck->plate_number,
            'original_plate_number' => $visitorDriverTruck->plate_number,
        ]);

        $this->artisan('truck:cleanup-garbage', ['--force' => true])
            ->assertExitCode(0);

        $this->assertDatabaseMissing('trucks', ['id' => $garbageTruck->id]);
        $this->assertDatabaseMissing('entry_permits', ['id' => $inactivePermit->id]);
        $this->assertDatabaseMissing('dss_parking_permits', ['entry_permit_id' => $inactivePermit->id]);
        $this->assertDatabaseHas('vehicle_captures', [
            'id' => $capture->id,
            'truck_id' => null,
        ]);
        $this->assertDatabaseHas('visitors', [
            'id' => $visitor->id,
            'truck_id' => null,
            'entry_permit_id' => null,
        ]);
        $this->assertDatabaseMissing('truck_zone_history', ['truck_id' => $garbageTruck->id]);

        foreach ([
            $activeTruck,
            $taskTruck,
            $pivotDriverTruck,
            $truckUserColumnTruck,
            $permitDriverTruck,
            $permitTaskTruck,
            $visitorDriverTruck,
        ] as $keptTruck) {
            $this->assertDatabaseHas('trucks', ['id' => $keptTruck->id]);
        }

        $this->assertDatabaseHas('entry_permits', ['id' => $driverPermit->id]);
        $this->assertDatabaseHas('entry_permits', ['id' => $legacyTaskPermit->id]);
    }

    public function test_dry_run_does_not_delete_matching_trucks(): void
    {
        $this->seedDssStatuses();

        $truck = $this->createTruck([
            'plate_number' => 'R888RR08',
            'anpr_source' => true,
        ]);

        $this->artisan('truck:cleanup-garbage', ['--dry-run' => true])
            ->assertExitCode(0);

        $this->assertDatabaseHas('trucks', ['id' => $truck->id]);
    }
}
