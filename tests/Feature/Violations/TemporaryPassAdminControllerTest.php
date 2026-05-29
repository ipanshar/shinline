<?php

namespace Tests\Feature\Violations;

use App\Models\Role;
use App\Models\User;
use App\Models\ViolationEmployee;
use App\Services\Violations\TemporaryPassService;
use Database\Seeders\PermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class TemporaryPassAdminControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionsSeeder::class);
    }

    public function test_security_reviewer_can_filter_temporary_workers_by_status_and_search(): void
    {
        $now = Carbon::create(2026, 5, 22, 9, 0, 0);
        $this->travelTo($now);

        $reviewer = User::create([
            'name' => 'Security Reviewer',
            'login' => 'security-reviewer-temp',
            'email' => 'security-reviewer-temp@example.com',
            'password' => 'x',
        ]);

        $role = Role::findByName('Служба безопасности');
        $this->assertNotNull($role);
        $reviewer->roles()->attach($role->id);

        ViolationEmployee::query()->create([
            'business_key' => 'temporary:active',
            'source_system' => 'manual_security',
            'person_kind' => TemporaryPassService::PERSON_KIND_TEMPORARY_CONTRACTOR,
            'full_name' => 'Активный Подрядчик',
            'normalized_full_name' => 'активный подрядчик',
            'department' => 'Стройка',
            'position' => 'Монтажник',
            'employment_status' => 'TEMPORARY_CONTRACTOR',
            'temporary_pass_status' => TemporaryPassService::PASS_STATUS_ACTIVE,
            'temporary_pass_issued_at' => $now->copy()->subWeek(),
            'temporary_pass_expires_at' => $now->copy()->addDays(25),
            'temporary_pass_duration_months' => 1,
            'temporary_pass_created_by_name' => 'Security Reviewer',
            'is_active' => true,
            'imported_at' => $now,
        ]);

        ViolationEmployee::query()->create([
            'business_key' => 'temporary:soon',
            'source_system' => 'manual_security',
            'person_kind' => TemporaryPassService::PERSON_KIND_TEMPORARY_CONTRACTOR,
            'full_name' => 'Скоро Истечет',
            'normalized_full_name' => 'скоро истечет',
            'department' => 'Подрядчики',
            'position' => 'Сварщик',
            'employment_status' => 'TEMPORARY_CONTRACTOR',
            'temporary_pass_status' => TemporaryPassService::PASS_STATUS_ACTIVE,
            'temporary_pass_issued_at' => $now->copy()->subDays(20),
            'temporary_pass_expires_at' => $now->copy()->addDays(5),
            'temporary_pass_duration_months' => 1,
            'temporary_pass_created_by_name' => 'Security Reviewer',
            'is_active' => true,
            'imported_at' => $now,
        ]);

        ViolationEmployee::query()->create([
            'business_key' => 'temporary:expired',
            'source_system' => 'manual_security',
            'person_kind' => TemporaryPassService::PERSON_KIND_TEMPORARY_CONTRACTOR,
            'full_name' => 'Просроченный Подрядчик',
            'normalized_full_name' => 'просроченный подрядчик',
            'department' => 'Ремонт',
            'position' => 'Электрик',
            'employment_status' => 'TEMPORARY_CONTRACTOR',
            'temporary_pass_status' => TemporaryPassService::PASS_STATUS_ACTIVE,
            'temporary_pass_issued_at' => $now->copy()->subMonthsNoOverflow(2),
            'temporary_pass_expires_at' => $now->copy()->subDay(),
            'temporary_pass_duration_months' => 1,
            'temporary_pass_created_by_name' => 'Security Reviewer',
            'is_active' => true,
            'imported_at' => $now,
        ]);

        ViolationEmployee::query()->create([
            'business_key' => 'sigur:employee',
            'source_system' => 'sigur',
            'person_kind' => 'employee',
            'full_name' => 'Штатный Сотрудник',
            'normalized_full_name' => 'штатный сотрудник',
            'department' => 'Производство',
            'position' => 'Оператор',
            'employment_status' => 'AVAILABLE',
            'is_active' => true,
            'imported_at' => $now,
        ]);

        $all = $this->actingAs($reviewer)->getJson('/violations/api/temporary-workers');
        $all->assertOk();
        $this->assertCount(3, $all->json('data'));

        $expired = $this->actingAs($reviewer)->getJson('/violations/api/temporary-workers?status=expired');
        $expired->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.full_name', 'Просроченный Подрядчик')
            ->assertJsonPath('data.0.temporary_pass_status', TemporaryPassService::PASS_STATUS_EXPIRED);

        $active = $this->actingAs($reviewer)->getJson('/violations/api/temporary-workers?status=active');
        $active->assertOk()->assertJsonCount(2, 'data');

        $expiresSoon = $this->actingAs($reviewer)->getJson('/violations/api/temporary-workers?status=expires_soon');
        $expiresSoon->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.full_name', 'Скоро Истечет');

        $search = $this->actingAs($reviewer)->getJson('/violations/api/temporary-workers?search=Стройка');
        $search->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.full_name', 'Активный Подрядчик');
    }
}
