<?php

namespace Tests\Feature;

use App\Models\TruckZoneHistory;
use App\Models\Visitor;
use App\Models\WeighingRequirement;
use App\Services\DssCaptureEnrichmentService;
use App\Services\DssZoneHistoryService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class DssCaptureEnrichmentIntegrationTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    public function test_new_capture_for_truck_with_permit_creates_confirmed_visitor_and_weighing_requirement(): void
    {
        Queue::fake();
        $statuses = $this->seedDssStatuses();
        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint, 'Entry');
        $truck = $this->createTruck(['plate_number' => 'A123BC']);
        $this->createPermit($truck, $yard, ['weighing_required' => true]);
        $capture = $this->createVehicleCapture($device, ['plateNo' => $truck->plate_number]);

        $result = app(DssCaptureEnrichmentService::class)->processCaptureById($capture->id);

        $capture->refresh();
        $visitor = Visitor::first();
        $requirement = WeighingRequirement::first();

        $this->assertTrue($result['success']);
        $this->assertSame($truck->id, $capture->truck_id);
        $this->assertNotNull($capture->processed_at);
        $this->assertSame(Visitor::CONFIRMATION_CONFIRMED, $visitor?->confirmation_status);
        $this->assertNotNull($requirement);
        $this->assertSame($visitor?->id, $requirement?->visitor_id);
        $this->assertSame(WeighingRequirement::REASON_PERMIT, $requirement?->reason);
        $this->assertSame(WeighingRequirement::STATUS_PENDING, $requirement?->status);
        $this->assertDatabaseHas('truck_zone_history', [
            'truck_id' => $truck->id,
            'zone_id' => $zone->id,
            'exit_time' => null,
        ]);
        $this->assertSame($statuses['on_territory']->id, $visitor?->status_id);
    }

    public function test_capture_for_unknown_truck_creates_pending_visitor(): void
    {
        Queue::fake();
        $this->seedDssStatuses();
        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint, 'Entry');
        $capture = $this->createVehicleCapture($device, ['plateNo' => 'UNKNOWN777']);

        $result = app(DssCaptureEnrichmentService::class)->processCaptureById($capture->id);

        $capture->refresh();
        $visitor = Visitor::first();

        $this->assertTrue($result['success']);
        $this->assertNull($capture->truck_id);
        $this->assertSame(Visitor::CONFIRMATION_PENDING, $visitor?->confirmation_status);
        $this->assertDatabaseCount('truck_zone_history', 0);
    }

    public function test_strict_mode_without_permit_keeps_known_truck_pending(): void
    {
        Queue::fake();
        $this->seedDssStatuses();
        $yard = $this->createYard(true);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint, 'Entry');
        $truck = $this->createTruck(['plate_number' => 'KZ999AA']);
        $capture = $this->createVehicleCapture($device, ['plateNo' => $truck->plate_number]);

        app(DssCaptureEnrichmentService::class)->processCaptureById($capture->id);

        $visitor = Visitor::first();

        $this->assertNotNull($visitor);
        $this->assertSame(Visitor::CONFIRMATION_PENDING, $visitor->confirmation_status);
    }

    public function test_transition_between_zones_closes_previous_record_and_opens_new_one(): void
    {
        $this->seedDssStatuses();
        $yard = $this->createYard(false);
        $zoneA = $this->createZone($yard, ['name' => 'Zone A']);
        $zoneB = $this->createZone($yard, ['name' => 'Zone B']);
        $checkpoint = $this->createCheckpoint($yard);
        $deviceA = $this->createDevice($zoneA, $checkpoint, 'Entry');
        $deviceB = $this->createDevice($zoneB, $checkpoint, 'Entry');
        $truck = $this->createTruck();

        $service = app(DssZoneHistoryService::class);
        $service->enterZone($truck, $deviceA, null, now()->subMinutes(15));
        $result = $service->enterZone($truck, $deviceB, null, now());

        $firstRecord = TruckZoneHistory::orderBy('id')->first();
        $secondRecord = TruckZoneHistory::orderByDesc('id')->first();

        $this->assertSame(DssZoneHistoryService::ACTION_TRANSITION, $result['action']);
        $this->assertNotNull($firstRecord?->exit_time);
        $this->assertNull($secondRecord?->exit_time);
        $this->assertSame($zoneB->id, $secondRecord?->zone_id);
    }
}