<?php

namespace Tests\Feature;

use App\Http\Middleware\CheckPermission;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SpectechSchedule;
use App\Models\Truck;
use App\Models\TruckCategory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SpectechRequestStoreTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('app.key', 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
        $this->withoutMiddleware(CheckPermission::class);
    }

    public function test_check_availability_uses_requested_period(): void
    {
        [$user, $truck] = $this->createUserAndTruck();

        SpectechSchedule::query()->create([
            'user_id' => $user->id,
            'truck_id' => $truck->id,
            'equipment_type_key' => 'Самосвал Shacman',
            'equipment_type_label' => 'Самосвал Shacman',
            'assigned_truck_name' => 'Самосвал Shacman (932BC05)',
            'scheduled_start' => '2026-05-13 08:27:00',
            'scheduled_end' => '2026-05-14 23:59:00',
            'purpose' => 'Монтаж ремонт',
            'address' => 'Территория',
            'status' => SpectechSchedule::STATUS_PENDING,
        ]);

        $this->actingAs($user)
            ->getJson('/spectech/api/requests/check-availability?'.http_build_query([
                'truck_id' => $truck->id,
                'requested_start' => '2026-05-15T09:00',
                'requested_end' => '2026-05-15T18:00',
            ]))
            ->assertOk()
            ->assertJsonPath('available', true);
    }

    public function test_store_persists_requested_period_from_form(): void
    {
        [$user, $truck] = $this->createUserAndTruck();

        $this->actingAs($user)
            ->postJson('/spectech/api/requests', [
                'truck_id' => $truck->id,
                'requested_start' => '2026-05-15T09:00',
                'requested_end' => '2026-05-15T18:00',
                'terminal' => 'T1',
                'zone' => 'Zone A',
                'gate' => 'G-1',
                'address' => 'Terminal T1, Zone A',
                'comment' => 'Нужна техника',
                'photos' => [],
                'check_availability' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('data.requested_start', '2026-05-15T09:00:00+05:00')
            ->assertJsonPath('data.requested_end', '2026-05-15T18:00:00+05:00');

        $this->assertDatabaseHas('spectech_requests', [
            'user_id' => $user->id,
            'truck_id' => $truck->id,
            'start_date' => '2026-05-15 00:00:00',
            'end_date' => '2026-05-15 00:00:00',
            'terminal' => 'T1',
            'zone' => 'Zone A',
        ]);

        $this->assertDatabaseHas('spectech_schedules', [
            'user_id' => $user->id,
            'truck_id' => $truck->id,
            'scheduled_start' => '2026-05-15 09:00:00',
            'scheduled_end' => '2026-05-15 18:00:00',
        ]);
    }

    public function test_spectech_operator_can_create_request_from_another_users_schedule(): void
    {
        [$owner, $truck] = $this->createUserAndTruck();

        $spectechOperator = User::query()->create([
            'name' => 'Spectech Operator',
            'login' => 'spectech-operator',
            'email' => 'spectech-operator@example.com',
            'password' => 'secret',
        ]);

        $this->grantSpectechManagePermission($spectechOperator);

        $schedule = SpectechSchedule::query()->create([
            'user_id' => $owner->id,
            'truck_id' => $truck->id,
            'equipment_type_key' => 'Самосвал Shacman',
            'equipment_type_label' => 'Самосвал Shacman',
            'assigned_truck_name' => 'Самосвал Shacman (932BC05)',
            'scheduled_start' => '2026-05-15 09:00:00',
            'scheduled_end' => '2026-05-15 18:00:00',
            'purpose' => 'Монтаж ремонт',
            'address' => 'Территория',
            'status' => SpectechSchedule::STATUS_PENDING,
        ]);

        $this->actingAs($spectechOperator)
            ->postJson('/spectech/api/requests/from-schedule', [
                'schedule_id' => $schedule->id,
                'terminal' => 'T1',
                'zone' => 'Zone A',
                'gate' => 'G-1',
                'address' => 'Terminal T1, Zone A',
                'comment' => 'Нужна техника',
                'photos' => [],
            ])
            ->assertCreated()
            ->assertJsonPath('data.schedule_id', $schedule->id)
            ->assertJsonPath('data.from_scheduling', true);

        $this->assertDatabaseHas('spectech_requests', [
            'user_id' => $owner->id,
            'truck_id' => $truck->id,
            'schedule_id' => $schedule->id,
            'from_scheduling' => true,
            'terminal' => 'T1',
            'zone' => 'Zone A',
        ]);
    }

    private function createUserAndTruck(): array
    {
        $user = User::query()->create([
            'name' => 'Spectech User',
            'login' => 'spectech-user',
            'email' => 'spectech@example.com',
            'password' => 'secret',
        ]);

        $category = TruckCategory::query()->create(['name' => 'Спец техника']);
        $truck = Truck::query()->create([
            'name' => 'Самосвал Shacman',
            'plate_number' => '932BC05',
            'truck_category_id' => $category->id,
        ]);

        return [$user, $truck];
    }

    private function grantSpectechManagePermission(User $user): void
    {
        $role = Role::query()->firstOrCreate(
            ['name' => 'Оператор спецтехники'],
            [
                'level' => 55,
                'description' => 'Управление заявками на спецтехнику через веб и Telegram Mini App',
            ]
        );

        $managePermission = Permission::query()->firstOrCreate(
            ['name' => 'spectech.manage'],
            ['description' => 'Управление заявками на спецтехнику', 'group' => 'spectech']
        );

        $viewPermission = Permission::query()->firstOrCreate(
            ['name' => 'spectech.view'],
            ['description' => 'Просмотр и создание заявок на спецтехнику', 'group' => 'spectech']
        );

        $role->permissions()->syncWithoutDetaching([$managePermission->id, $viewPermission->id]);
        $user->roles()->syncWithoutDetaching([$role->id]);
    }
}
