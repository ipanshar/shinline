<?php

namespace Tests\Unit;

use App\Models\TruckZoneHistory;
use App\Models\Visitor;
use App\Services\DssVisitorFlowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class DssVisitorFlowServiceTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    public function test_repeat_entry_closes_previous_visit_as_missed_exit_and_creates_new_visit(): void
    {
        Queue::fake();
        $statuses = $this->seedDssStatuses();

        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint, 'Entry');
        $truck = $this->createTruck(['plate_number' => 'A777BC']);

        $oldVisitor = $this->createVisitor([
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'plate_number' => $truck->plate_number,
            'original_plate_number' => $truck->plate_number,
            'entry_date' => now()->subMinutes(20),
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_at' => now()->subMinutes(20),
            'entrance_device_id' => $device->id,
        ]);

        TruckZoneHistory::create([
            'truck_id' => $truck->id,
            'device_id' => $device->id,
            'zone_id' => $zone->id,
            'entry_time' => now()->subMinutes(20),
        ]);

        app(DssVisitorFlowService::class)->handleCapture($device, $truck, [
            'plateNo' => $truck->plate_number,
            'captureTime' => now()->timestamp,
        ]);

        $oldVisitor->refresh();
        $newVisitor = Visitor::where('truck_id', $truck->id)->latest('id')->first();
        $history = TruckZoneHistory::where('truck_id', $truck->id)->latest('id')->first();

        $this->assertNotNull($oldVisitor->exit_date);
        $this->assertStringContainsString('Выезд не зафиксирован камерой', (string) $oldVisitor->comment);
        $this->assertNotNull($newVisitor);
        $this->assertNotSame($oldVisitor->id, $newVisitor->id);
        $this->assertSame(Visitor::CONFIRMATION_CONFIRMED, $newVisitor->confirmation_status);
        $this->assertNotNull($history?->exit_time);
    }
}