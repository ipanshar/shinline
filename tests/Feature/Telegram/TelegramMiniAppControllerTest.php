<?php

namespace Tests\Feature\Telegram;

use App\Models\GuestVisit;
use App\Models\GuestVisitVehicle;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SpectechRequest;
use App\Models\TelegramBotChat;
use App\Models\Truck;
use App\Models\TruckCategory;
use App\Models\UtilizationRequest;
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

    public function test_approved_user_can_create_spectech_request_from_miniapp(): void
    {
        $initData = $this->makeInitData(['id' => 7007, 'first_name' => 'Spectech']);

        $category = TruckCategory::query()->create(['name' => 'Спец техника']);
        $truck = Truck::query()->create([
            'name' => 'Автокран',
            'plate_number' => '123ABC01',
            'truck_category_id' => $category->id,
        ]);

        $user = User::create([
            'name' => 'TG Spectech User',
            'login' => 'tg_7007',
            'email' => 'tg7007@example.com',
            'password' => 'x',
            'phone' => '+77000007007',
        ]);

        TelegramBotChat::create([
            'chat_id' => '7007',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $user->id,
            'display_full_name' => 'TG Spectech User',
            'display_phone' => '+77000007007',
        ]);

        $this->postJson('/api/telegram/miniapp/spectech/requests', [
            'init_data' => $initData,
            'truck_id' => $truck->id,
            'driver_name' => 'Тестовый водитель',
            'requested_start' => now()->addHour()->toDateTimeString(),
            'requested_end' => now()->addDay()->toDateTimeString(),
            'end_date' => now()->addDay()->toDateString(),
            'terminal' => 'T1',
            'zone' => 'Зона A',
            'gate' => 'G-1',
            'address' => 'Терминал T1, Зона A, Гейт G-1',
            'comment' => 'Нужно на завтра',
            'photos' => [],
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'new')
            ->assertJsonPath('data.equipment_name', 'Автокран');

        $this->assertDatabaseHas('spectech_requests', [
            'user_id' => $user->id,
            'truck_id' => $truck->id,
            'terminal' => 'T1',
            'zone' => 'Зона A',
            'status' => 'new',
        ]);
    }

    public function test_spectech_requests_endpoint_returns_only_current_user_requests(): void
    {
        $category = TruckCategory::query()->create(['name' => 'Спец техника']);
        $truck = Truck::query()->create([
            'name' => 'Манипулятор',
            'plate_number' => '456XYZ01',
            'truck_category_id' => $category->id,
        ]);

        $owner = User::create([
            'name' => 'TG Owner',
            'login' => 'tg_7008',
            'email' => 'tg7008@example.com',
            'password' => 'x',
            'phone' => '+77000007008',
        ]);

        $other = User::create([
            'name' => 'TG Other',
            'login' => 'tg_7009',
            'email' => 'tg7009@example.com',
            'password' => 'x',
            'phone' => '+77000007009',
        ]);

        TelegramBotChat::create([
            'chat_id' => '7008',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $owner->id,
            'display_full_name' => 'TG Owner',
            'display_phone' => '+77000007008',
        ]);

        TelegramBotChat::create([
            'chat_id' => '7009',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $other->id,
            'display_full_name' => 'TG Other',
            'display_phone' => '+77000007009',
        ]);

        \App\Models\SpectechRequest::query()->create([
            'user_id' => $owner->id,
            'truck_id' => $truck->id,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addDay()->toDateString(),
            'terminal' => 'T1',
            'zone' => 'A',
            'gate' => '1',
            'address' => 'Owner address',
            'status' => 'new',
            'timeline' => [],
        ]);

        \App\Models\SpectechRequest::query()->create([
            'user_id' => $other->id,
            'truck_id' => $truck->id,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addDay()->toDateString(),
            'terminal' => 'T2',
            'zone' => 'B',
            'gate' => '2',
            'address' => 'Other address',
            'status' => 'new',
            'timeline' => [],
        ]);

        $initData = $this->makeInitData(['id' => 7008, 'first_name' => 'Owner']);

        $response = $this->getJson('/api/telegram/miniapp/spectech/requests?init_data='.urlencode($initData));
        $response->assertOk();

        $items = $response->json('data');
        $this->assertCount(1, $items);
        $this->assertSame('Owner address', $items[0]['address']);
    }

    public function test_create_spectech_request_saves_driver_name_and_photos(): void
    {
        $initData = $this->makeInitData(['id' => 7010, 'first_name' => 'Owner']);

        $user = User::create([
            'name' => 'Spectech Owner',
            'login' => 'tg_7010',
            'email' => 'tg7010@example.com',
            'password' => 'x',
            'phone' => '+77000007010',
        ]);

        TelegramBotChat::create([
            'chat_id' => '7010',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $user->id,
            'display_full_name' => 'Spectech Owner',
            'display_phone' => '+77000007010',
        ]);

        $truck = Truck::create([
            'name' => 'Машина вывоза',
            'plate_number' => 'A111AA777',
        ]);

        $photo = $this->tinyPngDataUrl();

        $this->postJson('/api/telegram/miniapp/spectech/requests', [
            'init_data' => $initData,
            'truck_id' => $truck->id,
            'driver_name' => 'Иван Петров',
            'requested_start' => now()->addHour()->toIso8601String(),
            'requested_end' => now()->addHours(3)->toIso8601String(),
            'terminal' => 'T1',
            'zone' => 'Склад утилизации',
            'gate' => 'G1',
            'address' => 'Ул. Примерная, 1',
            'comment' => 'Старые запчасти',
            'photos' => [$photo, $photo, $photo, $photo, $photo],
        ])
            ->assertCreated()
            ->assertJsonPath('data.driver_name', 'Иван Петров')
            ->assertJsonCount(5, 'data.photo_urls');

        $this->assertDatabaseHas('spectech_requests', [
            'user_id' => $user->id,
            'truck_id' => $truck->id,
            'driver_name' => 'Иван Петров',
            'terminal' => 'T1',
            'zone' => 'Склад утилизации',
            'comment' => 'Старые запчасти',
        ]);

        $request = SpectechRequest::query()->latest('id')->first();
        $this->assertNotNull($request);
        $this->assertCount(5, $request->photos ?? []);
    }

    public function test_create_spectech_request_rejects_more_than_five_photos(): void
    {
        $initData = $this->makeInitData(['id' => 7011, 'first_name' => 'Owner']);

        $user = User::create([
            'name' => 'Spectech Owner 2',
            'login' => 'tg_7011',
            'email' => 'tg7011@example.com',
            'password' => 'x',
            'phone' => '+77000007011',
        ]);

        TelegramBotChat::create([
            'chat_id' => '7011',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $user->id,
            'display_full_name' => 'Spectech Owner 2',
            'display_phone' => '+77000007011',
        ]);

        $truck = Truck::create([
            'name' => 'Машина вывоза 2',
            'plate_number' => 'B222BB777',
        ]);

        $photo = $this->tinyPngDataUrl();

        $this->postJson('/api/telegram/miniapp/spectech/requests', [
            'init_data' => $initData,
            'truck_id' => $truck->id,
            'driver_name' => 'Иван Петров',
            'requested_start' => now()->addHour()->toIso8601String(),
            'requested_end' => now()->addHours(3)->toIso8601String(),
            'terminal' => 'T1',
            'zone' => 'Склад утилизации',
            'address' => 'Ул. Примерная, 1',
            'photos' => [$photo, $photo, $photo, $photo, $photo, $photo],
        ])->assertStatus(422);
    }

    public function test_create_utilization_request_uses_plate_number_and_photo(): void
    {
        $initData = $this->makeInitData(['id' => 7012, 'first_name' => 'Util']);

        $user = User::create([
            'name' => 'Util User',
            'login' => 'tg_7012',
            'email' => 'tg7012@example.com',
            'password' => 'x',
            'phone' => '+77000007012',
        ]);

        TelegramBotChat::create([
            'chat_id' => '7012',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $user->id,
            'display_full_name' => 'Util User',
            'display_phone' => '+77000007012',
        ]);

        $truck = Truck::create([
            'name' => 'Из базы',
            'plate_number' => 'A111AA777',
        ]);

        $photo = $this->tinyPngDataUrl();

        $this->postJson('/api/telegram/miniapp/utilization/requests', [
            'init_data' => $initData,
            'plate_number' => 'A111AA777',
            'driver_name' => 'Иван Петров',
            'comment' => 'Срочный вывоз',
            'photos' => [$photo],
        ])
            ->assertCreated()
            ->assertJsonPath('data.plate_number', 'A111AA777')
            ->assertJsonPath('data.status', UtilizationRequest::STATUS_REVIEWING)
            ->assertJsonPath('data.driver_name', 'Иван Петров')
            ->assertJsonCount(1, 'data.photo_urls')
            ->assertJsonPath('data.photo_urls.0', fn (string $photoUrl) => str_starts_with($photoUrl, '/storage/utilization/'));

        $request = UtilizationRequest::query()->latest('id')->first();

        $this->assertNotNull($request);
        $this->assertSame($user->id, $request->user_id);
        $this->assertSame('Иван Петров', $request->driver_name);
        $this->assertSame($truck->id, $request->truck_id);
        $this->assertSame($request->requested_start?->toDateString(), $request->requested_end?->toDateString());
        $this->assertSame('miniapp', $request->terminal);
        $this->assertSame(UtilizationRequest::STATUS_REVIEWING, $request->status);

        $this->assertSame(1, Truck::query()->where('plate_number', 'A111AA777')->count());
    }

    public function test_create_utilization_request_requires_photo(): void
    {
        $initData = $this->makeInitData(['id' => 7013, 'first_name' => 'Util']);

        $user = User::create([
            'name' => 'Util User 2',
            'login' => 'tg_7013',
            'email' => 'tg7013@example.com',
            'password' => 'x',
            'phone' => '+77000007013',
        ]);

        TelegramBotChat::create([
            'chat_id' => '7013',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $user->id,
            'display_full_name' => 'Util User 2',
            'display_phone' => '+77000007013',
        ]);

        $this->postJson('/api/telegram/miniapp/utilization/requests', [
            'init_data' => $initData,
            'plate_number' => 'B222BB777',
            'driver_name' => 'Павел Сидоров',
            'comment' => 'Без фото нельзя',
            'photos' => [],
        ])->assertStatus(422);
    }

    public function test_telegram_miniapp_cors_allows_patch_for_operator_status_updates(): void
    {
        $response = $this->options('/api/telegram/miniapp/operator/spectech/requests/1/status', [], [
            'Origin' => 'https://web.telegram.org',
            'Access-Control-Request-Method' => 'PATCH',
            'Access-Control-Request-Headers' => 'Content-Type, X-Telegram-Init-Data, X-Requested-With',
        ]);

        $response
            ->assertNoContent()
            ->assertHeader('Access-Control-Allow-Origin', '*');

        $this->assertStringContainsString('PATCH', (string) $response->headers->get('Access-Control-Allow-Methods', ''));
        $this->assertStringContainsString('X-Telegram-Init-Data', (string) $response->headers->get('Access-Control-Allow-Headers', ''));
    }

    public function test_create_utilization_request_creates_user_for_unlinked_chat(): void
    {
        $initData = $this->makeInitData([
            'id' => 7014,
            'first_name' => 'Util',
            'last_name' => 'Fallback',
        ]);

        $chat = TelegramBotChat::create([
            'chat_id' => '7014',
            'approval_status' => TelegramBotChat::APPROVAL_NONE,
            'display_full_name' => 'Util Fallback',
            'display_phone' => '+77000007014',
        ]);

        Truck::create([
            'name' => 'Машина из базы',
            'plate_number' => 'C333CC777',
        ]);

        $photo = $this->tinyPngDataUrl();

        $this->postJson('/api/telegram/miniapp/utilization/requests', [
            'init_data' => $initData,
            'plate_number' => 'C333CC777',
            'driver_name' => 'Сергей Тестов',
            'photos' => [$photo],
        ])
            ->assertCreated()
            ->assertJsonPath('data.plate_number', 'C333CC777')
            ->assertJsonPath('data.driver_name', 'Сергей Тестов');

        $chat->refresh();
        $this->assertNotNull($chat->user_id);

        $this->assertDatabaseHas('users', [
            'id' => $chat->user_id,
            'login' => 'tg_7014',
            'name' => 'Util Fallback',
            'phone' => '+77000007014',
        ]);

        $this->assertDatabaseHas('utilization_requests', [
            'user_id' => $chat->user_id,
            'driver_name' => 'Сергей Тестов',
        ]);
    }

    public function test_operator_with_manage_permission_can_access_spectech_operator_endpoints(): void
    {
        $operator = User::create([
            'name' => 'Miniapp Operator',
            'login' => 'tg_7016',
            'email' => 'tg7016@example.com',
            'password' => 'x',
            'phone' => '+77000007016',
        ]);

        $customRole = Role::query()->create([
            'name' => 'Telegram dispatcher',
            'level' => 55,
            'description' => 'Кастомная роль оператора спецтехники для Mini App',
        ]);

        $managePermission = Permission::query()->firstOrCreate(
            ['name' => 'spectech.manage'],
            ['description' => 'Управление заявками на спецтехнику', 'group' => 'spectech']
        );
        $viewPermission = Permission::query()->firstOrCreate(
            ['name' => 'spectech.view'],
            ['description' => 'Просмотр и создание заявок на спецтехнику', 'group' => 'spectech']
        );

        $customRole->permissions()->syncWithoutDetaching([$managePermission->id, $viewPermission->id]);
        $operator->roles()->syncWithoutDetaching([$customRole->id]);

        TelegramBotChat::create([
            'chat_id' => '7016',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $operator->id,
            'display_full_name' => 'Miniapp Operator',
            'display_phone' => '+77000007016',
        ]);

        $requestOwner = User::create([
            'name' => 'Request Owner',
            'login' => 'tg_request_owner',
            'email' => 'tg-request-owner@example.com',
            'password' => 'x',
            'phone' => '+77000007116',
        ]);

        $category = TruckCategory::query()->create(['name' => 'Спец техника']);
        $truck = Truck::query()->create([
            'name' => 'Автовышка',
            'plate_number' => '701OP16',
            'truck_category_id' => $category->id,
        ]);

        $request = SpectechRequest::query()->create([
            'user_id' => $requestOwner->id,
            'truck_id' => $truck->id,
            'driver_name' => 'Водитель оператора',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addDay()->toDateString(),
            'terminal' => 'T1',
            'zone' => 'A',
            'gate' => '1',
            'address' => 'Терминал 1',
            'status' => SpectechRequest::STATUS_NEW,
            'timeline' => SpectechRequest::buildInitialTimeline(),
        ]);

        $initData = $this->makeInitData(['id' => 7016, 'first_name' => 'Operator']);

        $this->postJson('/api/telegram/miniapp/session', ['init_data' => $initData])
            ->assertOk()
            ->assertJsonPath('data.can_manage_spectech', true);

        $this->getJson('/api/telegram/miniapp/operator/spectech/requests?init_data='.urlencode($initData))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $request->id);

        $this->patchJson("/api/telegram/miniapp/operator/spectech/requests/{$request->id}/status", [
            'init_data' => $initData,
            'status' => SpectechRequest::STATUS_DEPARTURE,
        ])
            ->assertOk()
            ->assertJsonPath('data.status', SpectechRequest::STATUS_DEPARTURE);
    }

    public function test_non_operator_cannot_access_spectech_operator_endpoints(): void
    {
        $user = User::create([
            'name' => 'Regular Telegram User',
            'login' => 'tg_7017',
            'email' => 'tg7017@example.com',
            'password' => 'x',
            'phone' => '+77000007017',
        ]);

        TelegramBotChat::create([
            'chat_id' => '7017',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $user->id,
            'display_full_name' => 'Regular Telegram User',
            'display_phone' => '+77000007017',
        ]);

        $category = TruckCategory::query()->create(['name' => 'Спец техника']);
        $truck = Truck::query()->create([
            'name' => 'Экскаватор',
            'plate_number' => '999NO01',
            'truck_category_id' => $category->id,
        ]);

        $request = SpectechRequest::query()->create([
            'user_id' => $user->id,
            'truck_id' => $truck->id,
            'driver_name' => 'Обычный водитель',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addDay()->toDateString(),
            'terminal' => 'T1',
            'zone' => 'A',
            'gate' => '1',
            'address' => 'Обычный адрес',
            'status' => SpectechRequest::STATUS_NEW,
            'timeline' => SpectechRequest::buildInitialTimeline(),
        ]);

        $initData = $this->makeInitData(['id' => 7017, 'first_name' => 'Regular']);

        $this->getJson('/api/telegram/miniapp/operator/spectech/requests?init_data='.urlencode($initData))
            ->assertStatus(403);

        $this->patchJson("/api/telegram/miniapp/operator/spectech/requests/{$request->id}/status", [
            'init_data' => $initData,
            'status' => SpectechRequest::STATUS_DEPARTURE,
        ])->assertStatus(403);
    }

    public function test_create_utilization_request_requires_repeated_confirmation_for_unknown_plate(): void
    {
        $initData = $this->makeInitData(['id' => 7015, 'first_name' => 'Util']);

        $user = User::create([
            'name' => 'Util User 3',
            'login' => 'tg_7015',
            'email' => 'tg7015@example.com',
            'password' => 'x',
            'phone' => '+77000007015',
        ]);

        TelegramBotChat::create([
            'chat_id' => '7015',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $user->id,
            'display_full_name' => 'Util User 3',
            'display_phone' => '+77000007015',
        ]);

        $photo = $this->tinyPngDataUrl();

        $this->postJson('/api/telegram/miniapp/utilization/requests', [
            'init_data' => $initData,
            'plate_number' => 'D444DD777',
            'driver_name' => 'Тест Подтверждение',
            'photos' => [$photo],
        ])->assertStatus(422)->assertJsonValidationErrors('plate_number');

        $this->postJson('/api/telegram/miniapp/utilization/requests', [
            'init_data' => $initData,
            'plate_number' => 'D444DD777',
            'driver_name' => 'Тест Подтверждение',
            'photos' => [$photo],
            'create_truck_confirmation' => 1,
        ])->assertStatus(422)->assertJsonValidationErrors('plate_number');

        $this->postJson('/api/telegram/miniapp/utilization/requests', [
            'init_data' => $initData,
            'plate_number' => 'D444DD777',
            'driver_name' => 'Тест Подтверждение',
            'photos' => [$photo],
            'create_truck_confirmation' => 2,
        ])
            ->assertCreated()
            ->assertJsonPath('data.plate_number', 'D444DD777')
            ->assertJsonPath('data.status', UtilizationRequest::STATUS_REVIEWING);

        $this->assertDatabaseHas('trucks', [
            'plate_number' => 'D444DD777',
        ]);
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
        $check = collect($params)->map(fn ($v, $k) => $k.'='.$v)->implode("\n");
        $secret = hash_hmac('sha256', $this->token, 'WebAppData', true);
        $params['hash'] = hash_hmac('sha256', $check, $secret);

        return http_build_query($params);
    }

    private function tinyPngDataUrl(): string
    {
        return 'data:image/png;base64,'.base64_encode(hex2bin('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c636000000200015d0b2a0b0000000049454e44ae426082'));
    }
}
