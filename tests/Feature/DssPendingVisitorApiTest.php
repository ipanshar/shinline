<?php

namespace Tests\Feature;

use App\Models\Visitor;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class DssPendingVisitorApiTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    public function test_add_pending_visitor_keeps_known_truck_pending_without_permit_in_free_yard(): void
    {
        $this->seedDssStatuses();
        $yard = $this->createYard(false);
        $truck = $this->createTruck(['plate_number' => '667ACJ02']);

        $response = $this->postJson('/api/security/addpendingvisitor', [
            'plate_number' => $truck->plate_number,
            'yard_id' => $yard->id,
            'recognition_confidence' => 98,
        ]);

        $response->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.auto_confirmed', false)
            ->assertJsonPath('data.truck_found', true)
            ->assertJsonPath('data.permit_found', false)
            ->assertJsonPath('data.visitor.confirmation_status', Visitor::CONFIRMATION_PENDING);

        $visitor = Visitor::query()->latest('id')->first();

        $this->assertNotNull($visitor);
        $this->assertSame($truck->id, $visitor->truck_id);
        $this->assertSame(Visitor::CONFIRMATION_PENDING, $visitor->confirmation_status);
        $this->assertNull($visitor->confirmed_at);
    }

    public function test_add_pending_visitor_auto_confirms_only_when_active_permit_exists(): void
    {
        $this->seedDssStatuses();
        $yard = $this->createYard(false);
        $truck = $this->createTruck(['plate_number' => '667ACJ02']);
        $permit = $this->createPermit($truck, $yard);

        $response = $this->postJson('/api/security/addpendingvisitor', [
            'plate_number' => $truck->plate_number,
            'yard_id' => $yard->id,
            'recognition_confidence' => 98,
        ]);

        $response->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.auto_confirmed', true)
            ->assertJsonPath('data.truck_found', true)
            ->assertJsonPath('data.permit_found', true)
            ->assertJsonPath('data.visitor.confirmation_status', Visitor::CONFIRMATION_CONFIRMED)
            ->assertJsonPath('data.visitor.entry_permit_id', $permit->id);

        $visitor = Visitor::query()->latest('id')->first();

        $this->assertNotNull($visitor);
        $this->assertSame($truck->id, $visitor->truck_id);
        $this->assertSame($permit->id, $visitor->entry_permit_id);
        $this->assertSame(Visitor::CONFIRMATION_CONFIRMED, $visitor->confirmation_status);
        $this->assertNotNull($visitor->confirmed_at);
    }
}