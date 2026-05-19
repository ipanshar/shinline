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
                'initiator_name' => 'Инициатор Теста',
                'initiator_phone' => '+77001112233',
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
            ->assertJsonPath('data.initiator_name', 'Инициатор Теста')
            ->assertJsonPath('data.initiator_phone', '+77001112233')
            ->assertJsonPath('data.client_name', 'Инициатор Теста')
            ->assertJsonPath('data.requested_start', '2026-05-15T09:00:00+05:00')
            ->assertJsonPath('data.requested_end', '2026-05-15T18:00:00+05:00');

        $this->assertDatabaseHas('spectech_requests', [
            'user_id' => $user->id,
            'truck_id' => $truck->id,
            'initiator_name' => 'Инициатор Теста',
            'initiator_phone' => '+77001112233',
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

    public function test_store_accepts_request_when_selected_truck_is_busy(): void
    {
        [$user, $truck] = $this->createUserAndTruck();

        SpectechSchedule::query()->create([
            'user_id' => $user->id,
            'truck_id' => $truck->id,
            'equipment_type_key' => 'Самосвал Shacman',
            'equipment_type_label' => 'Самосвал Shacman',
            'assigned_truck_name' => 'Самосвал Shacman (932BC05)',
            'scheduled_start' => '2026-05-15 08:00:00',
            'scheduled_end' => '2026-05-15 12:00:00',
            'purpose' => 'Уже запланированная работа',
            'address' => 'Территория',
            'status' => SpectechSchedule::STATUS_PENDING,
        ]);

        $this->actingAs($user)
            ->postJson('/spectech/api/requests', [
                'truck_id' => $truck->id,
                'requested_start' => '2026-05-15T09:00',
                'requested_end' => '2026-05-15T18:00',
                'terminal' => 'T1',
                'zone' => 'Zone A',
                'gate' => 'G-1',
                'address' => 'Terminal T1, Zone A',
                'comment' => 'Нужна техника несмотря на занятость',
                'photos' => [],
                'check_availability' => true,
            ])
            ->assertCreated()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.status', 'new')
            ->assertJsonCount(1, 'data.conflict_info');

        $this->assertDatabaseHas('spectech_requests', [
            'user_id' => $user->id,
            'truck_id' => $truck->id,
            'comment' => 'Нужна техника несмотря на занятость',
            'status' => 'new',
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
                'initiator_name' => 'Заявитель от оператора',
                'initiator_phone' => '+77002223344',
                'terminal' => 'T1',
                'zone' => 'Zone A',
                'gate' => 'G-1',
                'address' => 'Terminal T1, Zone A',
                'comment' => 'Нужна техника',
                'photos' => [],
            ])
            ->assertCreated()
            ->assertJsonPath('data.schedule_id', $schedule->id)
            ->assertJsonPath('data.initiator_name', 'Заявитель от оператора')
            ->assertJsonPath('data.initiator_phone', '+77002223344')
            ->assertJsonPath('data.from_scheduling', true);

        $this->assertDatabaseHas('spectech_requests', [
            'user_id' => $owner->id,
            'truck_id' => $truck->id,
            'schedule_id' => $schedule->id,
            'from_scheduling' => true,
            'initiator_name' => 'Заявитель от оператора',
            'initiator_phone' => '+77002223344',
            'terminal' => 'T1',
            'zone' => 'Zone A',
        ]);
    }

    public function test_update_persists_initiator_fields(): void
    {
        [$user, $truck] = $this->createUserAndTruck();

        $request = $this->createSpectechRequestForUser($user, $truck, 'T1', 'Zone A');

        $this->actingAs($user)
            ->putJson("/spectech/api/requests/{$request->id}", [
                'truck_id' => $truck->id,
                'initiator_name' => 'Новый инициатор',
                'initiator_phone' => '+77005556677',
                'requested_start' => '2026-05-15T09:00',
                'requested_end' => '2026-05-15T18:00',
                'terminal' => 'T1',
                'zone' => 'Zone A',
                'gate' => 'G-1',
                'address' => 'Terminal T1, Zone A',
                'comment' => 'Обновлено',
                'photos' => [],
                'check_availability' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.initiator_name', 'Новый инициатор')
            ->assertJsonPath('data.initiator_phone', '+77005556677')
            ->assertJsonPath('data.client_name', 'Новый инициатор');

        $this->assertDatabaseHas('spectech_requests', [
            'id' => $request->id,
            'initiator_name' => 'Новый инициатор',
            'initiator_phone' => '+77005556677',
        ]);
    }

    public function test_spectech_operator_role_sees_all_requests(): void
    {
        [$owner, $truck] = $this->createUserAndTruck();

        $otherUser = User::query()->create([
            'name' => 'Second Spectech User',
            'login' => 'spectech-user-2',
            'email' => 'spectech2@example.com',
            'password' => 'secret',
        ]);

        $spectechOperator = User::query()->create([
            'name' => 'Spectech Operator',
            'login' => 'spectech-operator',
            'email' => 'spectech-operator@example.com',
            'password' => 'secret',
        ]);

        $operatorRole = Role::query()->firstOrCreate(
            ['name' => 'Оператор спецтехники'],
            [
                'level' => 55,
                'description' => 'Управление заявками на спецтехнику через веб и Telegram Mini App',
            ]
        );

        $viewPermission = Permission::query()->firstOrCreate(
            ['name' => 'spectech.view'],
            ['description' => 'Просмотр и создание заявок на спецтехнику', 'group' => 'spectech']
        );

        $operatorRole->permissions()->syncWithoutDetaching([$viewPermission->id]);
        $spectechOperator->roles()->syncWithoutDetaching([$operatorRole->id]);

        $firstRequest = $this->createSpectechRequestForUser($owner, $truck, 'T1', 'Zone A');
        $secondRequest = $this->createSpectechRequestForUser($otherUser, $truck, 'T2', 'Zone B');

        $this->actingAs($spectechOperator)
            ->getJson('/spectech/api/requests')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonFragment(['id' => $firstRequest->id])
            ->assertJsonFragment(['id' => $secondRequest->id]);
    }

    private function createUserAndTruck(): array
    {
        $user = User::query()->create([
            'name' => 'Spectech User',
            'login' => 'spectech-user',
            'email' => 'spectech@example.com',
            'password' => 'secret',
            'phone' => '+77000000001',
        ]);

        $category = TruckCategory::query()->create(['name' => 'Спец техника']);
        $truck = Truck::query()->create([
            'name' => 'Самосвал Shacman',
            'plate_number' => '932BC05',
            'truck_category_id' => $category->id,
        ]);

        return [$user, $truck];
    }

    private function createSpectechRequestForUser(User $user, Truck $truck, string $terminal, string $zone)
    {
        return \App\Models\SpectechRequest::query()->create([
            'user_id' => $user->id,
            'initiator_name' => $user->name,
            'initiator_phone' => $user->phone,
            'truck_id' => $truck->id,
            'start_date' => '2026-05-15 00:00:00',
            'end_date' => '2026-05-15 00:00:00',
            'requested_start' => '2026-05-15 09:00:00',
            'requested_end' => '2026-05-15 18:00:00',
            'terminal' => $terminal,
            'zone' => $zone,
            'address' => "Terminal {$terminal}, {$zone}",
            'status' => 'new',
            'timeline' => \App\Models\SpectechRequest::buildInitialTimeline(),
        ]);
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
