<?php

namespace Tests\Feature;

use App\Models\EntryPermit;
use App\Models\User;
use App\Models\Visitor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class CheckpointReviewConfirmVisitorTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

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
    }
}