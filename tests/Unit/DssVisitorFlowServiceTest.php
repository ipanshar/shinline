<?php

namespace Tests\Unit;

use App\Models\GuestVisit;
use App\Models\GuestVisitPermit;
use App\Models\GuestVisitVehicle;
use App\Models\Task;
use App\Models\TruckZoneHistory;
use App\Models\Visitor;
use App\Services\DssNotificationService;
use App\Services\DssPermitVehicleService;
use App\Services\DssStructuredLogger;
use App\Services\DssTelegramEventRegistry;
use App\Services\DssVisitorFlowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Mockery;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class DssVisitorFlowServiceTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();

        parent::tearDown();
    }

    public function test_repeat_entry_closes_previous_visit_as_missed_exit_and_creates_new_visit(): void
    {
        Queue::fake();
        $statuses = $this->seedDssStatuses();

        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint, 'Entry');
        $truck = $this->createTruck(['plate_number' => 'A777BC']);
        $this->createPermit($truck, $yard);

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

    public function test_auto_confirmed_dss_visitor_does_not_send_pending_notification(): void
    {
        Queue::fake();
        $statuses = $this->seedDssStatuses();

        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard, ['name' => 'КПП3']);
        $device = $this->createDevice($zone, $checkpoint, 'Entry', ['channelName' => 'ANPR-1-4']);
        $truck = $this->createTruck(['plate_number' => '667ACJ02']);
        $this->createPermit($truck, $yard);

        $notificationService = Mockery::mock(DssNotificationService::class);
        $notificationService->shouldReceive('send')->never();
        $this->app->instance(DssNotificationService::class, $notificationService);

        $structuredLogger = Mockery::mock(DssStructuredLogger::class);
        $structuredLogger->shouldReceive('info')->atLeast()->once();
        $structuredLogger->shouldReceive('warning')->with('missed_exit_detected', Mockery::any())->zeroOrMoreTimes();
        $structuredLogger->shouldReceive('warning')->with('visitor_pending', Mockery::any())->never();
        $this->app->instance(DssStructuredLogger::class, $structuredLogger);

        app(DssVisitorFlowService::class)->handleCapture($device, $truck, [
            'plateNo' => $truck->plate_number,
            'captureTime' => now()->timestamp,
            'confidence' => 97,
        ]);

        $visitor = Visitor::where('truck_id', $truck->id)->latest('id')->first();

        $this->assertNotNull($visitor);
        $this->assertSame($statuses['on_territory']->id, $visitor->status_id);
        $this->assertSame(Visitor::CONFIRMATION_CONFIRMED, $visitor->confirmation_status);
        $this->assertNotNull($visitor->confirmed_at);
    }

    public function test_pending_dss_visitor_sends_pending_notification(): void
    {
        Queue::fake();
        $this->seedDssStatuses();
        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard, ['name' => 'КПП3']);
        $device = $this->createDevice($zone, $checkpoint, 'Entry', ['channelName' => 'ANPR-1-4']);
        $truck = $this->createTruck(['plate_number' => '667ACJ02']);

        $notificationService = Mockery::mock(DssNotificationService::class);
        $notificationService->shouldReceive('send')->once()->with(
            DssTelegramEventRegistry::EVENT_DSS_PENDING_ENTRY_CONFIRMATION,
            Mockery::on(function (string $message) {
                return str_contains($message, 'Требуется подтверждение въезда')
                    && str_contains($message, '667ACJ02')
                    && str_contains($message, '🎫 Разрешение:')
                    && str_contains($message, 'Нет активного разрешения');
            }),
            Mockery::on(function (array $context) use ($yard) {
                return ($context['yard_id'] ?? null) === $yard->id;
            })
        );
        $this->app->instance(DssNotificationService::class, $notificationService);

        $structuredLogger = Mockery::mock(DssStructuredLogger::class);
        $structuredLogger->shouldReceive('info')->atLeast()->once();
        $structuredLogger->shouldReceive('warning')->with('visitor_pending', Mockery::type('array'))->once();
        $structuredLogger->shouldReceive('warning')->with('missed_exit_detected', Mockery::any())->zeroOrMoreTimes();
        $this->app->instance(DssStructuredLogger::class, $structuredLogger);

        app(DssVisitorFlowService::class)->handleCapture($device, $truck, [
            'plateNo' => $truck->plate_number,
            'captureTime' => now()->timestamp,
            'confidence' => 97,
        ]);

        $visitor = Visitor::where('truck_id', $truck->id)->latest('id')->first();

        $this->assertNotNull($visitor);
        $this->assertSame(Visitor::CONFIRMATION_PENDING, $visitor->confirmation_status);
        $this->assertNull($visitor->confirmed_at);
    }

    public function test_auto_confirmed_entry_updates_task_status_using_latest_active_permit(): void
    {
        Queue::fake();
        $statuses = $this->seedDssStatuses();

        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint, 'Entry');
        $truck = $this->createTruck(['plate_number' => 'A888BC']);
        $task = Task::create([
            'name' => 'DSS Task Entry',
            'status_id' => $statuses['left_territory']->id,
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
        ]);

        $this->createPermit($truck, $yard, [
            'task_id' => null,
            'created_at' => now()->subMinutes(10),
            'updated_at' => now()->subMinutes(10),
        ]);

        $latestPermit = $this->createPermit($truck, $yard, [
            'task_id' => $task->id,
            'created_at' => now()->subMinute(),
            'updated_at' => now()->subMinute(),
        ]);

        app(DssVisitorFlowService::class)->handleCapture($device, $truck, [
            'plateNo' => $truck->plate_number,
            'captureTime' => now()->timestamp,
        ]);

        $task->refresh();
        $visitor = Visitor::where('truck_id', $truck->id)->latest('id')->first();

        $this->assertNotNull($visitor);
        $this->assertSame($latestPermit->id, $visitor->entry_permit_id);
        $this->assertSame($task->id, $visitor->task_id);
        $this->assertSame($statuses['on_territory']->id, $task->status_id);
        $this->assertNotNull($task->begin_date);
    }

    public function test_exit_updates_task_status_from_permit_when_visitor_task_id_is_missing(): void
    {
        Queue::fake();
        $statuses = $this->seedDssStatuses();

        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint, 'Exit');
        $truck = $this->createTruck(['plate_number' => 'A999BC']);
        $task = Task::create([
            'name' => 'DSS Task Exit',
            'status_id' => $statuses['on_territory']->id,
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'begin_date' => now()->subHour(),
        ]);
        $permit = $this->createPermit($truck, $yard, [
            'task_id' => $task->id,
        ]);

        $visitor = $this->createVisitor([
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'plate_number' => $truck->plate_number,
            'original_plate_number' => $truck->plate_number,
            'entry_date' => now()->subMinutes(30),
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_at' => now()->subMinutes(30),
            'entrance_device_id' => $device->id,
            'entry_permit_id' => $permit->id,
            'task_id' => null,
        ]);

        app(DssVisitorFlowService::class)->closeVisitorExit($visitor, $device, now());

        $task->refresh();
        $visitor->refresh();

        $this->assertNotNull($visitor->exit_date);
        $this->assertSame($statuses['completed']->id, $task->status_id);
        $this->assertNotNull($task->end_date);
    }

    public function test_auto_confirmed_dss_entry_links_guest_visit_and_updates_last_entry_at(): void
    {
        Queue::fake();
        $statuses = $this->seedDssStatuses();

        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint, 'Entry');
        $truck = $this->createTruck(['plate_number' => 'B101CD']);
        $permit = $this->createPermit($truck, $yard, [
            'status_id' => $statuses['active']->id,
        ]);

        $guestVisit = GuestVisit::create([
            'yard_id' => $yard->id,
            'guest_full_name' => 'Тестовый гость',
            'guest_position' => 'Инженер',
            'guest_phone' => '+77001112233',
            'host_name' => 'Принимающий',
            'host_phone' => '+77004445566',
            'visit_starts_at' => now()->subHour(),
            'visit_ends_at' => now()->addHour(),
            'permit_kind' => GuestVisit::PERMIT_KIND_MULTI_TIME,
            'workflow_status' => GuestVisit::STATUS_ACTIVE,
            'has_vehicle' => true,
            'source' => GuestVisit::SOURCE_OPERATOR,
        ]);

        $guestVehicle = GuestVisitVehicle::create([
            'guest_visit_id' => $guestVisit->id,
            'truck_id' => $truck->id,
            'plate_number' => $truck->plate_number,
        ]);

        GuestVisitPermit::create([
            'guest_visit_id' => $guestVisit->id,
            'entry_permit_id' => $permit->id,
            'permit_subject_type' => 'vehicle',
            'guest_visit_vehicle_id' => $guestVehicle->id,
            'created_at' => now()->subMinutes(10),
        ]);

        app(DssVisitorFlowService::class)->handleCapture($device, $truck, [
            'plateNo' => $truck->plate_number,
            'captureTime' => now()->timestamp,
        ]);

        $visitor = Visitor::query()->latest('id')->first();
        $guestVisit->refresh();

        $this->assertNotNull($visitor);
        $this->assertSame($guestVisit->id, $visitor->guest_visit_id);
        $this->assertNotNull($guestVisit->last_entry_at);
    }

    public function test_one_time_guest_visit_auto_closes_and_revokes_links_on_exit(): void
    {
        Queue::fake();
        $statuses = $this->seedDssStatuses();

        $permitVehicleService = Mockery::mock(DssPermitVehicleService::class);
        $permitVehicleService->shouldReceive('revokePermitVehicleSafely')->andReturn(['success' => true]);
        $permitVehicleService->shouldReceive('syncPermitVehicleSafely')->zeroOrMoreTimes();
        $this->app->instance(DssPermitVehicleService::class, $permitVehicleService);

        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $device = $this->createDevice($zone, $checkpoint, 'Exit');
        $truck = $this->createTruck(['plate_number' => 'C202DE']);
        $permit = $this->createPermit($truck, $yard, [
            'status_id' => $statuses['active']->id,
            'one_permission' => true,
            'begin_date' => now()->subHour(),
            'end_date' => now()->addHour(),
            'is_guest' => true,
        ]);

        $guestVisit = GuestVisit::create([
            'yard_id' => $yard->id,
            'guest_full_name' => 'Одноразовый гость',
            'guest_position' => 'Подрядчик',
            'guest_phone' => '+77001110000',
            'host_name' => 'Сотрудник склада',
            'host_phone' => '+77009990000',
            'visit_starts_at' => now()->subHour(),
            'visit_ends_at' => now()->addHour(),
            'permit_kind' => GuestVisit::PERMIT_KIND_ONE_TIME,
            'workflow_status' => GuestVisit::STATUS_ACTIVE,
            'has_vehicle' => true,
            'source' => GuestVisit::SOURCE_OPERATOR,
        ]);

        $guestVehicle = GuestVisitVehicle::create([
            'guest_visit_id' => $guestVisit->id,
            'truck_id' => $truck->id,
            'plate_number' => $truck->plate_number,
        ]);

        $personPermitLink = GuestVisitPermit::create([
            'guest_visit_id' => $guestVisit->id,
            'entry_permit_id' => null,
            'permit_subject_type' => 'person',
            'guest_visit_vehicle_id' => null,
            'created_at' => now()->subMinutes(15),
        ]);

        $vehiclePermitLink = GuestVisitPermit::create([
            'guest_visit_id' => $guestVisit->id,
            'entry_permit_id' => $permit->id,
            'permit_subject_type' => 'vehicle',
            'guest_visit_vehicle_id' => $guestVehicle->id,
            'created_at' => now()->subMinutes(14),
        ]);

        $visitor = $this->createVisitor([
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'guest_visit_id' => $guestVisit->id,
            'plate_number' => $truck->plate_number,
            'original_plate_number' => $truck->plate_number,
            'entry_date' => now()->subMinutes(30),
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_at' => now()->subMinutes(30),
            'entrance_device_id' => $device->id,
            'entry_permit_id' => $permit->id,
        ]);

        app(DssVisitorFlowService::class)->closeVisitorExit($visitor, $device, now());

        $guestVisit->refresh();
        $permit->refresh();
        $personPermitLink->refresh();
        $vehiclePermitLink->refresh();

        $this->assertSame(GuestVisit::STATUS_CLOSED, $guestVisit->workflow_status);
        $this->assertNotNull($guestVisit->closed_at);
        $this->assertNotNull($guestVisit->last_exit_at);
        $this->assertNotNull($personPermitLink->revoked_at);
        $this->assertNotNull($vehiclePermitLink->revoked_at);
        $this->assertSame($statuses['not_active']->id, $permit->status_id);
    }
}