<?php

namespace Tests\Feature\Telegram;

use App\Models\GuestVisit;
use App\Models\GuestVisitVehicle;
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
            'comment' => 'Тестовый визит',
            'vehicles' => [],
        ])->assertStatus(422);
    }

    public function test_author_can_update_own_visit_from_miniapp(): void
    {
        $initData = $this->makeInitData(['id' => 7004, 'first_name' => 'Owner']);
        $yard = Yard::create(['name' => 'Main', 'strict_mode' => false, 'weighing_required' => false]);

        $user = User::create([
            'name' => 'Visit Owner',
            'login' => 'tg_7004',
            'email' => 'tg7004@example.com',
            'password' => 'x',
            'phone' => '+77000007004',
        ]);

        $chat = TelegramBotChat::create([
            'chat_id' => '7004',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $user->id,
            'display_full_name' => 'Visit Owner',
            'display_phone' => '+77000007004',
        ]);
        $chat->yards()->sync([$yard->id]);

        $visit = GuestVisit::create([
            'yard_id' => $yard->id,
            'guest_full_name' => 'Старое имя',
            'guest_phone' => '+77007770000',
            'guest_position' => 'Стажёр',
            'guest_company_name' => 'Старая компания',
            'host_name' => $user->name,
            'host_phone' => $user->phone,
            'visit_starts_at' => now()->addHour(),
            'visit_ends_at' => null,
            'permit_kind' => GuestVisit::PERMIT_KIND_ONE_TIME,
            'workflow_status' => GuestVisit::STATUS_ACTIVE,
            'has_vehicle' => true,
            'comment' => 'Старый комментарий',
            'source' => GuestVisit::SOURCE_TELEGRAM_BOT,
            'created_by_user_id' => $user->id,
        ]);

        $vehicle = GuestVisitVehicle::create([
            'guest_visit_id' => $visit->id,
            'plate_number' => '123AAA',
        ]);

        $startsAt = now()->addHours(2)->toDateTimeString();
        $endsAt = now()->addHours(8)->toDateTimeString();

        $this->postJson('/api/telegram/miniapp/visits/update', [
            'init_data' => $initData,
            'id' => $visit->id,
            'yard_id' => $yard->id,
            'guest_full_name' => 'Новое имя',
            'guest_phone' => '+77009998877',
            'guest_position' => 'Инженер',
            'guest_company_name' => 'Новая компания',
            'guest_iin' => '990101300000',
            'visit_starts_at' => $startsAt,
            'visit_ends_at' => $endsAt,
            'permit_kind' => GuestVisit::PERMIT_KIND_MULTI_TIME,
            'comment' => 'Обновленная цель визита',
            'vehicles' => [
                [
                    'id' => $vehicle->id,
                    'plate_number' => '456BBB',
                ],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('data.guest_full_name', 'Новое имя')
            ->assertJsonPath('data.permit_kind', GuestVisit::PERMIT_KIND_MULTI_TIME)
            ->assertJsonPath('data.comment', 'Обновленная цель визита');

        $this->assertDatabaseHas('guest_visits', [
            'id' => $visit->id,
            'guest_full_name' => 'Новое имя',
            'guest_phone' => '+77009998877',
            'guest_position' => 'Инженер',
            'guest_company_name' => 'Новая компания',
            'guest_iin' => '990101300000',
            'permit_kind' => GuestVisit::PERMIT_KIND_MULTI_TIME,
            'comment' => 'Обновленная цель визита',
        ]);

        $this->assertDatabaseHas('guest_visit_vehicles', [
            'id' => $vehicle->id,
            'plate_number' => '456BBB',
        ]);
    }

    public function test_author_can_cancel_own_visit_from_miniapp(): void
    {
        $initData = $this->makeInitData(['id' => 7005, 'first_name' => 'Owner']);
        $yard = Yard::create(['name' => 'Main', 'strict_mode' => false, 'weighing_required' => false]);

        $user = User::create([
            'name' => 'Visit Cancel Owner',
            'login' => 'tg_7005',
            'email' => 'tg7005@example.com',
            'password' => 'x',
            'phone' => '+77000007005',
        ]);

        $chat = TelegramBotChat::create([
            'chat_id' => '7005',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $user->id,
            'display_full_name' => 'Visit Cancel Owner',
            'display_phone' => '+77000007005',
        ]);
        $chat->yards()->sync([$yard->id]);

        $visit = GuestVisit::create([
            'yard_id' => $yard->id,
            'guest_full_name' => 'Гость для отмены',
            'guest_phone' => '+77001112233',
            'guest_position' => 'Менеджер',
            'host_name' => $user->name,
            'host_phone' => $user->phone,
            'visit_starts_at' => now()->addHour(),
            'permit_kind' => GuestVisit::PERMIT_KIND_ONE_TIME,
            'workflow_status' => GuestVisit::STATUS_ACTIVE,
            'has_vehicle' => false,
            'comment' => 'Нужно отменить',
            'source' => GuestVisit::SOURCE_TELEGRAM_BOT,
            'created_by_user_id' => $user->id,
        ]);

        $this->postJson('/api/telegram/miniapp/visits/cancel', [
            'init_data' => $initData,
            'id' => $visit->id,
        ])
            ->assertOk()
            ->assertJsonPath('data.workflow_status', GuestVisit::STATUS_CANCELED);

        $this->assertDatabaseHas('guest_visits', [
            'id' => $visit->id,
            'workflow_status' => GuestVisit::STATUS_CANCELED,
            'cancelled_by_user_id' => $user->id,
        ]);
    }

    public function test_miniapp_cannot_update_foreign_visit(): void
    {
        $ownerYard = Yard::create(['name' => 'Main', 'strict_mode' => false, 'weighing_required' => false]);
        $owner = User::create([
            'name' => 'Visit Owner',
            'login' => 'tg_owner',
            'email' => 'tgowner@example.com',
            'password' => 'x',
            'phone' => '+77000007111',
        ]);

        $visit = GuestVisit::create([
            'yard_id' => $ownerYard->id,
            'guest_full_name' => 'Чужой визит',
            'guest_phone' => '+77001112233',
            'guest_position' => 'Инженер',
            'host_name' => $owner->name,
            'host_phone' => $owner->phone,
            'visit_starts_at' => now()->addHour(),
            'permit_kind' => GuestVisit::PERMIT_KIND_ONE_TIME,
            'workflow_status' => GuestVisit::STATUS_ACTIVE,
            'has_vehicle' => false,
            'comment' => 'Чужой визит',
            'source' => GuestVisit::SOURCE_TELEGRAM_BOT,
            'created_by_user_id' => $owner->id,
        ]);

        $attackerInitData = $this->makeInitData(['id' => 7006, 'first_name' => 'Other']);
        $attacker = User::create([
            'name' => 'Other User',
            'login' => 'tg_7006',
            'email' => 'tg7006@example.com',
            'password' => 'x',
            'phone' => '+77000007006',
        ]);

        $attackerChat = TelegramBotChat::create([
            'chat_id' => '7006',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $attacker->id,
            'display_full_name' => 'Other User',
            'display_phone' => '+77000007006',
        ]);
        $attackerChat->yards()->sync([$ownerYard->id]);

        $this->postJson('/api/telegram/miniapp/visits/update', [
            'init_data' => $attackerInitData,
            'id' => $visit->id,
            'yard_id' => $ownerYard->id,
            'guest_full_name' => 'Попытка изменения',
            'guest_phone' => '+77009998877',
            'guest_position' => 'Менеджер',
            'visit_starts_at' => now()->addHours(2)->toDateTimeString(),
            'permit_kind' => GuestVisit::PERMIT_KIND_ONE_TIME,
            'comment' => 'Не должно пройти',
            'vehicles' => [],
        ])->assertStatus(404);
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
