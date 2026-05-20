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
        Storage::fake('faceid_references');
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

    public function test_security_user_can_create_violation_without_optional_evidence_files(): void
    {
        $initData = $this->makeInitData(['id' => 7109, 'first_name' => 'NoEvidence']);

        $user = User::create([
            'name' => 'No Evidence User',
            'login' => 'tg_7109',
            'email' => 'tg7109@example.com',
            'password' => 'x',
            'phone' => '+77000007109',
        ]);

        $role = Role::findByName('Служба безопасности');
        $this->assertNotNull($role);
        $user->roles()->attach($role->id);

        TelegramBotChat::create([
            'chat_id' => '7109',
            'approval_status' => TelegramBotChat::APPROVAL_APPROVED,
            'approved_user_id' => $user->id,
            'display_full_name' => 'No Evidence User',
            'display_phone' => '+77000007109',
        ]);

        $typeId = \App\Models\ViolationType::query()->where('key', 'no_ppe')->value('id');
        $this->assertNotNull($typeId);

        $response = $this->post('/api/telegram/miniapp/violations/incidents', [
            'init_data' => $initData,
            'type_id' => $typeId,
            'occurred_at' => now()->toDateTimeString(),
            'location_label' => 'Цех 2',
            'description' => 'Нарушение без отдельной улики.',
            'manual_full_name' => 'Тест Без Улики',
        ], [
            'X-Telegram-Init-Data' => $initData,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.employee_full_name', 'Тест Без Улики')
            ->assertJsonPath('data.evidence_total_count', 0)
            ->assertJsonPath('data.evidence_photo_count', 0)
            ->assertJsonPath('data.evidence_video_count', 0);

        $this->assertDatabaseHas('violation_incidents', [
            'reported_by_user_id' => $user->id,
            'employee_full_name' => 'Тест Без Улики',
            'evidence_total_count' => 0,
            'evidence_photo_count' => 0,
            'evidence_video_count' => 0,
        ]);

        $this->assertDatabaseCount('violation_evidences', 0);
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
                    'referenceKey' => 'sigur-photo:501:1',
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
            ->assertJsonPath('data.best_match.reference_key', 'sigur-photo:501:1')
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
                    'referenceKey' => 'sigur-personalimg:777:11',
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
            'recognition_confirmed_reference_key' => 'sigur-personalimg:777:11',
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

    public function test_guard_can_confirm_second_candidate_after_rejecting_first_reference_photo(): void
    {
        $initData = $this->makeInitData(['id' => 7106, 'first_name' => 'Verifier']);
        $user = $this->approveSecurityUser('7106', 'Verifier User', 'tg7106@example.com', '+77000007106');
        $typeId = \App\Models\ViolationType::query()->where('key', 'no_ppe')->value('id');

        Http::fake([
            'http://127.0.0.1:8008/api/search' => Http::response([
                'matched' => false,
                'threshold' => 0.5,
                'bestMatch' => [
                    'referenceKey' => 'sigur-photo:900:1',
                    'employeeId' => 900,
                    'groupKey' => 'candidate:900',
                    'name' => 'Похожий кандидат 1',
                    'source' => 'sigur-photo',
                    'referenceImageUrl' => '/reference-images/candidate-1.jpg',
                    'similarity' => 0.4812,
                    'profile' => [
                        'department' => 'Цех 1',
                        'role' => 'EMP',
                        'sourceLabel' => 'Sigur photo',
                    ],
                ],
                'candidates' => [[
                    'referenceKey' => 'sigur-photo:901:2',
                    'employeeId' => 901,
                    'groupKey' => 'iin:901901901901|name:sergey_sergeev',
                    'name' => 'Сергей Сергеев',
                    'source' => 'sigur-photo',
                    'referenceImageUrl' => '/reference-images/candidate-2.jpg',
                    'similarity' => 0.4542,
                    'profile' => [
                        'department' => 'Цех розлива',
                        'role' => 'EMP',
                        'iin' => '901901901901',
                        'status' => 'AVAILABLE',
                        'sourceLabel' => 'Sigur photo',
                    ],
                ]],
            ], 200),
        ]);

        $response = $this->post('/api/telegram/miniapp/violations/incidents', [
            'init_data' => $initData,
            'type_id' => $typeId,
            'occurred_at' => now()->toDateTimeString(),
            'description' => 'Охранник подтвердил второго кандидата по эталонному фото.',
            'recognition_confirmed_reference_key' => 'sigur-photo:901:2',
            'recognition_file' => UploadedFile::fake()->create('employee.jpg', 64, 'image/jpeg'),
            'files' => [UploadedFile::fake()->create('proof.jpg', 64, 'image/jpeg')],
        ], [
            'X-Telegram-Init-Data' => $initData,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.employee_full_name', 'Сергей Сергеев')
            ->assertJsonPath('data.employee_department', 'Цех розлива')
            ->assertJsonPath('data.employee_position', 'EMP');

        $this->assertDatabaseHas('violation_incidents', [
            'reported_by_user_id' => $user->id,
            'employee_full_name' => 'Сергей Сергеев',
            'recognition_status' => 'matched',
            'identity_source' => 'faceid_guard_confirmed',
        ]);
    }

    public function test_guard_can_reject_three_candidates_and_save_manual_identity_with_new_reference(): void
    {
        $initData = $this->makeInitData(['id' => 7107, 'first_name' => 'Manual']);
        $user = $this->approveSecurityUser('7107', 'Manual User', 'tg7107@example.com', '+77000007107');
        $typeId = \App\Models\ViolationType::query()->where('key', 'no_ppe')->value('id');

        Http::fake([
            'http://127.0.0.1:8008/api/search' => Http::response([
                'matched' => false,
                'threshold' => 0.5,
                'bestMatch' => [
                    'referenceKey' => 'sigur-photo:1000:1',
                    'employeeId' => 1000,
                    'groupKey' => 'candidate:1000',
                    'name' => 'Кандидат 1',
                    'source' => 'sigur-photo',
                    'referenceImageUrl' => '/reference-images/candidate-1.jpg',
                    'similarity' => 0.4888,
                    'profile' => [
                        'department' => 'Цех 1',
                        'role' => 'EMP',
                        'sourceLabel' => 'Sigur photo',
                    ],
                ],
                'candidates' => [
                    [
                        'referenceKey' => 'sigur-photo:1001:2',
                        'employeeId' => 1001,
                        'groupKey' => 'candidate:1001',
                        'name' => 'Кандидат 2',
                        'source' => 'sigur-photo',
                        'referenceImageUrl' => '/reference-images/candidate-2.jpg',
                        'similarity' => 0.4622,
                        'profile' => [
                            'department' => 'Цех 2',
                            'role' => 'EMP',
                            'sourceLabel' => 'Sigur photo',
                        ],
                    ],
                    [
                        'referenceKey' => 'sigur-photo:1002:3',
                        'employeeId' => 1002,
                        'groupKey' => 'candidate:1002',
                        'name' => 'Кандидат 3',
                        'source' => 'sigur-photo',
                        'referenceImageUrl' => '/reference-images/candidate-3.jpg',
                        'similarity' => 0.4511,
                        'profile' => [
                            'department' => 'Цех 3',
                            'role' => 'EMP',
                            'sourceLabel' => 'Sigur photo',
                        ],
                    ],
                ],
            ], 200),
            'http://127.0.0.1:8008/api/rebuild' => Http::response([
                'status' => 'ok',
            ], 200),
        ]);

        $response = $this->post('/api/telegram/miniapp/violations/incidents', [
            'init_data' => $initData,
            'type_id' => $typeId,
            'occurred_at' => now()->toDateTimeString(),
            'description' => 'Три кандидата отклонены, сотрудник заполнен вручную.',
            'manual_full_name' => 'Новый Сотрудник',
            'manual_department' => 'Склад ГП',
            'manual_position' => 'EMP',
            'recognition_rejected_all' => '1',
            'recognition_file' => UploadedFile::fake()->create('unknown.jpg', 64, 'image/jpeg'),
            'files' => [UploadedFile::fake()->create('proof.jpg', 64, 'image/jpeg')],
        ], [
            'X-Telegram-Init-Data' => $initData,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.employee_full_name', 'Новый Сотрудник')
            ->assertJsonPath('data.employee_department', 'Склад ГП')
            ->assertJsonPath('data.employee_position', 'EMP')
            ->assertJsonPath('data.recognition_status', 'manual')
            ->assertJsonPath('data.workflow_status', 'pending_review');

        $incidentId = \App\Models\ViolationIncident::query()->value('id');
        $employeeId = \App\Models\ViolationEmployee::query()->value('id');

        $this->assertDatabaseHas('violation_evidences', [
            'incident_id' => $incidentId,
            'media_role' => 'recognition_probe',
            'media_kind' => 'photo',
        ]);

        $this->assertDatabaseHas('violation_employee_face_references', [
            'employee_id' => $employeeId,
            'source_system' => 'manual_security',
            'source' => 'recognition_probe',
            'disk' => 'faceid_references',
            'is_active' => true,
        ]);

        Http::assertSent(fn ($request) => $request->url() === 'http://127.0.0.1:8008/api/rebuild' && $request->method() === 'POST');
    }

    public function test_second_incident_can_match_existing_manual_reference_without_creating_duplicate_employee(): void
    {
        $initData = $this->makeInitData(['id' => 7108, 'first_name' => 'Repeat']);
        $user = $this->approveSecurityUser('7108', 'Repeat User', 'tg7108@example.com', '+77000007108');
        $typeId = \App\Models\ViolationType::query()->where('key', 'no_ppe')->value('id');

        $employee = \App\Models\ViolationEmployee::query()->create([
            'business_key' => 'manual_security:test-repeat',
            'source_system' => 'manual_security',
            'full_name' => 'Тестовый Сотрудник',
            'normalized_full_name' => 'тестовый сотрудник',
            'department' => 'Склад ГП',
            'position' => 'EMP',
            'employment_status' => 'MANUAL_REVIEW',
            'is_active' => true,
            'face_reference_count' => 1,
            'face_reference_state' => 'ready',
            'last_face_sync_at' => now(),
            'imported_at' => now(),
        ]);

        Http::fake([
            'http://127.0.0.1:8008/api/search' => Http::response([
                'matched' => true,
                'threshold' => 0.5,
                'bestMatch' => [
                    'referenceKey' => 'recognition_probe:' . $employee->id . ':1',
                    'employeeId' => $employee->id,
                    'groupKey' => $employee->business_key,
                    'name' => $employee->full_name,
                    'source' => 'recognition_probe',
                    'referenceImageUrl' => '/reference-images/manual/test.jpg',
                    'similarity' => 0.9812,
                    'profile' => [
                        'department' => $employee->department,
                        'role' => $employee->position,
                        'status' => $employee->employment_status,
                        'businessKey' => $employee->business_key,
                        'groupKey' => $employee->business_key,
                        'sourceLabel' => 'Telegram manual reference',
                    ],
                ],
                'candidates' => [],
            ], 200),
        ]);

        $secondResponse = $this->post('/api/telegram/miniapp/violations/incidents', [
            'init_data' => $initData,
            'type_id' => $typeId,
            'occurred_at' => now()->toDateTimeString(),
            'description' => 'Повторное нарушение должно найти только что сохранённый эталон.',
            'recognition_file' => UploadedFile::fake()->create('repeat.jpg', 64, 'image/jpeg'),
            'files' => [UploadedFile::fake()->create('proof.jpg', 64, 'image/jpeg')],
        ], [
            'X-Telegram-Init-Data' => $initData,
        ]);

        $secondResponse->assertCreated()
            ->assertJsonPath('data.employee_full_name', 'Тестовый Сотрудник')
            ->assertJsonPath('data.employee_department', 'Склад ГП')
            ->assertJsonPath('data.employee_position', 'EMP')
            ->assertJsonPath('data.recognition_status', 'matched');

        $this->assertDatabaseCount('violation_employees', 1);
        $this->assertDatabaseHas('violation_incidents', [
            'reported_by_user_id' => $user->id,
            'employee_id' => $employee->id,
            'employee_full_name' => 'Тестовый Сотрудник',
            'recognition_status' => 'matched',
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