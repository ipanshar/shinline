<?php

namespace Tests\Feature;

use App\Models\EntryPermit;
use App\Models\CheckpointExitReview;
use App\Models\ExitPermit;
use App\Models\Status;
use App\Models\User;
use App\Models\Visitor;
use App\Models\WeighingRequirement;
use App\Services\DssVisitorFlowService;
use App\Services\DssPermitVehicleService;
use Illuminate\Support\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
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

    public function test_checkpoint_exit_review_queue_returns_active_exit_permit_comment(): void
    {
        $statuses = $this->seedDssStatuses();

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint, 'Exit');
        $truck = $this->createTruck(['plate_number' => 'QEX12305']);
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

        $exitPermit = ExitPermit::create([
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'visitor_id' => $visitor->id,
            'plate_number' => $truck->plate_number,
            'status' => ExitPermit::STATUS_ACTIVE,
            'valid_from' => now()->subMinutes(30),
            'valid_until' => now()->addHour(),
            'requested_by_user_id' => $user->id,
            'comment' => 'Проверить пломбу на воротах 3',
        ]);

        CheckpointExitReview::create([
            'device_id' => $device->id,
            'checkpoint_id' => $checkpoint->id,
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'plate_number' => $truck->plate_number,
            'normalized_plate' => strtolower($truck->plate_number),
            'capture_time' => now(),
            'status' => 'pending',
        ]);

        $response = $this->postJson('/api/security/checkpoint-exit-review-queue', [
            'checkpoint_id' => $checkpoint->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.0.candidate_visitors.0.has_active_exit_permit', true)
            ->assertJsonPath('data.0.candidate_visitors.0.exit_permit.id', $exitPermit->id)
            ->assertJsonPath('data.0.candidate_visitors.0.exit_permit.comment', 'Проверить пломбу на воротах 3');
    }

    public function test_search_active_visitors_for_exit_returns_active_exit_permit_comment(): void
    {
        $statuses = $this->seedDssStatuses();

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $yard = $this->createYard(false);
        $truck = $this->createTruck(['plate_number' => 'SRH12305']);
        $visitor = $this->createVisitor([
            'plate_number' => $truck->plate_number,
            'original_plate_number' => $truck->plate_number,
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_by_user_id' => $user->id,
            'confirmed_at' => now()->subMinutes(5),
            'entry_date' => now()->subHour(),
        ]);

        $exitPermit = ExitPermit::create([
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'visitor_id' => $visitor->id,
            'plate_number' => $truck->plate_number,
            'status' => ExitPermit::STATUS_ACTIVE,
            'valid_from' => now()->subMinutes(30),
            'valid_until' => now()->addHour(),
            'requested_by_user_id' => $user->id,
            'comment' => 'Связаться с диспетчером перед выпуском',
        ]);

        $response = $this->postJson('/api/security/search-active-visitors-for-exit', [
            'yard_id' => $yard->id,
            'plate_number' => 'SRH12305',
        ]);

        $response->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.0.has_active_exit_permit', true)
            ->assertJsonPath('data.0.exit_permit.id', $exitPermit->id)
            ->assertJsonPath('data.0.exit_permit.comment', 'Связаться с диспетчером перед выпуском');
    }

    public function test_get_visitors_returns_active_exit_permit_comment(): void
    {
        $statuses = $this->seedDssStatuses();

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $yard = $this->createYard(false);
        $truck = $this->createTruck(['plate_number' => 'TER12305']);
        $entryPermit = $this->createPermit($truck, $yard, [
            'status_id' => $statuses['active']->id,
            'exit_permit_required' => true,
        ]);

        $visitor = $this->createVisitor([
            'plate_number' => $truck->plate_number,
            'original_plate_number' => $truck->plate_number,
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'entry_permit_id' => $entryPermit->id,
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_by_user_id' => $user->id,
            'confirmed_at' => now()->subMinutes(10),
            'entry_date' => now()->subHour(),
        ]);

        $exitPermit = ExitPermit::create([
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'visitor_id' => $visitor->id,
            'plate_number' => $truck->plate_number,
            'status' => ExitPermit::STATUS_ACTIVE,
            'valid_from' => now()->subMinutes(30),
            'valid_until' => now()->addHour(),
            'requested_by_user_id' => $user->id,
            'comment' => 'Проверить номер пломбы перед выпуском',
        ]);

        $response = $this->postJson('/api/security/getvisitors', [
            'yard_id' => $yard->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.0.has_active_exit_permit', true)
            ->assertJsonPath('data.0.exit_permit.id', $exitPermit->id)
            ->assertJsonPath('data.0.exit_permit.comment', 'Проверить номер пломбы перед выпуском');
    }

    public function test_get_visitors_avoids_n_plus_one_queries_for_permits(): void
    {
        $statuses = $this->seedDssStatuses();

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $yard = $this->createYard(false);

        for ($index = 1; $index <= 5; $index++) {
            $truck = $this->createTruck([
                'plate_number' => sprintf('OPT%03d05', $index),
            ]);

            $entryPermit = $this->createPermit($truck, $yard, [
                'status_id' => $statuses['active']->id,
                'exit_permit_required' => true,
            ]);

            $visitor = $this->createVisitor([
                'plate_number' => $truck->plate_number,
                'original_plate_number' => $truck->plate_number,
                'yard_id' => $yard->id,
                'truck_id' => $truck->id,
                'entry_permit_id' => $entryPermit->id,
                'status_id' => $statuses['on_territory']->id,
                'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
                'entry_date' => now()->subMinutes($index),
            ]);

            ExitPermit::create([
                'yard_id' => $yard->id,
                'truck_id' => $truck->id,
                'visitor_id' => $visitor->id,
                'plate_number' => $truck->plate_number,
                'status' => ExitPermit::STATUS_ACTIVE,
                'valid_from' => now()->subHour(),
                'valid_until' => now()->addHour(),
                'comment' => 'bulk test permit ' . $index,
            ]);
        }

        DB::connection()->flushQueryLog();
        DB::connection()->enableQueryLog();

        $response = $this->postJson('/api/security/getvisitors', [
            'yard_id' => $yard->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('status', true);

        $permitSelectQueryCount = collect(DB::connection()->getQueryLog())
            ->filter(function (array $entry) {
                $query = strtolower(ltrim((string) ($entry['query'] ?? '')));

                if (!str_starts_with($query, 'select')) {
                    return false;
                }

                return str_contains($query, 'entry_permits') || str_contains($query, 'exit_permits');
            })
            ->count();

        $this->assertLessThanOrEqual(
            2,
            $permitSelectQueryCount,
            'getVisitors should bulk-load permits instead of issuing per-visitor queries.'
        );
    }
}