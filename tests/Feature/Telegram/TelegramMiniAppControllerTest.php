<?php

namespace Tests\Feature\Telegram;

use App\Models\GuestVisit;
use App\Models\GuestVisitVehicle;
use App\Models\Permission;
use App\Models\Role;
use App\Models\SpectechRequest;
use App\Models\SpectechSchedule;
use App\Models\TelegramBotChat;
use App\Models\Truck;
use App\Models\TruckCategory;
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

    public function test_session_includes_spectech_operator_capability(): void
    {
        $initData = $this->makeInitData(['id' => 7012, 'first_name' => 'Operator']);

        $user = User::create([
            'name' => 'TG Spectech Operator',
            'login' => 'tg_7012',
            'email' => 'tg7012@example.com',
            'password' => 'x',
            'phone' => '+77000007012',
        ]);

        $this->grantSpectechManagePermission($user);

        TelegramBotChat::create([
            'chat_id' => '7012',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $user->id,
            'display_full_name' => 'TG Spectech Operator',
            'display_phone' => '+77000007012',
        ]);

        $this->postJson('/api/telegram/miniapp/session', ['init_data' => $initData])
            ->assertOk()
            ->assertJsonPath('data.capabilities.can_manage_spectech', true);
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
        $requestedStart = now()->addHour()->startOfHour();
        $requestedEnd = (clone $requestedStart)->addHours(4);

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
            'requested_start' => $requestedStart->toIso8601String(),
            'requested_end' => $requestedEnd->toIso8601String(),
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

        $this->assertDatabaseHas('spectech_schedules', [
            'user_id' => $user->id,
            'truck_id' => $truck->id,
            'status' => SpectechSchedule::STATUS_PENDING,
            'address' => 'Терминал T1, Зона A, Гейт G-1',
        ]);
    }

    public function test_busy_spectech_is_rejected_in_miniapp(): void
    {
        $initData = $this->makeInitData(['id' => 7010, 'first_name' => 'Busy']);
        $requestedStart = now()->addHours(2)->startOfHour();
        $requestedEnd = (clone $requestedStart)->addHours(3);

        $category = TruckCategory::query()->create(['name' => 'Спец техника']);
        $truck = Truck::query()->create([
            'name' => 'Автокран 1',
            'plate_number' => '777ABC01',
            'truck_category_id' => $category->id,
        ]);

        $user = User::create([
            'name' => 'TG Busy User',
            'login' => 'tg_7010',
            'email' => 'tg7010@example.com',
            'password' => 'x',
            'phone' => '+77000007010',
        ]);

        TelegramBotChat::create([
            'chat_id' => '7010',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $user->id,
            'display_full_name' => 'TG Busy User',
            'display_phone' => '+77000007010',
        ]);

        SpectechSchedule::query()->create([
            'user_id' => $user->id,
            'truck_id' => $truck->id,
            'equipment_type_key' => 'Автокран',
            'equipment_type_label' => 'Автокран',
            'assigned_truck_name' => 'Автокран 1 (777ABC01)',
            'scheduled_start' => $requestedStart->copy()->subHour(),
            'scheduled_end' => $requestedEnd->copy()->addHour(),
            'purpose' => 'Уже занято',
            'address' => 'Территория 1',
            'status' => SpectechSchedule::STATUS_PENDING,
        ]);

        $this->postJson('/api/telegram/miniapp/spectech/requests', [
            'init_data' => $initData,
            'truck_id' => $truck->id,
            'requested_start' => $requestedStart->toIso8601String(),
            'requested_end' => $requestedEnd->toIso8601String(),
            'terminal' => 'T1',
            'zone' => 'Зона A',
            'gate' => 'G-1',
            'address' => 'Терминал T1, Зона A, Гейт G-1',
            'comment' => 'Нужно срочно',
            'photos' => [],
        ])
            ->assertStatus(409)
            ->assertJsonPath('message', 'Выбранная техника занята на указанный период')
            ->assertJsonPath('conflict', true);

        $this->assertDatabaseCount('spectech_requests', 0);
    }

    public function test_spectech_availability_endpoint_returns_free_alternative_for_miniapp(): void
    {
        $initData = $this->makeInitData(['id' => 7011, 'first_name' => 'Alternative']);
        $requestedStart = now()->addHours(2)->startOfHour();
        $requestedEnd = (clone $requestedStart)->addHours(3);

        $category = TruckCategory::query()->create(['name' => 'Спец техника']);
        $busyTruck = Truck::query()->create([
            'name' => 'Автокран 1',
            'plate_number' => '111ABC01',
            'truck_category_id' => $category->id,
        ]);
        $freeTruck = Truck::query()->create([
            'name' => 'Автокран 2',
            'plate_number' => '222ABC01',
            'truck_category_id' => $category->id,
        ]);

        $user = User::create([
            'name' => 'TG Availability User',
            'login' => 'tg_7011',
            'email' => 'tg7011@example.com',
            'password' => 'x',
            'phone' => '+77000007011',
        ]);

        TelegramBotChat::create([
            'chat_id' => '7011',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $user->id,
            'display_full_name' => 'TG Availability User',
            'display_phone' => '+77000007011',
        ]);

        SpectechSchedule::query()->create([
            'user_id' => $user->id,
            'truck_id' => $busyTruck->id,
            'equipment_type_key' => 'Автокран',
            'equipment_type_label' => 'Автокран',
            'assigned_truck_name' => 'Автокран 1 (111ABC01)',
            'scheduled_start' => $requestedStart->copy()->subHour(),
            'scheduled_end' => $requestedEnd->copy()->addHour(),
            'purpose' => 'Уже занято',
            'address' => 'Территория 1',
            'status' => SpectechSchedule::STATUS_PENDING,
        ]);

        $this->getJson('/api/telegram/miniapp/spectech/check-availability?'.http_build_query([
            'init_data' => $initData,
            'truck_id' => $busyTruck->id,
            'requested_start' => $requestedStart->format('Y-m-d H:i'),
            'requested_end' => $requestedEnd->format('Y-m-d H:i'),
        ]))
            ->assertOk()
            ->assertJsonPath('available', false)
            ->assertJsonPath('message', 'Выбранная техника занята на указанный период')
            ->assertJsonPath('free_alternative.id', $freeTruck->id)
            ->assertJsonPath('free_alternative.name', 'Автокран 2');
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

    public function test_operator_can_view_all_spectech_requests_and_update_status_from_miniapp(): void
    {
        $category = TruckCategory::query()->create(['name' => 'Спец техника']);
        $truck = Truck::query()->create([
            'name' => 'Манипулятор',
            'plate_number' => '999XYZ01',
            'truck_category_id' => $category->id,
        ]);

        $operator = User::create([
            'name' => 'TG Spectech Operator',
            'login' => 'tg_7013',
            'email' => 'tg7013@example.com',
            'password' => 'x',
            'phone' => '+77000007013',
        ]);
        $this->grantSpectechManagePermission($operator);

        TelegramBotChat::create([
            'chat_id' => '7013',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $operator->id,
            'display_full_name' => 'TG Spectech Operator',
            'display_phone' => '+77000007013',
        ]);

        $requestAuthor = User::create([
            'name' => 'Request Author',
            'login' => 'author_7014',
            'email' => 'author7014@example.com',
            'password' => 'x',
            'phone' => '+77000007014',
        ]);

        $firstRequest = SpectechRequest::query()->create([
            'user_id' => $requestAuthor->id,
            'truck_id' => $truck->id,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addDay()->toDateString(),
            'terminal' => 'T1',
            'zone' => 'Zone A',
            'address' => 'Address A',
            'status' => SpectechRequest::STATUS_NEW,
            'timeline' => SpectechRequest::buildInitialTimeline(),
        ]);

        SpectechRequest::query()->create([
            'user_id' => $requestAuthor->id,
            'truck_id' => $truck->id,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addDay()->toDateString(),
            'terminal' => 'T2',
            'zone' => 'Zone B',
            'address' => 'Address B',
            'status' => SpectechRequest::STATUS_WORK_STARTED,
            'timeline' => SpectechRequest::buildInitialTimeline(),
        ]);

        $initData = $this->makeInitData(['id' => 7013, 'first_name' => 'Operator']);

        $listResponse = $this->getJson('/api/telegram/miniapp/operator/spectech/requests?init_data='.urlencode($initData));
        $listResponse->assertOk();
        $this->assertCount(2, $listResponse->json('data'));

        $this->patchJson("/api/telegram/miniapp/operator/spectech/requests/{$firstRequest->id}/status", [
            'init_data' => $initData,
            'status' => SpectechRequest::STATUS_DEPARTURE,
        ])
            ->assertOk()
            ->assertJsonPath('data.status', SpectechRequest::STATUS_DEPARTURE);

        $this->assertSame(SpectechRequest::STATUS_DEPARTURE, $firstRequest->fresh()->status);
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

    private function grantSpectechManagePermission(User $user): void
    {
        $role = Role::query()->firstOrCreate(
            ['name' => 'Оператор спецтехники'],
            [
                'level' => 55,
                'description' => 'Управление заявками на спецтехнику через веб и Telegram Mini App',
            ]
        );
        $permission = Permission::query()->where('name', 'spectech.manage')->firstOrFail();
        $viewPermission = Permission::query()->where('name', 'spectech.view')->firstOrFail();

        $role->permissions()->syncWithoutDetaching([$permission->id, $viewPermission->id]);
        $user->roles()->syncWithoutDetaching([$role->id]);
    }
}
