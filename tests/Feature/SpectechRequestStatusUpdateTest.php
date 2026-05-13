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
