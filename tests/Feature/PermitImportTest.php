<?php

namespace Tests\Feature;

use App\Models\Counterparty;
use App\Models\EntryPermit;
use App\Models\Status;
use App\Models\Truck;
use App\Models\User;
use App\Models\Yard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PermitImportTest extends TestCase
{
    use RefreshDatabase;

    public function test_import_creates_owner_truck_and_permanent_permit(): void
    {
        $user = User::factory()->create();
        $yard = Yard::create(['name' => 'Import yard']);
        $activeStatus = Status::create(['name' => 'Активно', 'key' => 'active']);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/security/import-permits', [
            'yard_id' => $yard->id,
            'one_permission' => false,
            'weighing_required' => true,
            'rows' => [
                [
                    'Гос. номер' => 'a 123-bc 777',
                    'Собственник' => 'Шин Лайн',
                    'Марка а/м' => 'ISUZU Nhr 55e',
                    'Год выпуска' => '2008',
                    'Тип ТС' => 'рефрижератор',
                    'Кузов' => '3-х секционная',
                    'Примечание' => 'передано в ГО',
                ],
            ],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.created_trucks', 1)
            ->assertJsonPath('data.created_counterparties', 1)
            ->assertJsonPath('data.created_permits', 1)
            ->assertJsonPath('data.skipped_permits', 0);

        $counterparty = Counterparty::query()->where('name', 'Шин Лайн')->first();
        $truck = Truck::query()->where('plate_number', 'A123BC777')->first();

        $this->assertNotNull($counterparty);
        $this->assertNotNull($truck);
        $this->assertSame($counterparty->id, $truck->counterparty_id);

        $this->assertDatabaseHas('entry_permits', [
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'status_id' => $activeStatus->id,
            'one_permission' => false,
            'weighing_required' => true,
        ]);

        $permit = EntryPermit::query()->where('truck_id', $truck->id)->first();
        $this->assertNotNull($permit);
        $this->assertStringContainsString('Примечание: передано в ГО', (string) $permit->comment);
    }

    public function test_import_updates_existing_truck_and_skips_duplicate_active_permit(): void
    {
        $user = User::factory()->create();
        $yard = Yard::create(['name' => 'Update yard']);
        $activeStatus = Status::create(['name' => 'Активно', 'key' => 'active']);
        $oldCounterparty = Counterparty::create([
            'name' => 'Старый владелец',
            'inn' => 'TEST-OLD-OWNER',
        ]);
        $truck = Truck::create([
            'plate_number' => 'B456CD777',
            'name' => 'Old truck',
            'counterparty_id' => $oldCounterparty->id,
        ]);
        EntryPermit::create([
            'truck_id' => $truck->id,
            'yard_id' => $yard->id,
            'one_permission' => false,
            'status_id' => $activeStatus->id,
            'begin_date' => now(),
        ]);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/security/import-permits', [
            'yard_id' => $yard->id,
            'one_permission' => false,
            'weighing_required' => false,
            'rows' => [
                [
                    'Номер ТС' => 'B456CD777',
                    'Владелец' => 'Новый владелец',
                    'Марка а/м' => 'DAF 105',
                ],
            ],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.updated_trucks', 1)
            ->assertJsonPath('data.created_permits', 0)
            ->assertJsonPath('data.skipped_permits', 1);

        $truck->refresh();
        $newCounterparty = Counterparty::query()->where('name', 'Новый владелец')->first();

        $this->assertNotNull($newCounterparty);
        $this->assertSame($newCounterparty->id, $truck->counterparty_id);
        $this->assertSame('DAF 105', $truck->name);
        $this->assertSame(1, EntryPermit::query()->where('truck_id', $truck->id)->count());
    }

    public function test_import_collects_errors_for_invalid_rows(): void
    {
        $user = User::factory()->create();
        $yard = Yard::create(['name' => 'Errors yard']);
        Status::create(['name' => 'Активно', 'key' => 'active']);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/security/import-permits', [
            'yard_id' => $yard->id,
            'one_permission' => false,
            'weighing_required' => null,
            'rows' => [
                [
                    'Марка а/м' => 'VOLVO FH',
                ],
            ],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.processed_rows', 0)
            ->assertJsonCount(1, 'data.errors');

        $this->assertSame(0, Truck::query()->count());
        $this->assertSame(0, EntryPermit::query()->count());
    }
}