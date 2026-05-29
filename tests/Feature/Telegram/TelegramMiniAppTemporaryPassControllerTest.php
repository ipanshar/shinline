<?php

namespace Tests\Feature\Telegram;

use App\Models\Role;
use App\Models\TelegramBotChat;
use App\Models\User;
use App\Models\ViolationEmployee;
use App\Services\Violations\TemporaryPassService;
use Database\Seeders\PermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TelegramMiniAppTemporaryPassControllerTest extends TestCase
{
    use RefreshDatabase;

    private string $token = '999:test-bot-token';

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionsSeeder::class);
        config()->set('telegram.bots.mybot.token', $this->token);
        config()->set('telegram.init_data_ttl', 86400);
        config()->set('telegram.admin_chat_ids', []);
        config()->set('services.faceid.base_url', 'http://127.0.0.1:8008');

        Storage::fake('faceid_references');
    }

    public function test_security_user_can_create_new_temporary_pass(): void
    {
        $now = Carbon::create(2026, 5, 22, 12, 0, 0);
        $this->travelTo($now);

        $initData = $this->makeInitData(['id' => 7201, 'first_name' => 'Guard']);
        $user = $this->approveSecurityUser('7201', 'Guard One', 'tg7201@example.com', '+77000007201');

        $statusCalls = 0;

        Http::fake([
            'http://127.0.0.1:8008/api/search' => Http::response([
                'matched' => false,
                'threshold' => TemporaryPassService::CHECK_MATCH_THRESHOLD,
                'bestMatch' => null,
                'candidates' => [],
            ], 200),
            'http://127.0.0.1:8008/api/rebuild' => Http::response(['status' => 'ok'], 200),
            'http://127.0.0.1:8008/api/status' => function () use (&$statusCalls) {
                $statusCalls++;

                if ($statusCalls === 1) {
                    return Http::response([
                        'loading' => true,
                        'ready' => false,
                        'people' => [],
                    ], 200);
                }

                $employee = ViolationEmployee::query()->latest('id')->first();

                return Http::response([
                    'loading' => false,
                    'ready' => true,
                    'people' => $employee ? [[
                        'employeeId' => $employee->id,
                        'profile' => [
                            'businessKey' => $employee->business_key,
                        ],
                    ]] : [],
                ], 200);
            },
        ]);

        $response = $this->post('/api/telegram/miniapp/temporary-passes/create', [
            'init_data' => $initData,
            'full_name' => 'Павел Монтажников',
            'department' => 'Строительный отдел',
            'position' => 'Монтажник',
            'duration_months' => 2,
            'rejected_all' => 1,
            'photo' => UploadedFile::fake()->create('contractor.jpg', 64, 'image/jpeg'),
        ], [
            'X-Telegram-Init-Data' => $initData,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.action', 'created')
            ->assertJsonPath('data.employee.full_name', 'Павел Монтажников')
            ->assertJsonPath('data.employee.person_kind', TemporaryPassService::PERSON_KIND_TEMPORARY_CONTRACTOR)
            ->assertJsonPath('data.employee.temporary_pass_status', TemporaryPassService::PASS_STATUS_ACTIVE)
            ->assertJsonPath('data.employee.temporary_pass_duration_months', 2)
            ->assertJsonPath('data.employee.temporary_pass_created_by_name', 'Guard One');

        $employee = ViolationEmployee::query()->firstOrFail();

        $this->assertSame('manual_security', $employee->source_system);
        $this->assertSame(TemporaryPassService::PERSON_KIND_TEMPORARY_CONTRACTOR, $employee->person_kind);
        $this->assertTrue($employee->is_active);
        $this->assertTrue($employee->temporary_pass_issued_at?->equalTo($now));
        $this->assertTrue($employee->temporary_pass_expires_at?->equalTo($now->copy()->addMonthsNoOverflow(2)));

        $this->assertDatabaseHas('violation_employee_face_references', [
            'employee_id' => $employee->id,
            'source_system' => 'manual_security',
            'source' => 'temporary_pass',
            'disk' => 'faceid_references',
            'is_primary' => true,
            'is_active' => true,
        ]);

        $this->assertDatabaseHas('violation_temporary_pass_events', [
            'employee_id' => $employee->id,
            'event_type' => TemporaryPassService::EVENT_CREATED,
            'duration_months' => 2,
            'performed_by_user_id' => $user->id,
            'performed_by_name' => 'Guard One',
            'performed_by_chat_id' => '7201',
        ]);

        Http::assertSent(fn ($request) => $request->url() === 'http://127.0.0.1:8008/api/search');
        Http::assertSent(fn ($request) => $request->url() === 'http://127.0.0.1:8008/api/rebuild');
        Http::assertSent(fn ($request) => $request->url() === 'http://127.0.0.1:8008/api/status');
        $this->assertGreaterThanOrEqual(2, $statusCalls);
    }

    public function test_recognize_returns_expired_temporary_pass_status(): void
    {
        $now = Carbon::create(2026, 5, 22, 13, 0, 0);
        $this->travelTo($now);

        $initData = $this->makeInitData(['id' => 7202, 'first_name' => 'Guard']);
        $this->approveSecurityUser('7202', 'Guard Two', 'tg7202@example.com', '+77000007202');

        $employee = ViolationEmployee::query()->create([
            'business_key' => 'temporary_contractor:test-expired',
            'source_system' => 'manual_security',
            'person_kind' => TemporaryPassService::PERSON_KIND_TEMPORARY_CONTRACTOR,
            'full_name' => 'Просроченный Подрядчик',
            'normalized_full_name' => 'просроченный подрядчик',
            'department' => 'Подрядчики',
            'position' => 'Сварщик',
            'employment_status' => 'TEMPORARY_CONTRACTOR',
            'temporary_pass_status' => TemporaryPassService::PASS_STATUS_ACTIVE,
            'temporary_pass_issued_at' => $now->copy()->subMonthsNoOverflow(2),
            'temporary_pass_expires_at' => $now->copy()->subDay(),
            'temporary_pass_duration_months' => 1,
            'temporary_pass_created_by_name' => 'Guard Two',
            'is_active' => true,
            'face_reference_state' => 'ready',
            'face_reference_count' => 1,
            'imported_at' => $now,
        ]);

        $employee->faceReferences()->create([
            'source_system' => 'manual_security',
            'source' => 'temporary_pass',
            'group_key' => $employee->business_key,
            'disk' => 'faceid_references',
            'path' => 'temporary/' . $employee->id . '/existing.jpg',
            'file_name' => 'existing.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 128,
            'sha1' => str_repeat('1', 40),
            'is_primary' => true,
            'is_active' => true,
            'imported_at' => $now,
            'last_synced_at' => $now,
        ]);

        Http::fake([
            'http://127.0.0.1:8008/api/search' => Http::response([
                'matched' => true,
                'threshold' => TemporaryPassService::CHECK_MATCH_THRESHOLD,
                'bestMatch' => [
                    'referenceKey' => 'temporary-pass:' . $employee->id . ':1',
                    'employeeId' => $employee->id,
                    'groupKey' => $employee->business_key,
                    'name' => $employee->full_name,
                    'source' => 'temporary_pass',
                    'similarity' => 0.88,
                    'profile' => [
                        'department' => $employee->department,
                        'role' => $employee->position,
                        'sourceLabel' => 'Temporary pass',
                    ],
                ],
                'candidates' => [],
            ], 200),
            'http://127.0.0.1:8008/api/rebuild' => Http::response(['status' => 'ok'], 200),
            'http://127.0.0.1:8008/api/status' => Http::response([
                'loading' => false,
                'ready' => true,
                'people' => [[
                    'employeeId' => $employee->id,
                    'profile' => [
                        'businessKey' => $employee->business_key,
                    ],
                ]],
            ], 200),
        ]);

        $this->post('/api/telegram/miniapp/temporary-passes/recognize', [
            'init_data' => $initData,
            'photo' => UploadedFile::fake()->create('expired.jpg', 64, 'image/jpeg'),
        ], [
            'X-Telegram-Init-Data' => $initData,
        ])
            ->assertOk()
            ->assertJsonPath('data.matched', true)
            ->assertJsonPath('data.best_match.employee_id', $employee->id)
            ->assertJsonPath('data.best_match.person_kind', TemporaryPassService::PERSON_KIND_TEMPORARY_CONTRACTOR)
            ->assertJsonPath('data.best_match.temporary_pass_status', TemporaryPassService::PASS_STATUS_EXPIRED);

        $this->assertSame(
            TemporaryPassService::PASS_STATUS_EXPIRED,
            $employee->fresh()->temporary_pass_status
        );
    }

    public function test_recognize_falls_back_to_unfiltered_search_when_runtime_person_kind_is_stale(): void
    {
        $now = Carbon::create(2026, 5, 22, 13, 30, 0);
        $this->travelTo($now);

        $initData = $this->makeInitData(['id' => 7204, 'first_name' => 'Guard']);
        $this->approveSecurityUser('7204', 'Guard Four', 'tg7204@example.com', '+77000007204');

        $employee = ViolationEmployee::query()->create([
            'business_key' => 'temporary_contractor:test-fallback',
            'source_system' => 'manual_security',
            'person_kind' => TemporaryPassService::PERSON_KIND_TEMPORARY_CONTRACTOR,
            'full_name' => 'Найденный Подрядчик',
            'normalized_full_name' => 'найденный подрядчик',
            'department' => 'Подрядчики',
            'position' => 'Сварщик',
            'employment_status' => 'TEMPORARY_CONTRACTOR',
            'temporary_pass_status' => TemporaryPassService::PASS_STATUS_ACTIVE,
            'temporary_pass_issued_at' => $now->copy()->subWeek(),
            'temporary_pass_expires_at' => $now->copy()->addMonth(),
            'temporary_pass_duration_months' => 1,
            'temporary_pass_created_by_name' => 'Guard Four',
            'is_active' => true,
            'face_reference_state' => 'ready',
            'face_reference_count' => 1,
            'imported_at' => $now,
        ]);

        $employee->faceReferences()->create([
            'source_system' => 'manual_security',
            'source' => 'temporary_pass',
            'group_key' => $employee->business_key,
            'disk' => 'faceid_references',
            'path' => 'temporary/' . $employee->id . '/existing.jpg',
            'file_name' => 'existing.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 128,
            'sha1' => str_repeat('2', 40),
            'is_primary' => true,
            'is_active' => true,
            'imported_at' => $now,
            'last_synced_at' => $now,
        ]);

        $searchCalls = 0;

        Http::fake([
            'http://127.0.0.1:8008/api/search' => function () use (&$searchCalls, $employee) {
                $searchCalls++;

                if ($searchCalls === 1) {
                    return Http::response([
                        'matched' => false,
                        'threshold' => TemporaryPassService::CHECK_MATCH_THRESHOLD,
                        'bestMatch' => null,
                        'candidates' => [],
                    ], 200);
                }

                return Http::response([
                    'matched' => true,
                    'threshold' => TemporaryPassService::CHECK_MATCH_THRESHOLD,
                    'bestMatch' => [
                        'referenceKey' => 'temporary-pass:' . $employee->id . ':1',
                        'employeeId' => $employee->id,
                        'groupKey' => $employee->business_key,
                        'name' => $employee->full_name,
                        'source' => 'temporary_pass',
                        'similarity' => 0.93,
                        'profile' => [
                            'department' => $employee->department,
                            'role' => $employee->position,
                            'sourceLabel' => 'Temporary pass',
                        ],
                    ],
                    'candidates' => [],
                ], 200);
            },
        ]);

        $this->post('/api/telegram/miniapp/temporary-passes/recognize', [
            'init_data' => $initData,
            'photo' => UploadedFile::fake()->create('fallback.jpg', 64, 'image/jpeg'),
        ], [
            'X-Telegram-Init-Data' => $initData,
        ])
            ->assertOk()
            ->assertJsonPath('data.matched', true)
            ->assertJsonPath('data.best_match.employee_id', $employee->id)
            ->assertJsonPath('data.best_match.person_kind', TemporaryPassService::PERSON_KIND_TEMPORARY_CONTRACTOR)
            ->assertJsonPath('data.best_match.temporary_pass_status', TemporaryPassService::PASS_STATUS_ACTIVE);

        $this->assertSame(2, $searchCalls);
    }

    public function test_extend_expired_temporary_pass_restarts_from_now_without_duplicate_face_reference(): void
    {
        $now = Carbon::create(2026, 5, 22, 14, 0, 0);
        $this->travelTo($now);

        $initData = $this->makeInitData(['id' => 7203, 'first_name' => 'Guard']);
        $user = $this->approveSecurityUser('7203', 'Guard Three', 'tg7203@example.com', '+77000007203');

        $employee = ViolationEmployee::query()->create([
            'business_key' => 'temporary_contractor:test-extend',
            'source_system' => 'manual_security',
            'person_kind' => TemporaryPassService::PERSON_KIND_TEMPORARY_CONTRACTOR,
            'full_name' => 'Продлеваемый Подрядчик',
            'normalized_full_name' => 'продлеваемый подрядчик',
            'department' => 'Монтажный отдел',
            'position' => 'Электрик',
            'employment_status' => 'TEMPORARY_CONTRACTOR',
            'temporary_pass_status' => TemporaryPassService::PASS_STATUS_EXPIRED,
            'temporary_pass_issued_at' => $now->copy()->subMonthsNoOverflow(3),
            'temporary_pass_expires_at' => $now->copy()->subDays(10),
            'temporary_pass_duration_months' => 1,
            'temporary_pass_created_by_user_id' => $user->id,
            'temporary_pass_created_by_name' => $user->name,
            'is_active' => true,
            'face_reference_state' => 'ready',
            'face_reference_count' => 1,
            'imported_at' => $now,
        ]);

        $upload = UploadedFile::fake()->create('same-face.jpg', 64, 'image/jpeg');
        $existingSha1 = sha1_file($upload->getRealPath());
        $this->assertIsString($existingSha1);

        $employee->faceReferences()->create([
            'source_system' => 'manual_security',
            'source' => 'temporary_pass',
            'group_key' => $employee->business_key,
            'disk' => 'faceid_references',
            'path' => 'temporary/' . $employee->id . '/same-face.jpg',
            'file_name' => 'same-face.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 128,
            'sha1' => $existingSha1,
            'is_primary' => true,
            'is_active' => true,
            'imported_at' => $now->copy()->subMonth(),
            'last_synced_at' => $now->copy()->subMonth(),
        ]);

        Http::fake([
            'http://127.0.0.1:8008/api/search' => Http::response([
                'matched' => true,
                'threshold' => TemporaryPassService::CHECK_MATCH_THRESHOLD,
                'bestMatch' => [
                    'referenceKey' => 'temporary-pass:' . $employee->id . ':1',
                    'employeeId' => $employee->id,
                    'groupKey' => $employee->business_key,
                    'name' => $employee->full_name,
                    'source' => 'temporary_pass',
                    'similarity' => 0.91,
                    'profile' => [
                        'department' => $employee->department,
                        'role' => $employee->position,
                        'sourceLabel' => 'Temporary pass',
                    ],
                ],
                'candidates' => [],
            ], 200),
        ]);

        $response = $this->post('/api/telegram/miniapp/temporary-passes/extend', [
            'init_data' => $initData,
            'duration_months' => 3,
            'confirmed_reference_key' => 'temporary-pass:' . $employee->id . ':1',
            'photo' => $upload,
        ], [
            'X-Telegram-Init-Data' => $initData,
        ]);

        $response->assertOk()
            ->assertJsonPath('data.action', 'extended')
            ->assertJsonPath('data.employee.id', $employee->id)
            ->assertJsonPath('data.employee.temporary_pass_status', TemporaryPassService::PASS_STATUS_ACTIVE);

        $employee->refresh();

        $this->assertTrue($employee->temporary_pass_issued_at?->equalTo($now));
        $this->assertTrue($employee->temporary_pass_expires_at?->equalTo($now->copy()->addMonthsNoOverflow(3)));
        $this->assertTrue($employee->temporary_pass_last_extended_at?->equalTo($now));
        $this->assertSame(1, $employee->faceReferences()->count());
        $this->assertSame(1, (int) $employee->fresh()->face_reference_count);

        $this->assertDatabaseHas('violation_temporary_pass_events', [
            'employee_id' => $employee->id,
            'event_type' => TemporaryPassService::EVENT_EXTENDED,
            'duration_months' => 3,
            'performed_by_user_id' => $user->id,
            'matched_reference_key' => 'temporary-pass:' . $employee->id . ':1',
        ]);
    }

    public function test_extend_accepts_confirmed_candidate_at_backend_threshold(): void
    {
        $now = Carbon::create(2026, 5, 22, 14, 30, 0);
        $this->travelTo($now);

        $initData = $this->makeInitData(['id' => 7205, 'first_name' => 'Guard']);
        $user = $this->approveSecurityUser('7205', 'Guard Five', 'tg7205@example.com', '+77000007205');

        $employee = ViolationEmployee::query()->create([
            'business_key' => 'temporary_contractor:test-low-threshold',
            'source_system' => 'manual_security',
            'person_kind' => TemporaryPassService::PERSON_KIND_TEMPORARY_CONTRACTOR,
            'full_name' => 'Пороговый Подрядчик',
            'normalized_full_name' => 'пороговый подрядчик',
            'department' => 'Подрядчики',
            'position' => 'Электрик',
            'employment_status' => 'TEMPORARY_CONTRACTOR',
            'temporary_pass_status' => TemporaryPassService::PASS_STATUS_ACTIVE,
            'temporary_pass_issued_at' => $now->copy()->subMonth(),
            'temporary_pass_expires_at' => $now->copy()->addWeek(),
            'temporary_pass_duration_months' => 1,
            'temporary_pass_created_by_user_id' => $user->id,
            'temporary_pass_created_by_name' => $user->name,
            'is_active' => true,
            'face_reference_state' => 'ready',
            'face_reference_count' => 1,
            'imported_at' => $now,
        ]);

        $employee->faceReferences()->create([
            'source_system' => 'manual_security',
            'source' => 'temporary_pass',
            'group_key' => $employee->business_key,
            'disk' => 'faceid_references',
            'path' => 'temporary/' . $employee->id . '/threshold.jpg',
            'file_name' => 'threshold.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 128,
            'sha1' => str_repeat('3', 40),
            'is_primary' => true,
            'is_active' => true,
            'imported_at' => $now,
            'last_synced_at' => $now,
        ]);

        Http::fake([
            'http://127.0.0.1:8008/api/search' => Http::response([
                'matched' => true,
                'threshold' => 0.45,
                'bestMatch' => [
                    'referenceKey' => 'temporary-pass:' . $employee->id . ':1',
                    'employeeId' => $employee->id,
                    'groupKey' => $employee->business_key,
                    'name' => $employee->full_name,
                    'source' => 'temporary_pass',
                    'similarity' => 0.46,
                    'profile' => [
                        'department' => $employee->department,
                        'role' => $employee->position,
                        'sourceLabel' => 'Temporary pass',
                    ],
                ],
                'candidates' => [],
            ], 200),
        ]);

        $this->post('/api/telegram/miniapp/temporary-passes/extend', [
            'init_data' => $initData,
            'duration_months' => 2,
            'confirmed_reference_key' => 'temporary-pass:' . $employee->id . ':1',
            'photo' => UploadedFile::fake()->create('threshold-check.jpg', 64, 'image/jpeg'),
        ], [
            'X-Telegram-Init-Data' => $initData,
        ])
            ->assertOk()
            ->assertJsonPath('data.employee.id', $employee->id)
            ->assertJsonPath('data.employee.temporary_pass_status', TemporaryPassService::PASS_STATUS_ACTIVE);

        $this->assertDatabaseHas('violation_temporary_pass_events', [
            'employee_id' => $employee->id,
            'event_type' => TemporaryPassService::EVENT_EXTENDED,
            'duration_months' => 2,
            'matched_reference_key' => 'temporary-pass:' . $employee->id . ':1',
        ]);
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
            'query_id' => 'AAEAAATEMP',
            'user' => json_encode($user, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ];

        ksort($payload);

        $dataCheckString = collect($payload)
            ->map(fn ($value, $key) => $key . '=' . $value)
            ->implode("\n");

        $secretKey = hash_hmac('sha256', $this->token, 'WebAppData', true);
        $payload['hash'] = hash_hmac('sha256', $dataCheckString, $secretKey);

        return http_build_query($payload);
    }
}
