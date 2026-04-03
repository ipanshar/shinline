<?php

namespace Tests\Feature;

use App\Models\EntryPermit;
use App\Models\Status;
use App\Models\Truck;
use App\Models\User;
use App\Services\DssPermitVehicleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

class AddApiTaskIntegrationIssuerTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();

        parent::tearDown();
    }

    public function test_add_api_task_marks_permit_as_issued_by_integration(): void
    {
        Status::create(['key' => 'new', 'name' => 'Новый']);
        Status::create(['key' => 'on_territory', 'name' => 'На территории']);
        Status::create(['key' => 'active', 'name' => 'Активный']);

        $dssService = Mockery::mock(DssPermitVehicleService::class);
        $dssService->shouldReceive('syncPermitVehicleSafely')
            ->once()
            ->andReturn(['success' => true, 'action' => 'sync']);
        app()->instance(DssPermitVehicleService::class, $dssService);

        $response = $this->postJson('/api/task/addapitask', [
            'task_id' => '2911',
            'vin' => '',
            'weighing' => false,
            'user_name' => 'Владимир Логотин ',
            'login' => '77762239332',
            'trailer_model' => null,
            'truck_model' => 'Mercedes-Benz ТС',
            'trailer_plate_number' => null,
            'plate_number' => '929EU02',
            'description' => 'Приемка',
            'avtor' => 'Кайрылхан Абай',
            'plan_date' => '2026-02-24 12:08:18',
            'name' => 'SIM000000447',
            'warehouse' => [[
                'name' => 'Склад СиМ БШЛ Б 7 ПК 1',
                'sorting_order' => 1,
                'gates' => [],
                'plan_gate' => null,
                'description' => null,
                'barcode' => '0101010100214',
                'yard' => '',
                'document' => 'АLУ-0000573',
                'arrival_at' => '',
                'departure_at' => '',
            ]],
            'user_phone' => '+77762239332',
            'phone' => '',
            'Yard' => '',
            'trailer_type' => null,
            'truck_category' => null,
            'company' => null,
            'color' => '',
        ]);

        $response->assertOk()->assertJsonPath('status', true);

        $permit = EntryPermit::query()->latest('id')->first();
        $integrationUser = User::query()->where('login', 'integration')->first();

        $this->assertNotNull($permit);
        $this->assertNotNull($integrationUser);
        $this->assertSame('Интеграция', $integrationUser->name);
        $this->assertSame($integrationUser->id, $permit->granted_by_user_id);

        $viewer = User::factory()->create();
        Sanctum::actingAs($viewer);

        $truck = Truck::find($permit->truck_id);
        $permitsResponse = $this->postJson('/api/security/getpermitsbytruck', [
            'truck_id' => $truck?->id,
        ]);

        $permitsResponse
            ->assertOk()
            ->assertJsonPath('data.0.granted_by_name', 'Интеграция');
    }
}