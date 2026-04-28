<?php

namespace Tests\Feature\Telegram;

use App\Models\Permission;
use App\Models\Role;
use App\Models\TelegramBotChat;
use App\Models\User;
use App\Models\Yard;
use App\Services\TelegramMessagingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

class TelegramUserAdminControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\PermissionsSeeder::class);

        $messaging = Mockery::mock(TelegramMessagingService::class);
        $messaging->shouldReceive('sendText')->zeroOrMoreTimes();
        $messaging->shouldReceive('sendWithMiniAppButton')->zeroOrMoreTimes();
        $this->app->instance(TelegramMessagingService::class, $messaging);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_unauthenticated_request_blocked(): void
    {
        $this->getJson('/api/admin/telegram-users')->assertStatus(401);
    }

    public function test_user_without_permission_gets_403(): void
    {
        $user = User::create(['name' => 'Plain', 'login' => 'plain', 'email' => 'p@p.p', 'password' => 'x']);
        Sanctum::actingAs($user);

        $this->getJson('/api/admin/telegram-users')->assertStatus(403);
    }

    public function test_admin_can_list_and_approve(): void
    {
        $admin = $this->makeAdmin();
        Sanctum::actingAs($admin);

        $yard = Yard::create(['name' => 'Y', 'strict_mode' => false, 'weighing_required' => false]);
        $chat = TelegramBotChat::create([
            'chat_id' => '8001',
            'display_full_name' => 'X',
            'display_phone' => '+770',
            'approval_status' => TelegramBotChat::APPROVAL_AWAITING_REVIEW,
        ]);

        $this->getJson('/api/admin/telegram-users')->assertOk()->assertJsonPath('data.data.0.chat_id', '8001');

        $this->postJson("/api/admin/telegram-users/{$chat->id}/approve", ['yard_ids' => [$yard->id]])
            ->assertOk()
            ->assertJsonPath('data.approval_status', TelegramBotChat::APPROVAL_APPROVED);
    }

    public function test_admin_can_reject(): void
    {
        $admin = $this->makeAdmin();
        Sanctum::actingAs($admin);

        $chat = TelegramBotChat::create([
            'chat_id' => '8002',
            'approval_status' => TelegramBotChat::APPROVAL_AWAITING_REVIEW,
        ]);

        $this->postJson("/api/admin/telegram-users/{$chat->id}/reject", ['reason' => 'Не наш подрядчик'])
            ->assertOk()
            ->assertJsonPath('data.approval_status', TelegramBotChat::APPROVAL_REJECTED)
            ->assertJsonPath('data.rejection_reason', 'Не наш подрядчик');
    }

    private function makeAdmin(): User
    {
        $admin = User::create(['name' => 'Admin', 'login' => 'admintest', 'email' => 'admin@t.t', 'password' => 'x']);
        $role = Role::firstOrCreate(['name' => 'Admin'], ['level' => 100]);
        $role->permissions()->sync(Permission::pluck('id'));
        $admin->roles()->attach($role->id);

        return $admin;
    }
}
