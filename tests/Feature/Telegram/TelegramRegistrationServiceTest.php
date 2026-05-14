<?php

namespace Tests\Feature\Telegram;

use App\Models\Permission;
use App\Models\Role;
use App\Models\TelegramBotChat;
use App\Models\User;
use App\Models\Yard;
use App\Services\Telegram\TelegramRegistrationService;
use App\Services\TelegramMessagingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class TelegramRegistrationServiceTest extends TestCase
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

    public function test_register_or_update_applicant_sets_awaiting_review(): void
    {
        $service = $this->app->make(TelegramRegistrationService::class);
        $chat = TelegramBotChat::create(['chat_id' => '111', 'username' => 'a']);

        $updated = $service->registerOrUpdateApplicant($chat, 'Иван Иванов', '+77001112233');

        $this->assertSame(TelegramBotChat::APPROVAL_AWAITING_REVIEW, $updated->approval_status);
        $this->assertSame('Иван Иванов', $updated->display_full_name);
        $this->assertSame('+77001112233', $updated->display_phone);
    }

    public function test_approve_creates_user_attaches_role_and_yards(): void
    {
        $service = $this->app->make(TelegramRegistrationService::class);
        $admin = User::create(['name' => 'Admin', 'login' => 'admin', 'email' => 'a@a.a', 'password' => 'x']);
        $yard = Yard::create(['name' => 'Y1', 'strict_mode' => false, 'weighing_required' => false]);

        $chat = TelegramBotChat::create([
            'chat_id' => '222',
            'display_full_name' => 'Иван',
            'display_phone' => '+770000',
            'approval_status' => TelegramBotChat::APPROVAL_AWAITING_REVIEW,
        ]);

        $approved = $service->approve($chat, [$yard->id], $admin);

        $this->assertSame(TelegramBotChat::APPROVAL_APPROVED, $approved->approval_status);
        $this->assertNotNull($approved->approved_user_id);

        $user = User::find($approved->approved_user_id);
        $this->assertSame('tg_222', $user->login);
        $this->assertTrue((bool) $user->is_telegram_guest_inviter);
        $this->assertTrue($user->roles()->where('name', TelegramRegistrationService::ROLE_NAME)->exists());
        $this->assertCount(1, $approved->yards);
    }

    public function test_approve_is_idempotent_on_second_call(): void
    {
        $service = $this->app->make(TelegramRegistrationService::class);
        $admin = User::create(['name' => 'Admin', 'login' => 'admin2', 'email' => 'b@b.b', 'password' => 'x']);
        $y1 = Yard::create(['name' => 'A', 'strict_mode' => false, 'weighing_required' => false]);
        $y2 = Yard::create(['name' => 'B', 'strict_mode' => false, 'weighing_required' => false]);

        $chat = TelegramBotChat::create([
            'chat_id' => '333',
            'display_full_name' => 'Петр',
            'display_phone' => '+770001',
            'approval_status' => TelegramBotChat::APPROVAL_AWAITING_REVIEW,
        ]);

        $first = $service->approve($chat, [$y1->id], $admin);
        $userId = $first->approved_user_id;

        $second = $service->approve($first, [$y1->id, $y2->id], $admin);
        $this->assertSame($userId, $second->approved_user_id);
        $this->assertCount(2, $second->yards);

        $rolesCount = User::find($userId)->roles()->where('name', TelegramRegistrationService::ROLE_NAME)->count();
        $this->assertSame(1, $rolesCount);
    }

    public function test_block_unsets_inviter_flag(): void
    {
        $service = $this->app->make(TelegramRegistrationService::class);
        $admin = User::create(['name' => 'Admin', 'login' => 'admin3', 'email' => 'c@c.c', 'password' => 'x']);
        $yard = Yard::create(['name' => 'Y', 'strict_mode' => false, 'weighing_required' => false]);

        $chat = TelegramBotChat::create([
            'chat_id' => '444',
            'display_full_name' => 'X',
            'display_phone' => '+770002',
            'approval_status' => TelegramBotChat::APPROVAL_AWAITING_REVIEW,
        ]);

        $approved = $service->approve($chat, [$yard->id], $admin);
        $userId = $approved->approved_user_id;

        $blocked = $service->block($approved, $admin);

        $this->assertSame(TelegramBotChat::APPROVAL_BLOCKED, $blocked->approval_status);
        $this->assertCount(0, $blocked->yards);
        $this->assertFalse((bool) User::find($userId)->fresh()->is_telegram_guest_inviter);
    }

    public function test_unblock_returns_chat_to_review_queue(): void
    {
        $service = $this->app->make(TelegramRegistrationService::class);
        $admin = User::create(['name' => 'Admin', 'login' => 'admin4', 'email' => 'd@d.d', 'password' => 'x']);
        $yard = Yard::create(['name' => 'Y2', 'strict_mode' => false, 'weighing_required' => false]);

        $chat = TelegramBotChat::create([
            'chat_id' => '555',
            'display_full_name' => 'Y',
            'display_phone' => '+770003',
            'approval_status' => TelegramBotChat::APPROVAL_AWAITING_REVIEW,
        ]);

        $approved = $service->approve($chat, [$yard->id], $admin);
        $service->block($approved, $admin);

        $unblocked = $service->unblock($approved->fresh(), $admin);

        $this->assertSame(TelegramBotChat::APPROVAL_AWAITING_REVIEW, $unblocked->approval_status);
        $this->assertNull($unblocked->approved_at);
        $this->assertNull($unblocked->rejection_reason);
        $this->assertFalse((bool) User::find($approved->approved_user_id)->fresh()->is_telegram_guest_inviter);
    }
}
