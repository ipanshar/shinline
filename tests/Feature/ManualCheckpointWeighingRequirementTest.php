<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Visitor;
use App\Models\WeighingRequirement;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}