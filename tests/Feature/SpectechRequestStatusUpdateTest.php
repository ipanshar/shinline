<?php

namespace Tests\Feature;

use App\Http\Middleware\CheckPermission;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SpectechRequest;
use App\Models\Truck;
use App\Models\TruckCategory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SpectechRequestStatusUpdateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('app.key', 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
        $this->withoutMiddleware(CheckPermission::class);
    }

    public function test_frozen_request_can_be_finished_only_as_returned(): void
    {
        [$operator, $request] = $this->makeFrozenRequest();

        $this->actingAs($operator)
            ->patchJson("/spectech/api/requests/{$request->id}/status", [
                'status' => SpectechRequest::STATUS_RETURNED,
            ])
            ->assertOk()
            ->assertJsonPath('data.status', SpectechRequest::STATUS_RETURNED);

        $request->refresh();

        $this->assertSame(SpectechRequest::STATUS_RETURNED, $request->status);
        $this->assertNotNull($request->timeline[5]['time'] ?? null);
    }

    public function test_frozen_request_rejects_completed_status(): void
    {
        [$operator, $request] = $this->makeFrozenRequest();

        $this->actingAs($operator)
            ->patchJson("/spectech/api/requests/{$request->id}/status", [
                'status' => SpectechRequest::STATUS_COMPLETED,
            ])
            ->assertStatus(409)
            ->assertJsonPath('status', false);

        $this->assertSame(SpectechRequest::STATUS_WORK_STARTED, $request->fresh()->status);
    }

    public function test_spectech_operator_with_manage_permission_can_update_status(): void
    {
        [$owner, $request] = $this->makeFrozenRequest();

        $spectechOperator = User::query()->create([
            'name' => 'Spectech Operator',
            'login' => 'spectech-operator',
            'email' => 'spectech-operator@example.com',
            'password' => 'secret',
        ]);

        $this->grantSpectechManagePermission($spectechOperator);

        $this->actingAs($spectechOperator)
            ->patchJson("/spectech/api/requests/{$request->id}/status", [
                'status' => SpectechRequest::STATUS_RETURNED,
            ])
            ->assertOk()
            ->assertJsonPath('data.status', SpectechRequest::STATUS_RETURNED);

        $this->assertSame(SpectechRequest::STATUS_RETURNED, $request->fresh()->status);
    }

    public function test_owner_can_cancel_spectech_request_with_reason(): void
    {
        [$owner, $request] = $this->makeFrozenRequest();

        $this->actingAs($owner)
            ->patchJson("/spectech/api/requests/{$request->id}/cancel", [
                'reason' => 'Работы перенесены',
            ])
            ->assertOk()
            ->assertJsonPath('status', true)
            ->assertJsonPath('data.status', SpectechRequest::STATUS_CANCELLED)
            ->assertJsonPath('data.cancellation_reason', 'Работы перенесены')
            ->assertJsonPath('data.cancelled_by', SpectechRequest::CANCELLED_BY_OPERATOR);

        $request->refresh();

        $this->assertSame(SpectechRequest::STATUS_CANCELLED, $request->status);
        $this->assertSame('Работы перенесены', $request->cancellation_reason);
        $this->assertSame(SpectechRequest::CANCELLED_BY_OPERATOR, $request->cancelled_by);
    }

    public function test_completed_spectech_request_cannot_be_cancelled(): void
    {
        [$owner, $request] = $this->makeFrozenRequest();
        $request->update(['status' => SpectechRequest::STATUS_COMPLETED]);

        $this->actingAs($owner)
            ->patchJson("/spectech/api/requests/{$request->id}/cancel", [
                'reason' => 'Не нужно',
            ])
            ->assertStatus(409)
            ->assertJsonPath('status', false);

        $this->assertSame(SpectechRequest::STATUS_COMPLETED, $request->fresh()->status);
    }

    public function test_operator_edit_marks_request_as_updated_by_operator(): void
    {
        [$owner, $request] = $this->makeEditableRequest();

        $spectechOperator = User::query()->create([
            'name' => 'Spectech Operator',
            'login' => 'spectech-operator-edit',
            'email' => 'spectech-operator-edit@example.com',
            'password' => 'secret',
        ]);

        $this->grantSpectechManagePermission($spectechOperator);

        $this->actingAs($spectechOperator)
            ->putJson("/spectech/api/requests/{$request->id}", [
                'truck_id' => $request->truck_id,
                'initiator_name' => $request->initiator_name,
                'initiator_phone' => $request->initiator_phone,
                'driver_name' => 'Новый водитель оператора',
                'driver_phone' => '+77018887766',
                'requested_start' => now()->addDays(2)->toIso8601String(),
                'requested_end' => now()->addDays(2)->addHours(4)->toIso8601String(),
                'terminal' => 'T2',
                'zone' => 'Зона B',
                'gate' => 'G2',
                'address' => 'Новый адрес оператора',
                'comment' => 'Изменено оператором',
            ])
            ->assertOk()
            ->assertJsonPath('data.updated_by_operator', true)
            ->assertJsonPath('data.operator_updated_by_name', 'Spectech Operator');

        $request->refresh();

        $this->assertNotNull($request->operator_updated_at);
        $this->assertSame($spectechOperator->id, $request->operator_updated_by_user_id);
    }

    public function test_owner_edit_clears_operator_update_marker(): void
    {
        [$owner, $request] = $this->makeEditableRequest();
        $operator = User::query()->create([
            'name' => 'Marker Operator',
            'login' => 'marker-operator',
            'email' => 'marker-operator@example.com',
            'password' => 'secret',
        ]);

        $request->update([
            'operator_updated_at' => now()->subHour(),
            'operator_updated_by_user_id' => $operator->id,
        ]);

        $this->actingAs($owner)
            ->putJson("/spectech/api/requests/{$request->id}", [
                'truck_id' => $request->truck_id,
                'initiator_name' => $owner->name,
                'initiator_phone' => $owner->phone,
                'driver_name' => 'Водитель заказчика',
                'driver_phone' => '+77017776655',
                'requested_start' => now()->addDays(3)->toIso8601String(),
                'requested_end' => now()->addDays(3)->addHours(2)->toIso8601String(),
                'terminal' => 'T3',
                'zone' => 'Зона C',
                'gate' => 'G3',
                'address' => 'Адрес заказчика',
                'comment' => 'Исправлено заказчиком',
            ])
            ->assertOk()
            ->assertJsonPath('data.updated_by_operator', false)
            ->assertJsonPath('data.operator_updated_by_name', null)
            ->assertJsonPath('data.operator_updated_at', null);

        $request->refresh();

        $this->assertNull($request->operator_updated_at);
        $this->assertNull($request->operator_updated_by_user_id);
    }

    private function makeFrozenRequest(): array
    {
        $operator = User::query()->create([
            'name' => 'Operator User',
            'login' => 'operator',
            'email' => 'operator@example.com',
            'password' => 'secret',
        ]);

        $operatorRole = Role::query()->create(['name' => 'Оператор']);
        $managePermission = Permission::query()->firstOrCreate(
            ['name' => 'spectech.manage'],
            ['description' => 'Управление заявками на спецтехнику', 'group' => 'spectech']
        );
        $viewPermission = Permission::query()->firstOrCreate(
            ['name' => 'spectech.view'],
            ['description' => 'Просмотр и создание заявок на спецтехнику', 'group' => 'spectech']
        );

        $operatorRole->permissions()->syncWithoutDetaching([$managePermission->id, $viewPermission->id]);
        $operator->roles()->attach($operatorRole);

        $category = TruckCategory::query()->create(['name' => 'Спец техника']);
        $truck = Truck::query()->create([
            'name' => 'Автокран',
            'truck_category_id' => $category->id,
        ]);

        $timeline = SpectechRequest::buildInitialTimeline();
        $timeline[1]['time'] = now()->subHours(5)->toIso8601String();
        $timeline[2]['time'] = now()->subHours(4)->toIso8601String();
        $timeline[3]['time'] = now()->subHours(3)->toIso8601String();

        $request = SpectechRequest::query()->create([
            'user_id' => $operator->id,
            'truck_id' => $truck->id,
            'start_date' => now()->subDay()->toDateString(),
            'end_date' => now()->subDay()->toDateString(),
            'requested_start' => now()->subHours(6),
            'requested_end' => now()->subHour(),
            'terminal' => 'T1',
            'zone' => 'Зона A',
            'address' => 'Терминал T1, Зона A',
            'status' => SpectechRequest::STATUS_WORK_STARTED,
            'timeline' => $timeline,
        ]);

        return [$operator, $request];
    }

    private function makeEditableRequest(): array
    {
        $owner = User::query()->create([
            'name' => 'Request Owner',
            'login' => 'request-owner',
            'email' => 'request-owner@example.com',
            'password' => 'secret',
            'phone' => '+77010000001',
        ]);

        $category = TruckCategory::query()->create(['name' => 'Спец техника']);
        $truck = Truck::query()->create([
            'name' => 'Манипулятор',
            'truck_category_id' => $category->id,
        ]);

        $request = SpectechRequest::query()->create([
            'user_id' => $owner->id,
            'initiator_name' => $owner->name,
            'initiator_phone' => $owner->phone,
            'truck_id' => $truck->id,
            'driver_name' => 'Старый водитель',
            'driver_phone' => '+77010000002',
            'start_date' => now()->addDay()->toDateString(),
            'end_date' => now()->addDay()->toDateString(),
            'requested_start' => now()->addDay(),
            'requested_end' => now()->addDay()->addHours(3),
            'terminal' => 'T1',
            'zone' => 'Зона A',
            'address' => 'Старый адрес',
            'status' => SpectechRequest::STATUS_NEW,
            'timeline' => SpectechRequest::buildInitialTimeline(),
        ]);

        return [$owner, $request];
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
