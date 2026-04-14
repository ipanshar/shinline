<?php

namespace Tests\Feature;

use App\Models\EntryPermit;
use App\Models\Task;
use App\Models\Visitor;
use App\Services\DssPermitVehicleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class ForceCloseVisitorsCommandTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();

        parent::tearDown();
    }

    public function test_command_closes_active_visitor_completes_task_and_deactivates_one_time_permit(): void
    {
        $statuses = $this->seedDssStatuses();
        $yard = $this->createYard(false);
        $truck = $this->createTruck(['plate_number' => 'A123BC']);

        $task = Task::create([
            'name' => 'Force close DSS task',
            'status_id' => $statuses['on_territory']->id,
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'begin_date' => now()->subHour(),
        ]);

        $permit = $this->createPermit($truck, $yard, [
            'task_id' => $task->id,
            'one_permission' => true,
        ]);

        $visitor = $this->createVisitor([
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'plate_number' => $truck->plate_number,
            'original_plate_number' => $truck->plate_number,
            'entry_date' => now()->subHours(3),
            'status_id' => $statuses['on_territory']->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_at' => now()->subHours(3),
            'entry_permit_id' => $permit->id,
            'task_id' => $task->id,
        ]);

        $permitVehicleService = Mockery::mock(DssPermitVehicleService::class);
        $permitVehicleService->shouldReceive('revokePermitVehicleSafely')
            ->once()
            ->andReturn(['success' => true]);
        $this->app->instance(DssPermitVehicleService::class, $permitVehicleService);

        $this->artisan('dss:force-close-visitors', [
            '--all' => true,
            '--force' => true,
        ])->assertExitCode(0);

        $visitor->refresh();
        $task->refresh();
        $permit->refresh();

        $this->assertNotNull($visitor->exit_date);
        $this->assertSame($statuses['left_territory']->id, $visitor->status_id);
        $this->assertStringContainsString('[MANUAL] Визит закрыт командой dss:force-close-visitors', (string) $visitor->comment);

        $this->assertSame($statuses['completed']->id, $task->status_id);
        $this->assertNotNull($task->end_date);

        $this->assertSame($statuses['not_active']->id, $permit->status_id);
        $this->assertNotNull($permit->end_date);

        $this->assertDatabaseHas('visitors', [
            'id' => $visitor->id,
        ]);

        $this->assertDatabaseHas('entry_permits', [
            'id' => $permit->id,
            'status_id' => $statuses['not_active']->id,
        ]);

        $this->assertDatabaseHas('tasks', [
            'id' => $task->id,
            'status_id' => $statuses['completed']->id,
        ]);
    }

    public function test_command_requires_explicit_scope_without_all_flag(): void
    {
        $this->artisan('dss:force-close-visitors', [
            '--force' => true,
        ])->assertExitCode(1);
    }
}