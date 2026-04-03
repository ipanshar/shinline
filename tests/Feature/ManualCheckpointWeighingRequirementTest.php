<?php

namespace Tests\Feature;

use App\Models\EntryPermit;
use App\Models\User;
use App\Models\Visitor;
use App\Models\WeighingRequirement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class ManualCheckpointWeighingRequirementTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    public function test_manual_checkpoint_add_creates_weighing_requirement_from_permit_without_task(): void
    {
        $this->seedDssStatuses();

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $this->createDevice($zone, $checkpoint, 'Entry');
        $truck = $this->createTruck(['plate_number' => 'A555BC']);
        $this->createPermit($truck, $yard, [
            'task_id' => null,
            'weighing_required' => true,
        ]);

        $response = $this->postJson('/api/security/checkpoint-review-manual-add', [
            'checkpoint_id' => $checkpoint->id,
            'plate_number' => $truck->plate_number,
        ]);

        $response->assertCreated()
            ->assertJsonPath('status', true);

        $visitor = Visitor::query()->latest('id')->first();
        $requirement = WeighingRequirement::query()->latest('id')->first();

        $this->assertNotNull($visitor);
        $this->assertSame(Visitor::CONFIRMATION_CONFIRMED, $visitor->confirmation_status);
        $this->assertNotNull($requirement);
        $this->assertSame($visitor->id, $requirement->visitor_id);
        $this->assertSame(WeighingRequirement::REASON_PERMIT, $requirement->reason);
        $this->assertSame(WeighingRequirement::STATUS_PENDING, $requirement->status);
    }

    public function test_manual_checkpoint_add_creates_one_time_permit_with_today_dates(): void
    {
        $this->seedDssStatuses();

        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $yard = $this->createYard(false);
        $zone = $this->createZone($yard);
        $checkpoint = $this->createCheckpoint($yard);
        $this->createDevice($zone, $checkpoint, 'Entry');
        $truck = $this->createTruck(['plate_number' => 'B555CD']);

        $response = $this->postJson('/api/security/checkpoint-review-manual-add', [
            'checkpoint_id' => $checkpoint->id,
            'plate_number' => $truck->plate_number,
            'create_permit' => true,
        ]);

        $response->assertCreated()
            ->assertJsonPath('status', true);

        $visitor = Visitor::query()->latest('id')->first();
        $permit = EntryPermit::query()->find($visitor?->entry_permit_id);

        $this->assertNotNull($visitor);
        $this->assertNotNull($permit);
        $this->assertTrue((bool) $permit->one_permission);
        $this->assertNotNull($permit->begin_date);
        $this->assertNotNull($permit->end_date);
        $this->assertSame(Carbon::today()->startOfDay()->format('Y-m-d H:i:s'), $permit->begin_date->format('Y-m-d H:i:s'));
        $this->assertSame(Carbon::today()->endOfDay()->format('Y-m-d H:i:s'), $permit->end_date->format('Y-m-d H:i:s'));
    }
}