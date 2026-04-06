<?php

namespace Tests\Feature;

use App\Models\Visitor;
use App\Models\Truck;
use App\Models\User;
use App\Models\Weighing;
use App\Models\WeighingRequirement;
use App\Models\Yard;
use App\Models\Status;
use App\Models\Task;
use App\Models\TaskWeighing;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WeighingRecordTest extends TestCase
{
    use RefreshDatabase;

    public function test_manual_weighing_requires_existing_truck_or_explicit_creation_confirmation(): void
    {
        $user = User::factory()->create();
        $yard = Yard::create(['name' => 'Main yard']);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/weighing/record', [
            'yard_id' => $yard->id,
            'plate_number' => 'A123BC777',
            'weighing_type' => 'entry',
            'weight' => 12345.67,
            'operator_user_id' => $user->id,
        ]);

        $response
            ->assertStatus(422)
            ->assertJsonPath('code', 'truck_not_found')
            ->assertJsonPath('requires_truck_creation', true);

        $this->assertDatabaseMissing('weighings', [
            'yard_id' => $yard->id,
            'plate_number' => 'A123BC777',
        ]);
    }

    public function test_manual_weighing_can_create_truck_and_store_normalized_plate_number(): void
    {
        $user = User::factory()->create();
        $yard = Yard::create(['name' => 'North yard']);
        $visitor = Visitor::create([
            'plate_number' => 'A123BC777',
            'yard_id' => $yard->id,
            'user_id' => $user->id,
            'entry_date' => now(),
            'exit_date' => null,
            'confirmation_status' => Visitor::CONFIRMATION_PENDING,
        ]);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/weighing/record', [
            'yard_id' => $yard->id,
            'plate_number' => 'a 123-bc 777',
            'weighing_type' => 'entry',
            'weight' => 9876.54,
            'operator_user_id' => $user->id,
            'create_truck' => true,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.plate_number', 'A123BC777');

        $truck = Truck::where('plate_number', 'A123BC777')->first();

        $this->assertNotNull($truck);

        $this->assertDatabaseHas('weighings', [
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'visitor_id' => $visitor->id,
            'plate_number' => 'A123BC777',
            'weighing_type' => 'entry',
        ]);

        $this->assertDatabaseHas('visitors', [
            'id' => $visitor->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_by_user_id' => $user->id,
        ]);
    }

    public function test_manual_weighing_rejects_existing_truck_when_it_is_not_on_territory(): void
    {
        $user = User::factory()->create();
        $yard = Yard::create(['name' => 'South yard']);
        $truck = Truck::create(['plate_number' => 'B456CD777']);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/weighing/record', [
            'yard_id' => $yard->id,
            'plate_number' => 'B456CD777',
            'weighing_type' => 'entry',
            'weight' => 8000,
            'truck_id' => $truck->id,
            'operator_user_id' => $user->id,
        ]);

        $response
            ->assertStatus(422)
            ->assertJsonPath('code', 'visitor_not_on_yard');

        $this->assertDatabaseMissing('weighings', [
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'plate_number' => 'B456CD777',
        ]);
    }

    public function test_manual_weighing_uses_active_visitor_for_existing_truck(): void
    {
        $user = User::factory()->create();
        $yard = Yard::create(['name' => 'Active visitor yard']);
        $truck = Truck::create(['plate_number' => 'C789DE777']);
        $visitor = Visitor::create([
            'plate_number' => 'C789DE777',
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'user_id' => $user->id,
            'entry_date' => now()->subHour(),
            'exit_date' => null,
            'confirmation_status' => Visitor::CONFIRMATION_PENDING,
        ]);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/weighing/record', [
            'yard_id' => $yard->id,
            'plate_number' => 'C789DE777',
            'weighing_type' => 'entry',
            'weight' => 14500,
            'truck_id' => $truck->id,
            'operator_user_id' => $user->id,
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('status', true);

        $this->assertDatabaseHas('weighings', [
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'visitor_id' => $visitor->id,
            'plate_number' => 'C789DE777',
            'weighing_type' => 'entry',
        ]);

        $this->assertDatabaseHas('visitors', [
            'id' => $visitor->id,
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_by_user_id' => $user->id,
        ]);
    }

    public function test_history_includes_paired_entry_from_previous_day_for_same_requirement(): void
    {
        $user = User::factory()->create();
        $yard = Yard::create(['name' => 'History yard']);
        $truck = Truck::create(['plate_number' => 'A123BC777']);
        $visitor = Visitor::create([
            'plate_number' => 'A123BC777',
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'user_id' => $user->id,
        ]);
        $requirement = WeighingRequirement::create([
            'yard_id' => $yard->id,
            'visitor_id' => $visitor->id,
            'truck_id' => $truck->id,
            'plate_number' => 'A123BC777',
            'required_type' => 'both',
            'reason' => WeighingRequirement::REASON_MANUAL,
            'status' => WeighingRequirement::STATUS_COMPLETED,
        ]);

        $entryAt = Carbon::parse('2026-03-30 23:10:00');
        $exitAt = Carbon::parse('2026-03-31 06:57:00');

        $entry = Weighing::create([
            'yard_id' => $yard->id,
            'plate_number' => 'A123BC777',
            'weighing_type' => Weighing::TYPE_ENTRY,
            'weight' => 7000,
            'weighed_at' => $entryAt,
            'visitor_id' => $visitor->id,
            'truck_id' => $truck->id,
            'requirement_id' => $requirement->id,
            'operator_user_id' => $user->id,
        ]);

        $exit = Weighing::create([
            'yard_id' => $yard->id,
            'plate_number' => 'A123BC777',
            'weighing_type' => Weighing::TYPE_EXIT,
            'weight' => 3600,
            'weighed_at' => $exitAt,
            'visitor_id' => $visitor->id,
            'truck_id' => $truck->id,
            'requirement_id' => $requirement->id,
            'operator_user_id' => $user->id,
        ]);

        $requirement->forceFill([
            'entry_weighing_id' => $entry->id,
            'exit_weighing_id' => $exit->id,
        ])->save();

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/weighing/history', [
            'yard_id' => $yard->id,
            'date_from' => '2026-03-31',
            'date_to' => '2026-03-31',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('count', 2)
            ->assertJsonPath('data.0.history_group_key', 'requirement:' . $requirement->id)
            ->assertJsonPath('data.1.history_group_key', 'requirement:' . $requirement->id);

        $data = collect($response->json('data'));

        $this->assertEqualsCanonicalizing(
            [$entry->id, $exit->id],
            $data->pluck('id')->all()
        );
    }

    public function test_history_includes_previous_day_entry_for_same_truck_without_requirement(): void
    {
        $user = User::factory()->create();
        $yard = Yard::create(['name' => 'Truck history yard']);
        $truck = Truck::create(['plate_number' => '420AYR05']);

        $entry = Weighing::create([
            'yard_id' => $yard->id,
            'plate_number' => '420AYR05',
            'weighing_type' => Weighing::TYPE_ENTRY,
            'weight' => 500,
            'weighed_at' => Carbon::parse('2026-03-30 12:02:19'),
            'truck_id' => $truck->id,
            'operator_user_id' => $user->id,
        ]);

        $exit = Weighing::create([
            'yard_id' => $yard->id,
            'plate_number' => '420AYR05',
            'weighing_type' => Weighing::TYPE_EXIT,
            'weight' => 600,
            'weighed_at' => Carbon::parse('2026-03-31 12:03:56'),
            'truck_id' => $truck->id,
            'operator_user_id' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/weighing/history', [
            'yard_id' => $yard->id,
            'date_from' => '2026-03-31',
            'date_to' => '2026-03-31',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('count', 2);

        $data = collect($response->json('data'));

        $this->assertEqualsCanonicalizing(
            [$entry->id, $exit->id],
            $data->pluck('id')->all()
        );

        $this->assertCount(1, $data->pluck('history_group_key')->unique());
    }

    public function test_history_includes_skipped_requirement_and_related_entry_weighing(): void
    {
        $user = User::factory()->create();
        $yard = Yard::create(['name' => 'Skipped history yard']);
        $truck = Truck::create(['plate_number' => 'SKP12305']);
        $visitor = Visitor::create([
            'plate_number' => 'SKP12305',
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'user_id' => $user->id,
        ]);

        $requirement = WeighingRequirement::create([
            'yard_id' => $yard->id,
            'visitor_id' => $visitor->id,
            'truck_id' => $truck->id,
            'plate_number' => 'SKP12305',
            'required_type' => WeighingRequirement::TYPE_BOTH,
            'reason' => WeighingRequirement::REASON_MANUAL,
            'status' => WeighingRequirement::STATUS_ENTRY_DONE,
        ]);

        $entry = Weighing::create([
            'yard_id' => $yard->id,
            'plate_number' => 'SKP12305',
            'weighing_type' => Weighing::TYPE_ENTRY,
            'weight' => 8200,
            'weighed_at' => Carbon::parse('2026-04-04 23:50:00'),
            'visitor_id' => $visitor->id,
            'truck_id' => $truck->id,
            'requirement_id' => $requirement->id,
            'operator_user_id' => $user->id,
        ]);

        $requirement->forceFill([
            'entry_weighing_id' => $entry->id,
            'status' => WeighingRequirement::STATUS_SKIPPED,
            'skipped_reason' => 'Весы были недоступны',
            'skipped_by_user_id' => $user->id,
            'skipped_at' => Carbon::parse('2026-04-05 08:15:00'),
        ])->save();

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/weighing/history', [
            'yard_id' => $yard->id,
            'date_from' => '2026-04-05',
            'date_to' => '2026-04-05',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('count', 2);

        $data = collect($response->json('data'));

        $this->assertTrue($data->contains(fn ($item) => $item['id'] === $entry->id));
        $this->assertTrue($data->contains(fn ($item) => $item['history_item_type'] === 'skipped' && $item['skipped_reason'] === 'Весы были недоступны'));
        $this->assertCount(1, $data->pluck('history_group_key')->unique());
    }

    public function test_history_returns_task_cargo_and_deviation_from_weight_difference(): void
    {
        $user = User::factory()->create();
        $status = Status::create(['key' => 'new', 'name' => 'Новый']);
        $yard = Yard::create(['name' => 'Deviation yard']);
        $truck = Truck::create(['plate_number' => 'DEV12305']);
        $task = Task::create([
            'name' => 'Рейс DEV',
            'user_id' => $user->id,
            'status_id' => $status->id,
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'plan_date' => now(),
            'total_weight' => 5000,
            'count_boxes' => 120,
        ]);

        $visitor = Visitor::create([
            'plate_number' => 'DEV12305',
            'yard_id' => $yard->id,
            'truck_id' => $truck->id,
            'task_id' => $task->id,
            'user_id' => $user->id,
            'entry_date' => now()->subHour(),
            'exit_date' => null,
            'confirmation_status' => Visitor::CONFIRMATION_PENDING,
        ]);

        $requirement = WeighingRequirement::create([
            'yard_id' => $yard->id,
            'visitor_id' => $visitor->id,
            'truck_id' => $truck->id,
            'task_id' => $task->id,
            'plate_number' => 'DEV12305',
            'required_type' => WeighingRequirement::TYPE_BOTH,
            'reason' => WeighingRequirement::REASON_TASK,
            'status' => WeighingRequirement::STATUS_COMPLETED,
        ]);

        $entry = Weighing::create([
            'yard_id' => $yard->id,
            'task_id' => $task->id,
            'plate_number' => 'DEV12305',
            'weighing_type' => Weighing::TYPE_ENTRY,
            'weight' => 10000,
            'weighed_at' => Carbon::parse('2026-04-06 10:00:00'),
            'visitor_id' => $visitor->id,
            'truck_id' => $truck->id,
            'requirement_id' => $requirement->id,
            'operator_user_id' => $user->id,
        ]);

        $exit = Weighing::create([
            'yard_id' => $yard->id,
            'task_id' => $task->id,
            'plate_number' => 'DEV12305',
            'weighing_type' => Weighing::TYPE_EXIT,
            'weight' => 14900,
            'weighed_at' => Carbon::parse('2026-04-06 12:00:00'),
            'visitor_id' => $visitor->id,
            'truck_id' => $truck->id,
            'requirement_id' => $requirement->id,
            'operator_user_id' => $user->id,
        ]);

        $requirement->forceFill([
            'entry_weighing_id' => $entry->id,
            'exit_weighing_id' => $exit->id,
        ])->save();

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/weighing/history', [
            'yard_id' => $yard->id,
            'date_from' => '2026-04-06',
            'date_to' => '2026-04-06',
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('count', 2)
            ->assertJsonPath('data.0.task_name', 'Рейс DEV')
            ->assertJsonPath('data.0.task_total_weight', 5000)
                ->assertJsonPath('data.0.task_count_boxes', 120)
            ->assertJsonPath('data.0.weight_diff', 4900)
            ->assertJsonPath('data.0.weight_diff_deviation', -100);
    }

    public function test_get_tasks_returns_actual_weighing_results_for_task(): void
    {
        $user = User::factory()->create();
        $status = Status::create(['key' => 'on_territory', 'name' => 'На территории']);
        $yard = Yard::create(['name' => 'Task weighing yard']);
        $truck = Truck::create(['plate_number' => 'TSK12305']);

        $task = Task::create([
            'name' => 'Рейс 100',
            'user_id' => $user->id,
            'status_id' => $status->id,
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'plan_date' => now(),
        ]);

        TaskWeighing::create([
            'task_id' => $task->id,
            'sort_order' => 1,
            'statuse_weighing_id' => 1,
            'yard_id' => $yard->id,
        ]);

        TaskWeighing::create([
            'task_id' => $task->id,
            'sort_order' => 2,
            'statuse_weighing_id' => 2,
            'yard_id' => $yard->id,
        ]);

        Weighing::create([
            'yard_id' => $yard->id,
            'task_id' => $task->id,
            'truck_id' => $truck->id,
            'plate_number' => $truck->plate_number,
            'weighing_type' => Weighing::TYPE_ENTRY,
            'weight' => 12000,
            'weighed_at' => Carbon::parse('2026-04-06 09:15:00'),
            'operator_user_id' => $user->id,
        ]);

        Weighing::create([
            'yard_id' => $yard->id,
            'task_id' => $task->id,
            'truck_id' => $truck->id,
            'plate_number' => $truck->plate_number,
            'weighing_type' => Weighing::TYPE_EXIT,
            'weight' => 7200,
            'weighed_at' => Carbon::parse('2026-04-06 12:45:00'),
            'operator_user_id' => $user->id,
        ]);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/task/gettasks', [
            'task_id' => $task->id,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.task_weighings.0.weight', 12000)
            ->assertJsonPath('data.task_weighings.1.weight', 7200);
    }
}