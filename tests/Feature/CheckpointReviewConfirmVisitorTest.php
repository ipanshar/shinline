<?php

namespace Tests\Feature;

use App\Models\EntryPermit;
use App\Models\CheckpointExitReview;
use App\Models\Status;
use App\Models\User;
use App\Models\Visitor;
use App\Models\WeighingRequirement;
use App\Services\DssVisitorFlowService;
use App\Services\DssPermitVehicleService;
use Illuminate\Support\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class CheckpointReviewConfirmVisitorTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();

        parent::tearDown();
    }

    public function test_confirm_visitor_creates_truck_and_one_time_permit_for_unknown_plate(): void
    {
        $this->seedDssStatuses();

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $yard = $this->createYard(true);
        $visitor = $this->createVisitor([
            'plate_number' => 'A123BC777',
            'original_plate_number' => 'A123BC777',
            'yard_id' => $yard->id,
        ]);

        $response = $this->postJson('/api/security/confirmvisitor', [
            'visitor_id' => $visitor->id,
            'operator_user_id' => $user->id,
            'corrected_plate_number' => 'A123BC777',
            'create_permit' => true,
            'create_weighing' => true,
        ]);

        $response->assertOk()
            ->assertJsonPath('status', true);

        $visitor->refresh();
        $permit = EntryPermit::query()->find($visitor->entry_permit_id);

        $this->assertNotNull($visitor->truck_id);
        $this->assertSame(Visitor::CONFIRMATION_CONFIRMED, $visitor->confirmation_status);
        $this->assertNotNull($permit);
        $this->assertTrue((bool) $permit->one_permission);
        $this->assertTrue((bool) $permit->weighing_required);
        $this->assertSame($visitor->truck_id, $permit->truck_id);
        $this->assertSame($yard->id, $permit->yard_id);
        $this->assertNotNull($permit->begin_date);
        $this->assertNotNull($permit->end_date);
        $this->assertSame(Carbon::today()->startOfDay()->format('Y-m-d H:i:s'), $permit->begin_date->format('Y-m-d H:i:s'));
        $this->assertSame(Carbon::today()->endOfDay()->format('Y-m-d H:i:s'), $permit->end_date->format('Y-m-d H:i:s'));
    }

    public function test_exit_visitor_revokes_one_time_permit_in_dss(): void
    {
        $statuses = $this->seedDssStatuses();

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $yard = $this->createYard(false);
        $truck = $this->createTruck(['plate_number' => 'REV12305']);
        $permit = $this->createPermit($truck, $yard, [
            'one_permission' => true,
            'status_id' => $statuses['active']->id,
            'begin_date' => now()->subHour(),
            'end_date' => now()->addDay(),
        ]);

        $visitor = $this->createVisitor([
            'plate_number' => $truck->plate_number,
            'original_plate_number' => $truck->plate_number,
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'entry_permit_id' => $permit->id,
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_by_user_id' => $user->id,
            'confirmed_at' => now()->subMinutes(10),
            'entry_date' => now()->subHour(),
        ]);

        $permitVehicleService = Mockery::mock(DssPermitVehicleService::class);
        $permitVehicleService->shouldReceive('revokePermitVehicleSafely')
            ->once()
            ->with(Mockery::on(fn (EntryPermit $argument) => (int) $argument->id === (int) $permit->id))
            ->andReturn(['success' => true, 'action' => 'revoke', 'status' => 'revoked']);

        app()->instance(DssPermitVehicleService::class, $permitVehicleService);

        $response = $this->postJson('/api/security/exitvisitor', [
            'id' => $visitor->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('status', true);

        $visitor->refresh();
        $permit->refresh();

        $this->assertNotNull($visitor->exit_date);
        $this->assertSame($statuses['left_territory']->id, $visitor->status_id);
        $this->assertSame($statuses['not_active']->id, $permit->status_id);
    }

    public function test_exit_visitor_is_blocked_when_exit_weighing_is_required(): void
    {
        $statuses = $this->seedDssStatuses();

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $yard = $this->createYard(false);
        $truck = $this->createTruck(['plate_number' => 'BLK12305']);
        $visitor = $this->createVisitor([
            'plate_number' => $truck->plate_number,
            'original_plate_number' => $truck->plate_number,
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_by_user_id' => $user->id,
            'confirmed_at' => now()->subMinutes(10),
            'entry_date' => now()->subHour(),
        ]);

        WeighingRequirement::create([
            'yard_id' => $yard->id,
            'visitor_id' => $visitor->id,
            'truck_id' => $truck->id,
            'plate_number' => $truck->plate_number,
            'required_type' => WeighingRequirement::TYPE_BOTH,
            'reason' => WeighingRequirement::REASON_MANUAL,
            'status' => WeighingRequirement::STATUS_ENTRY_DONE,
        ]);

        $response = $this->postJson('/api/security/exitvisitor', [
            'id' => $visitor->id,
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('code', 'exit_weighing_required');

        $visitor->refresh();

        $this->assertNull($visitor->exit_date);
        $this->assertSame($statuses['on_territory']->id, $visitor->status_id);
    }

    public function test_confirm_exit_review_is_blocked_when_exit_weighing_is_required(): void
    {
        $statuses = $this->seedDssStatuses();

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint, 'Exit');
        $truck = $this->createTruck(['plate_number' => 'RVW12305']);
        $visitor = $this->createVisitor([
            'plate_number' => $truck->plate_number,
            'original_plate_number' => $truck->plate_number,
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_by_user_id' => $user->id,
            'confirmed_at' => now()->subMinutes(10),
            'entry_date' => now()->subHour(),
        ]);

        WeighingRequirement::create([
            'yard_id' => $yard->id,
            'visitor_id' => $visitor->id,
            'truck_id' => $truck->id,
            'plate_number' => $truck->plate_number,
            'required_type' => WeighingRequirement::TYPE_BOTH,
            'reason' => WeighingRequirement::REASON_MANUAL,
            'status' => WeighingRequirement::STATUS_ENTRY_DONE,
        ]);

        $review = CheckpointExitReview::create([
            'device_id' => $device->id,
            'checkpoint_id' => $checkpoint->id,
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'plate_number' => $truck->plate_number,
            'normalized_plate' => strtolower($truck->plate_number),
            'capture_time' => now(),
            'status' => 'pending',
        ]);

        $response = $this->postJson('/api/security/confirm-exit-review', [
            'review_id' => $review->id,
            'operator_user_id' => $user->id,
            'visitor_id' => $visitor->id,
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('code', 'exit_weighing_required');

        $review->refresh();
        $visitor->refresh();

        $this->assertSame('pending', $review->status);
        $this->assertNull($visitor->exit_date);
    }

    public function test_exit_camera_creates_pending_review_when_exit_weighing_is_required(): void
    {
        $statuses = $this->seedDssStatuses();

        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint, 'Exit');
        $truck = $this->createTruck(['plate_number' => 'CAM12305']);
        $visitor = $this->createVisitor([
            'plate_number' => $truck->plate_number,
            'original_plate_number' => $truck->plate_number,
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'entry_date' => now()->subHour(),
        ]);

        WeighingRequirement::create([
            'yard_id' => $yard->id,
            'visitor_id' => $visitor->id,
            'truck_id' => $truck->id,
            'plate_number' => $truck->plate_number,
            'required_type' => WeighingRequirement::TYPE_BOTH,
            'reason' => WeighingRequirement::REASON_MANUAL,
            'status' => WeighingRequirement::STATUS_ENTRY_DONE,
        ]);

        app(DssVisitorFlowService::class)->handleCapture($device, $truck, [
            'plateNo' => $truck->plate_number,
            'captureTime' => now()->timestamp,
        ]);

        $visitor->refresh();
        $review = CheckpointExitReview::query()->latest('id')->first();

        $this->assertNull($visitor->exit_date);
        $this->assertNotNull($review);
        $this->assertSame('pending', $review->status);
        $this->assertStringContainsString('обязательное выездное взвешивание', (string) $review->note);
    }
}