<?php

namespace Tests\Feature;

use App\Models\Truck;
use App\Models\User;
use App\Models\Yard;
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
            'plate_number' => 'A123BC777',
            'weighing_type' => 'entry',
        ]);
    }
}