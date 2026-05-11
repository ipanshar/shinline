<?php

namespace Tests\Feature;

use App\Models\EntryPermit;
use App\Models\CheckpointExitReview;
use App\Models\ExitPermit;
use App\Models\Status;
use App\Models\Task;
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

    public function test_checkpoint_review_queue_returns_only_pending_visitors(): void
    {
        $statuses = $this->seedDssStatuses();

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint, 'Entry');
        $truck = $this->createTruck(['plate_number' => 'PEN12305']);

        $pendingVisitor = $this->createVisitor([
            'plate_number' => $truck->plate_number,
            'original_plate_number' => $truck->plate_number,
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'entrance_device_id' => $device->id,
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_PENDING,
            'entry_date' => now()->subMinutes(5),
        ]);

        $this->createVisitor([
            'plate_number' => 'CNF12305',
            'original_plate_number' => 'CNF12305',
            'yard_id' => $yard->id,
            'entrance_device_id' => $device->id,
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_by_user_id' => $user->id,
            'confirmed_at' => now()->subMinutes(4),
            'entry_date' => now()->subMinutes(4),
        ]);

        $this->createVisitor([
            'plate_number' => 'REJ12305',
            'original_plate_number' => 'REJ12305',
            'yard_id' => $yard->id,
            'entrance_device_id' => $device->id,
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_REJECTED,
            'confirmed_by_user_id' => $user->id,
            'confirmed_at' => now()->subMinutes(3),
            'entry_date' => now()->subMinutes(3),
        ]);

        $response = $this->postJson('/api/security/checkpoint-review-queue', [
            'checkpoint_id' => $checkpoint->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.visitor_id', $pendingVisitor->id)
            ->assertJsonPath('data.0.confirmation_status', Visitor::CONFIRMATION_PENDING);
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

    public function test_checkpoint_exit_review_queue_returns_only_pending_reviews(): void
    {
        $this->seedDssStatuses();

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint, 'Exit');

        $pendingReview = CheckpointExitReview::create([
            'device_id' => $device->id,
            'checkpoint_id' => $checkpoint->id,
            'yard_id' => $yard->id,
            'plate_number' => 'QPEND05',
            'normalized_plate' => 'qpend05',
            'capture_time' => now()->subMinutes(2),
            'status' => 'pending',
        ]);

        CheckpointExitReview::create([
            'device_id' => $device->id,
            'checkpoint_id' => $checkpoint->id,
            'yard_id' => $yard->id,
            'plate_number' => 'QCONF05',
            'normalized_plate' => 'qconf05',
            'capture_time' => now()->subMinute(),
            'status' => 'confirmed',
            'resolved_at' => now()->subSeconds(30),
        ]);

        CheckpointExitReview::create([
            'device_id' => $device->id,
            'checkpoint_id' => $checkpoint->id,
            'yard_id' => $yard->id,
            'plate_number' => 'QREJ005',
            'normalized_plate' => 'qrej005',
            'capture_time' => now(),
            'status' => 'rejected',
            'resolved_at' => now()->subSeconds(10),
        ]);

        $response = $this->postJson('/api/security/checkpoint-exit-review-queue', [
            'checkpoint_id' => $checkpoint->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.review_id', $pendingReview->id)
            ->assertJsonPath('data.0.status', 'pending');
    }

    public function test_checkpoint_exit_review_queue_auto_closes_previous_active_visits_and_keeps_latest_candidate(): void
    {
        $statuses = $this->seedDssStatuses();

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint, 'Exit');
        $truck = $this->createTruck(['plate_number' => 'DUP12305']);
        $task = Task::create([
            'name' => 'Duplicate visitor exit task',
            'status_id' => $statuses['on_territory']->id,
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'begin_date' => now()->subHours(6),
        ]);

        $olderVisitor = $this->createVisitor([
            'plate_number' => $truck->plate_number,
            'original_plate_number' => $truck->plate_number,
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'task_id' => $task->id,
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_by_user_id' => $user->id,
            'confirmed_at' => now()->subHours(4),
            'entry_date' => now()->subHours(5),
        ]);

        $latestVisitor = $this->createVisitor([
            'plate_number' => $truck->plate_number,
            'original_plate_number' => $truck->plate_number,
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'task_id' => $task->id,
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_by_user_id' => $user->id,
            'confirmed_at' => now()->subMinutes(30),
            'entry_date' => now()->subHour(),
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

        $response = $this->postJson('/api/security/checkpoint-exit-review-queue', [
            'checkpoint_id' => $checkpoint->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonCount(1, 'data.0.candidate_visitors')
            ->assertJsonPath('data.0.candidate_visitors.0.visitor_id', $latestVisitor->id);

        $olderVisitor->refresh();
        $latestVisitor->refresh();
        $review->refresh();
        $task->refresh();

        $this->assertNotNull($olderVisitor->exit_date);
        $this->assertSame($statuses['left_territory']->id, $olderVisitor->status_id);
        $this->assertStringContainsString('[AUTO] Предыдущий активный визит закрыт при обработке выезда', (string) $olderVisitor->comment);
        $this->assertNull($latestVisitor->exit_date);
        $this->assertSame($statuses['completed']->id, $task->status_id);
        $this->assertNotNull($task->end_date);
        $this->assertSame('pending', $review->status);
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

    public function test_get_visitors_closes_stale_duplicate_active_visits_and_keeps_only_latest_open(): void
    {
        $statuses = $this->seedDssStatuses();

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $yard = $this->createYard(false);
        $truck = $this->createTruck(['plate_number' => 'UNI32105']);

        $olderVisitor = $this->createVisitor([
            'plate_number' => $truck->plate_number,
            'original_plate_number' => $truck->plate_number,
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_by_user_id' => $user->id,
            'confirmed_at' => now()->subHours(3),
            'entry_date' => now()->subHours(4),
        ]);

        $latestVisitor = $this->createVisitor([
            'plate_number' => $truck->plate_number,
            'original_plate_number' => $truck->plate_number,
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_by_user_id' => $user->id,
            'confirmed_at' => now()->subMinutes(20),
            'entry_date' => now()->subHour(),
        ]);

        $response = $this->postJson('/api/security/getvisitors', [
            'yard_id' => $yard->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('status', true);

        $activeVisitors = collect($response->json('data'))
            ->filter(fn (array $visitor) => empty($visitor['exit_date']))
            ->values();

        $this->assertCount(1, $activeVisitors);
        $this->assertSame($latestVisitor->id, $activeVisitors[0]['id']);

        $olderVisitor->refresh();
        $latestVisitor->refresh();

        $this->assertNotNull($olderVisitor->exit_date);
        $this->assertSame($statuses['left_territory']->id, $olderVisitor->status_id);
        $this->assertNull($latestVisitor->exit_date);
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

    public function test_get_visitors_returns_expired_one_time_permit_metadata_for_active_visit_without_active_permit(): void
    {
        $statuses = $this->seedDssStatuses();

        $operator = User::factory()->create();
        $driver = User::factory()->create();
        Sanctum::actingAs($operator);

        $yard = $this->createYard(false);
        $truck = $this->createTruck([
            'plate_number' => 'EXP57905',
        ]);

        $task = Task::create([
            'name' => 'Просроченное разовое разрешение',
            'status_id' => $statuses['on_territory']->id,
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'user_id' => $driver->id,
            'begin_date' => now()->subDays(2),
            'end_date' => now()->subDay(),
        ]);

        $entryPermit = $this->createPermit($truck, $yard, [
            'task_id' => $task->id,
            'one_permission' => true,
            'status_id' => $statuses['active']->id,
            'begin_date' => now()->subDays(2),
            'end_date' => now()->subDay(),
        ]);

        $visitor = $this->createVisitor([
            'plate_number' => $truck->plate_number,
            'original_plate_number' => $truck->plate_number,
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'task_id' => $task->id,
            'entry_permit_id' => $entryPermit->id,
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_by_user_id' => $operator->id,
            'confirmed_at' => now()->subHours(12),
            'entry_date' => now()->subHours(12),
        ]);

        $response = $this->postJson('/api/security/getvisitors', [
            'yard_id' => $yard->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.0.id', $visitor->id)
            ->assertJsonPath('data.0.has_permit', false)
            ->assertJsonPath('data.0.permit_status', 'expired')
            ->assertJsonPath('data.0.permit_type', 'one_time')
            ->assertJsonPath('data.0.permit_end_date', $entryPermit->end_date?->toIso8601String())
            ->assertJsonPath('data.0.name', 'Просроченное разовое разрешение');
    }

    public function test_cleanup_command_closes_old_pending_visitors_and_exit_reviews(): void
    {
        $statuses = $this->seedDssStatuses();

        Status::firstOrCreate(['key' => 'new'], ['name' => 'Новый']);
        Status::firstOrCreate(['key' => 'canceled'], ['name' => 'Отменён']);

        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $entryCheckpoint = $this->createCheckpoint($yard);
        $entryDevice = $this->createDevice($zone, $entryCheckpoint, 'Entry');
        $exitCheckpoint = $this->createCheckpoint($yard, ['name' => 'КПП Выезд']);
        $exitDevice = $this->createDevice($zone, $exitCheckpoint, 'Exit');
        $truck = $this->createTruck(['plate_number' => 'OLD77705']);

        $pendingVisitor = $this->createVisitor([
            'plate_number' => $truck->plate_number,
            'original_plate_number' => $truck->plate_number,
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'entrance_device_id' => $entryDevice->id,
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_PENDING,
            'entry_date' => now()->subDays(2),
            'created_at' => now()->subDays(2),
            'updated_at' => now()->subDays(2),
        ]);

        $pendingReview = CheckpointExitReview::create([
            'device_id' => $exitDevice->id,
            'checkpoint_id' => $exitCheckpoint->id,
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'plate_number' => $truck->plate_number,
            'normalized_plate' => strtolower($truck->plate_number),
            'capture_time' => now()->subDays(2),
            'status' => 'pending',
            'created_at' => now()->subDays(2),
            'updated_at' => now()->subDays(2),
        ]);

        $this->artisan('cleanup:old-tasks-permits', [
            '--force' => true,
            '--days' => 365,
            '--pending-hours' => 24,
        ])->assertExitCode(0);

        $pendingVisitor->refresh();
        $pendingReview->refresh();

        $this->assertSame(Visitor::CONFIRMATION_REJECTED, $pendingVisitor->confirmation_status);
        $this->assertNotNull($pendingVisitor->confirmed_at);
        $this->assertNotNull($pendingVisitor->exit_date);
        $this->assertSame($statuses['left_territory']->id, $pendingVisitor->status_id);

        $this->assertSame('rejected', $pendingReview->status);
        $this->assertNotNull($pendingReview->resolved_at);
        $this->assertStringContainsString('Pending exit review закрыт по TTL', (string) $pendingReview->note);
    }

    public function test_get_visitors_supports_paginated_history(): void
    {
        $statuses = $this->seedDssStatuses();

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $yard = $this->createYard(false);

        for ($index = 1; $index <= 55; $index++) {
            $truck = $this->createTruck([
                'plate_number' => sprintf('PG%03d05', $index),
            ]);

            $this->createVisitor([
                'plate_number' => $truck->plate_number,
                'original_plate_number' => $truck->plate_number,
                'yard_id' => $yard->id,
                'truck_id' => $truck->id,
                'status_id' => $statuses['on_territory']->id,
                'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
                'entry_date' => now()->subMinutes($index),
            ]);
        }

        $response = $this->postJson('/api/security/getvisitors', [
            'yard_id' => $yard->id,
            'page' => 1,
            'per_page' => 50,
        ]);

        $response->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonCount(50, 'data')
            ->assertJsonPath('pagination.current_page', 1)
            ->assertJsonPath('pagination.last_page', 2)
            ->assertJsonPath('pagination.per_page', 50)
            ->assertJsonPath('pagination.total', 55)
            ->assertJsonPath('pagination.from', 1)
            ->assertJsonPath('pagination.to', 50);
    }

    public function test_get_visitors_supports_server_search_beyond_current_page(): void
    {
        $statuses = $this->seedDssStatuses();

        $operator = User::factory()->create();
        Sanctum::actingAs($operator);

        $yard = $this->createYard(false);
        $taskUser = User::factory()->create([
            'name' => 'Серверный водитель',
            'phone' => '+77770001122',
        ]);

        $targetTruck = $this->createTruck([
            'plate_number' => 'SRV99005',
        ]);

        $targetTask = Task::create([
            'name' => 'Серверная доставка 42',
            'status_id' => $statuses['on_territory']->id,
            'truck_id' => $targetTruck->id,
            'yard_id' => $yard->id,
            'user_id' => $taskUser->id,
            'begin_date' => now()->subHours(3),
        ]);

        $targetVisitor = $this->createVisitor([
            'plate_number' => $targetTruck->plate_number,
            'original_plate_number' => $targetTruck->plate_number,
            'yard_id' => $yard->id,
            'truck_id' => $targetTruck->id,
            'task_id' => $targetTask->id,
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'entry_date' => now()->subHours(3),
        ]);

        for ($index = 1; $index <= 55; $index++) {
            $truck = $this->createTruck([
                'plate_number' => sprintf('SRH%03d05', $index),
            ]);

            $this->createVisitor([
                'plate_number' => $truck->plate_number,
                'original_plate_number' => $truck->plate_number,
                'yard_id' => $yard->id,
                'truck_id' => $truck->id,
                'status_id' => $statuses['on_territory']->id,
                'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
                'entry_date' => now()->subMinutes($index),
            ]);
        }

        $response = $this->postJson('/api/security/getvisitors', [
            'yard_id' => $yard->id,
            'page' => 1,
            'per_page' => 50,
            'search' => 'Серверная доставка 42',
        ]);

        $response->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $targetVisitor->id)
            ->assertJsonPath('data.0.plate_number', 'SRV99005')
            ->assertJsonPath('pagination.total', 1);
    }
}