<?php

namespace Tests\Feature\Telegram;

use App\Models\Role;
use App\Models\TelegramBotChat;
use App\Models\User;
use App\Services\TelegramMessagingService;
use Database\Seeders\PermissionsSeeder;
use Database\Seeders\ViolationCatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Mockery;
use Tests\TestCase;

class TelegramMiniAppViolationsControllerTest extends TestCase
{
    use RefreshDatabase;

    private string $token = '999:test-bot-token';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionsSeeder::class);
        $this->seed(ViolationCatalogSeeder::class);
        config()->set('telegram.bots.mybot.token', $this->token);
        config()->set('telegram.init_data_ttl', 86400);
        config()->set('telegram.admin_chat_ids', []);
        config()->set('services.faceid.base_url', 'http://127.0.0.1:8008');

        $messaging = Mockery::mock(TelegramMessagingService::class);
        $messaging->shouldReceive('sendText')->zeroOrMoreTimes();
        $messaging->shouldReceive('sendWithMiniAppButton')->zeroOrMoreTimes();
        $this->app->instance(TelegramMessagingService::class, $messaging);
        Storage::fake('public');
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_security_user_can_create_violation_with_photo_and_video(): void
    {
        $initData = $this->makeInitData(['id' => 7101, 'first_name' => 'Security']);

        $user = User::create([
            'name' => 'Security User',
            'login' => 'tg_7101',
            'email' => 'tg7101@example.com',
            'password' => 'x',
            'phone' => '+77000007101',
        ]);

        $role = Role::findByName('Служба безопасности');
        $this->assertNotNull($role);
        $user->roles()->attach($role->id);

        TelegramBotChat::create([
            'chat_id' => '7101',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $user->id,
            'display_full_name' => 'Security User',
            'display_phone' => '+77000007101',
        ]);

        $typeId = \App\Models\ViolationType::query()->where('key', 'no_ppe')->value('id');
        $this->assertNotNull($typeId);

        $response = $this->post('/api/telegram/miniapp/violations/incidents', [
            'init_data' => $initData,
            'type_id' => $typeId,
            'occurred_at' => now()->toDateTimeString(),
            'location_label' => 'Цех 1 / линия 2',
            'description' => 'Сотрудник без защитных очков.',
            'manual_full_name' => 'Иван Иванов',
            'manual_department' => 'Цех розлива',
            'manual_position' => 'Оператор линии',
            'files' => [
                UploadedFile::fake()->create('proof.jpg', 64, 'image/jpeg'),
                UploadedFile::fake()->create('clip.mp4', 128, 'video/mp4'),
            ],
        ], [
            'X-Telegram-Init-Data' => $initData,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.category_name', 'ОТиТБ')
            ->assertJsonPath('data.type_name', 'Игнорирование СИЗ')
            ->assertJsonPath('data.employee_full_name', 'Иван Иванов')
            ->assertJsonPath('data.evidence_photo_count', 1)
            ->assertJsonPath('data.evidence_video_count', 1);

        $this->assertDatabaseHas('violation_incidents', [
            'reported_by_user_id' => $user->id,
            'category_name' => 'ОТиТБ',
            'type_name' => 'Игнорирование СИЗ',
            'employee_full_name' => 'Иван Иванов',
            'recognition_status' => 'manual',
            'workflow_status' => 'pending_review',
        ]);

        $this->assertDatabaseCount('violation_evidences', 2);
        Storage::disk('public')->assertExists(\App\Models\ViolationEvidence::query()->firstOrFail()->path);
    }

    public function test_security_user_can_recognize_employee_photo_for_violation_form(): void
    {
        $initData = $this->makeInitData(['id' => 7103, 'first_name' => 'Recognizer']);
        $user = $this->approveSecurityUser('7103', 'Recognizer User', 'tg7103@example.com', '+77000007103');

        Http::fake([
            'http://127.0.0.1:8008/api/search' => Http::response([
                'matched' => true,
                'threshold' => 0.5,
                'bestMatch' => [
                    'employeeId' => 501,
                    'groupKey' => 'iin:123456789012|name:ivan_ivanov',
                    'name' => 'Иван Иванов',
                    'source' => 'sigur-photo',
                    'referenceImageUrl' => '/reference-images/test.jpg',
                    'similarity' => 0.8123,
                    'profile' => [
                        'department' => 'Цех розлива',
                        'role' => 'EMP',
                        'iin' => '123456789012',
                        'status' => 'AVAILABLE',
                        'sourceLabel' => 'Sigur photo',
                    ],
                ],
                'candidates' => [],
            ], 200),
        ]);

        $response = $this->post('/api/telegram/miniapp/violations/recognize', [
            'init_data' => $initData,
            'recognition_file' => UploadedFile::fake()->create('recognize.jpg', 64, 'image/jpeg'),
        ], [
            'X-Telegram-Init-Data' => $initData,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.matched', true)
            ->assertJsonPath('data.best_match.full_name', 'Иван Иванов')
            ->assertJsonPath('data.best_match.department', 'Цех розлива')
            ->assertJsonPath('data.best_match.position', 'EMP');

        $this->assertSame(1, Http::recorded()->count());
        $this->assertSame($user->id, TelegramBotChat::query()->where('chat_id', '7103')->value('approved_user_id'));
    }

    public function test_violation_creation_can_use_recognition_photo_to_autofill_identity(): void
    {
        $initData = $this->makeInitData(['id' => 7104, 'first_name' => 'AutoFill']);
        $user = $this->approveSecurityUser('7104', 'AutoFill User', 'tg7104@example.com', '+77000007104');
        $typeId = \App\Models\ViolationType::query()->where('key', 'no_ppe')->value('id');

        Http::fake([
            'http://127.0.0.1:8008/api/search' => Http::response([
                'matched' => true,
                'threshold' => 0.5,
                'bestMatch' => [
                    'employeeId' => 777,
                    'groupKey' => 'iin:777777777777|name:petr_petrov',
                    'name' => 'Пётр Петров',
                    'source' => 'sigur-personalimg',
                    'referenceImageUrl' => '/reference-images/petr.jpg',
                    'similarity' => 0.7642,
                    'imageHash' => 'abc123',
                    'profile' => [
                        'department' => 'Склад ГП',
                        'role' => 'EMP',
                        'iin' => '777777777777',
                        'status' => 'AVAILABLE',
                        'sourceLabel' => 'Sigur personalimg',
                    ],
                ],
                'candidates' => [],
            ], 200),
        ]);

        $response = $this->post('/api/telegram/miniapp/violations/incidents', [
            'init_data' => $initData,
            'type_id' => $typeId,
            'occurred_at' => now()->toDateTimeString(),
            'description' => 'Нарушение с автоопределением личности.',
            'recognition_file' => UploadedFile::fake()->create('employee.jpg', 64, 'image/jpeg'),
            'files' => [UploadedFile::fake()->create('proof.jpg', 64, 'image/jpeg')],
        ], [
            'X-Telegram-Init-Data' => $initData,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.employee_full_name', 'Пётр Петров')
            ->assertJsonPath('data.employee_department', 'Склад ГП')
            ->assertJsonPath('data.employee_position', 'EMP');

        $this->assertDatabaseHas('violation_incidents', [
            'reported_by_user_id' => $user->id,
            'employee_full_name' => 'Пётр Петров',
            'employee_department' => 'Склад ГП',
            'employee_position' => 'EMP',
            'recognition_status' => 'matched',
        ]);

        $this->assertDatabaseHas('violation_employees', [
            'business_key' => 'faceid:iin:777777777777|name:petr_petrov',
            'source_system' => 'sigur',
            'external_ref' => '777',
            'full_name' => 'Пётр Петров',
            'department' => 'Склад ГП',
            'position' => 'EMP',
        ]);

        $this->assertDatabaseHas('violation_recognition_attempts', [
            'service_name' => 'faceid_python',
            'status' => 'matched',
            'matched' => true,
            'recognized_full_name' => 'Пётр Петров',
        ]);
    }

    public function test_unknown_recognition_can_be_saved_for_security_manual_identification(): void
    {
        $initData = $this->makeInitData(['id' => 7105, 'first_name' => 'Unknown']);
        $user = $this->approveSecurityUser('7105', 'Unknown User', 'tg7105@example.com', '+77000007105');
        $typeId = \App\Models\ViolationType::query()->where('key', 'no_ppe')->value('id');

        Http::fake([
            'http://127.0.0.1:8008/api/search' => Http::response([
                'matched' => false,
                'threshold' => 0.5,
                'bestMatch' => [
                    'employeeId' => 999,
                    'groupKey' => 'candidate:999',
                    'name' => 'Похожий кандидат',
                    'source' => 'sigur-photo',
                    'referenceImageUrl' => '/reference-images/candidate.jpg',
                    'similarity' => 0.4321,
                    'profile' => [
                        'department' => 'Неизвестно',
                        'role' => 'EMP',
                        'sourceLabel' => 'Sigur photo',
                    ],
                ],
                'candidates' => [],
            ], 200),
        ]);

        $response = $this->post('/api/telegram/miniapp/violations/incidents', [
            'init_data' => $initData,
            'type_id' => $typeId,
            'occurred_at' => now()->toDateTimeString(),
            'description' => 'Не удалось определить личность автоматически.',
            'recognition_file' => UploadedFile::fake()->create('unknown.jpg', 64, 'image/jpeg'),
            'files' => [UploadedFile::fake()->create('proof.jpg', 64, 'image/jpeg')],
        ], [
            'X-Telegram-Init-Data' => $initData,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.employee_full_name', null)
            ->assertJsonPath('data.recognition_status', 'unknown')
            ->assertJsonPath('data.workflow_status', 'unknown_manual')
            ->assertJsonPath('data.evidence_photo_count', 1);

        $incidentId = \App\Models\ViolationIncident::query()->value('id');

        $this->assertDatabaseHas('violation_incidents', [
            'id' => $incidentId,
            'reported_by_user_id' => $user->id,
            'employee_full_name' => null,
            'recognition_status' => 'unknown',
            'workflow_status' => 'unknown_manual',
        ]);

        $this->assertDatabaseHas('violation_evidences', [
            'incident_id' => $incidentId,
            'media_role' => 'recognition_probe',
            'media_kind' => 'photo',
        ]);
    }

    public function test_non_security_user_cannot_create_violation(): void
    {
        $initData = $this->makeInitData(['id' => 7102, 'first_name' => 'NoAccess']);

        $user = User::create([
            'name' => 'Plain User',
            'login' => 'tg_7102',
            'email' => 'tg7102@example.com',
            'password' => 'x',
            'phone' => '+77000007102',
        ]);

        TelegramBotChat::create([
            'chat_id' => '7102',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $user->id,
            'display_full_name' => 'Plain User',
            'display_phone' => '+77000007102',
        ]);

        $typeId = \App\Models\ViolationType::query()->where('key', 'no_ppe')->value('id');

        $this->post('/api/telegram/miniapp/violations/incidents', [
            'init_data' => $initData,
            'type_id' => $typeId,
            'occurred_at' => now()->toDateTimeString(),
            'manual_full_name' => 'Иван Иванов',
            'files' => [UploadedFile::fake()->create('proof.jpg', 64, 'image/jpeg')],
        ], [
            'X-Telegram-Init-Data' => $initData,
        ])->assertStatus(403);
    }

    private function approveSecurityUser(string $chatId, string $name, string $email, string $phone): User
    {
        $user = User::create([
            'name' => $name,
            'login' => 'tg_' . $chatId,
            'email' => $email,
            'password' => 'x',
            'phone' => $phone,
        ]);

        $role = Role::findByName('Служба безопасности');
        $this->assertNotNull($role);
        $user->roles()->attach($role->id);

        TelegramBotChat::create([
            'chat_id' => $chatId,
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $user->id,
            'display_full_name' => $name,
            'display_phone' => $phone,
        ]);

        return $user;
    }

    private function makeInitData(array $user): string
    {
        $payload = [
            'auth_date' => (string) now()->timestamp,
            'query_id' => 'AAEAAAE',
            'user' => json_encode($user, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ];

        ksort($payload);

        $dataCheckString = collect($payload)
            ->map(fn ($value, $key) => $key . '=' . $value)
            ->implode("\n");

        $secretKey = hash_hmac('sha256', $this->token, 'WebAppData', true);
        $hash = hash_hmac('sha256', $dataCheckString, $secretKey);

        $payload['hash'] = $hash;

        return http_build_query($payload);
    }
}