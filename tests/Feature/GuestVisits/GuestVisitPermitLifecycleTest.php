<?php

namespace Tests\Feature\GuestVisits;

use App\Models\EntryPermit;
use App\Models\GuestVisit;
use App\Models\GuestVisitPermit;
use App\Models\GuestVisitVehicle;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Status;
use App\Models\User;
use App\Services\DssPermitVehicleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class GuestVisitPermitLifecycleTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Mockery::close();

        parent::tearDown();
    }

    public function test_cleanup_command_revokes_expired_guest_vehicle_permits(): void
    {
        $statuses = $this->seedStatusesForCleanup();
        $yard = $this->createYard(false);
        $truck = $this->createTruck(['plate_number' => 'E303FG']);
        $creator = $this->createGuestVisitUser('guest.expired.owner', 'guest-expired-owner@example.com');
        $permit = $this->createPermit($truck, $yard, [
            'status_id' => $statuses['active']->id,
            'one_permission' => false,
            'is_guest' => true,
            'begin_date' => now()->subDays(2),
            'end_date' => now()->subMinute(),
        ]);

        $guestVisit = GuestVisit::create([
            'yard_id' => $yard->id,
            'guest_full_name' => 'Гость с истекшим сроком',
            'guest_position' => 'Аудитор',
            'guest_phone' => '+77001112233',
            'host_name' => 'Ответственный сотрудник',
            'host_phone' => '+77004445566',
            'visit_starts_at' => now()->subDay(),
            'visit_ends_at' => now()->subMinute(),
            'permit_kind' => GuestVisit::PERMIT_KIND_MULTI_TIME,
            'workflow_status' => GuestVisit::STATUS_ACTIVE,
            'has_vehicle' => true,
            'source' => GuestVisit::SOURCE_OPERATOR,
            'created_by_user_id' => $creator->id,
        ]);

        $guestVehicle = GuestVisitVehicle::create([
            'guest_visit_id' => $guestVisit->id,
            'truck_id' => $truck->id,
            'plate_number' => $truck->plate_number,
        ]);

        $permitLink = GuestVisitPermit::create([
            'guest_visit_id' => $guestVisit->id,
            'entry_permit_id' => $permit->id,
            'permit_subject_type' => 'vehicle',
            'guest_visit_vehicle_id' => $guestVehicle->id,
            'created_at' => now()->subHours(2),
            'revoked_at' => null,
        ]);

        $permitVehicleService = Mockery::mock(DssPermitVehicleService::class);
        $permitVehicleService->shouldReceive('revokePermitVehicleSafely')
            ->once()
            ->andReturn(['success' => true]);
        $this->app->instance(DssPermitVehicleService::class, $permitVehicleService);

        $this->artisan('cleanup:old-tasks-permits', [
            '--force' => true,
            '--days' => 0,
        ])->assertExitCode(0);

        $guestVisit->refresh();
        $permit->refresh();
        $permitLink->refresh();

        $this->assertSame(GuestVisit::STATUS_ACTIVE, $guestVisit->workflow_status);
        $this->assertSame($statuses['not_active']->id, $permit->status_id);
        $this->assertNotNull($permit->end_date);
        $this->assertNotNull($permitLink->revoked_at);
    }

    public function test_multi_time_check_out_marks_exit_without_revoking_permit(): void
    {
        $statuses = $this->seedStatusesForCleanup();
        $yard = $this->createYard(false);
        $truck = $this->createTruck(['plate_number' => 'M404TT']);
        $creator = $this->createGuestVisitUser('guest.multi.owner', 'guest-multi-owner@example.com');
        $permit = $this->createPermit($truck, $yard, [
            'status_id' => $statuses['active']->id,
            'one_permission' => false,
            'is_guest' => true,
            'begin_date' => now()->subHour(),
            'end_date' => now()->addHour(),
        ]);

        $guestVisit = GuestVisit::create([
            'yard_id' => $yard->id,
            'guest_full_name' => 'Многоразовый гость',
            'guest_position' => 'Инженер',
            'guest_phone' => '+77005556677',
            'host_name' => 'Принимающая сторона',
            'host_phone' => '+77006667788',
            'visit_starts_at' => now()->subHour(),
            'visit_ends_at' => now()->addHour(),
            'permit_kind' => GuestVisit::PERMIT_KIND_MULTI_TIME,
            'workflow_status' => GuestVisit::STATUS_ACTIVE,
            'has_vehicle' => true,
            'last_entry_at' => now()->subMinutes(20),
            'source' => GuestVisit::SOURCE_OPERATOR,
            'created_by_user_id' => $creator->id,
        ]);

        $guestVehicle = GuestVisitVehicle::create([
            'guest_visit_id' => $guestVisit->id,
            'truck_id' => $truck->id,
            'plate_number' => $truck->plate_number,
        ]);

        $permitLink = GuestVisitPermit::create([
            'guest_visit_id' => $guestVisit->id,
            'entry_permit_id' => $permit->id,
            'permit_subject_type' => 'vehicle',
            'guest_visit_vehicle_id' => $guestVehicle->id,
            'created_at' => now()->subMinutes(30),
            'revoked_at' => null,
        ]);

        $user = $this->createGuestVisitUserWithPermission(
            'security.operator',
            'security.operator@example.com',
            'guest_visits.close'
        );

        $permitVehicleService = Mockery::mock(DssPermitVehicleService::class);
        $permitVehicleService->shouldReceive('revokePermitVehicleSafely')->never();
        $this->app->instance(DssPermitVehicleService::class, $permitVehicleService);

        Sanctum::actingAs($user);

        $response = $this->postJson('/api/security/guest-visits/check-out', [
            'id' => $guestVisit->id,
        ]);

        $response->assertOk()
            ->assertJson([
                'status' => true,
                'message' => 'Уход гостя отмечен',
            ]);

        $guestVisit->refresh();
        $permit->refresh();
        $permitLink->refresh();

        $this->assertSame(GuestVisit::STATUS_ACTIVE, $guestVisit->workflow_status);
        $this->assertNotNull($guestVisit->last_exit_at);
        $this->assertNull($permitLink->revoked_at);
        $this->assertSame($statuses['active']->id, $permit->status_id);
    }

    private function seedStatusesForCleanup(): array
    {
        $statuses = $this->seedDssStatuses();

        foreach ([
            'new' => 'Новый',
            'canceled' => 'Отменён',
        ] as $key => $name) {
            $statuses[$key] = Status::firstOrCreate([
                'key' => $key,
            ], [
                'name' => $name,
            ]);
        }

        return $statuses;
    }

    private function createGuestVisitUser(string $login, string $email): User
    {
        return User::create([
            'name' => 'Guest Visit User',
            'login' => $login,
            'email' => $email,
            'password' => 'password',
            'phone' => '+77000000000',
        ]);
    }

    private function createGuestVisitUserWithPermission(string $login, string $email, string $permissionName): User
    {
        $permission = Permission::firstOrCreate([
            'name' => $permissionName,
        ], [
            'description' => 'Тестовое разрешение для гостевых визитов',
            'group' => 'guest_visits',
        ]);

        $role = Role::create([
            'name' => 'Роль для ' . $login,
            'level' => 50,
            'description' => 'Тестовая роль для гостевых визитов',
        ]);
        $role->permissions()->attach($permission->id);

        $user = $this->createGuestVisitUser($login, $email);
        $user->roles()->attach($role->id);

        return $user;
    }
}
