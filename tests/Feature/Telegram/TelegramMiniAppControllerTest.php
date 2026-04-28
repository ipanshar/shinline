<?php

namespace Tests\Feature\Telegram;

use App\Models\TelegramBotChat;
use App\Models\User;
use App\Models\Yard;
use App\Services\TelegramMessagingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class TelegramMiniAppControllerTest extends TestCase
{
    use RefreshDatabase;

    private string $token = '999:test-bot-token';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(\Database\Seeders\PermissionsSeeder::class);
        config()->set('telegram.bots.mybot.token', $this->token);
        config()->set('telegram.init_data_ttl', 86400);
        config()->set('telegram.admin_chat_ids', []);

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

    public function test_session_returns_401_without_init_data(): void
    {
        $this->postJson('/api/telegram/miniapp/session', ['init_data' => ''])
            ->assertStatus(401);
    }

    public function test_session_returns_payload_for_new_user(): void
    {
        $initData = $this->makeInitData(['id' => 7001, 'first_name' => 'Test', 'username' => 'tst']);

        $this->postJson('/api/telegram/miniapp/session', ['init_data' => $initData])
            ->assertOk()
            ->assertJsonPath('data.approval_status', TelegramBotChat::APPROVAL_NONE)
            ->assertJsonPath('data.chat_id', '7001');
    }

    public function test_register_moves_to_awaiting_review(): void
    {
        $initData = $this->makeInitData(['id' => 7002, 'first_name' => 'A']);

        $this->postJson('/api/telegram/miniapp/register', [
            'init_data' => $initData,
            'full_name' => 'Иван Иванов',
            'phone' => '+77001112233',
        ])
            ->assertOk()
            ->assertJsonPath('data.approval_status', TelegramBotChat::APPROVAL_AWAITING_REVIEW)
            ->assertJsonPath('data.profile.full_name', 'Иван Иванов');
    }

    public function test_create_visit_rejects_disallowed_yard(): void
    {
        $initData = $this->makeInitData(['id' => 7003, 'first_name' => 'A']);

        $allowedYard = Yard::create(['name' => 'Allowed', 'strict_mode' => false, 'weighing_required' => false]);
        $otherYard = Yard::create(['name' => 'Other', 'strict_mode' => false, 'weighing_required' => false]);

        $user = User::create([
            'name' => 'Approved TG',
            'login' => 'tg_7003',
            'email' => 'tg7003@example.com',
            'password' => 'x',
            'phone' => '+77000007003',
        ]);

        $chat = TelegramBotChat::create([
            'chat_id' => '7003',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $user->id,
            'display_full_name' => 'Approved TG',
            'display_phone' => '+77000007003',
        ]);

        $chat->yards()->sync([$allowedYard->id]);

        $this->postJson('/api/telegram/miniapp/visits', [
            'init_data' => $initData,
            'yard_id' => $otherYard->id,
            'guest_full_name' => 'Гость',
            'guest_phone' => '+77001234567',
            'guest_position' => 'Сотрудник',
            'visit_starts_at' => now()->addHour()->toDateTimeString(),
            'permit_kind' => 'one_time',
            'vehicles' => [],
        ])->assertStatus(422);
    }

    private function makeInitData(array $user, ?int $authDate = null): string
    {
        $authDate = $authDate ?? time();
        $params = [
            'auth_date' => (string) $authDate,
            'query_id' => 'AAH',
            'user' => json_encode($user, JSON_UNESCAPED_UNICODE),
        ];
        ksort($params);
        $check = collect($params)->map(fn ($v, $k) => $k . '=' . $v)->implode("\n");
        $secret = hash_hmac('sha256', $this->token, 'WebAppData', true);
        $params['hash'] = hash_hmac('sha256', $check, $secret);

        return http_build_query($params);
    }
}
