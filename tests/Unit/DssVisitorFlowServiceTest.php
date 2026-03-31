<?php

namespace Tests\Unit;

use App\Models\TruckZoneHistory;
use App\Models\Visitor;
use App\Services\DssNotificationService;
use App\Services\DssStructuredLogger;
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
        $notificationService->shouldReceive('send')->once()->with(Mockery::on(function (string $message) {
            return str_contains($message, 'Требуется подтверждение въезда')
                && str_contains($message, '667ACJ02');
        }));
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
}