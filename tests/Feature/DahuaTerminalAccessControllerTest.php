<?php

namespace Tests\Feature;

use App\Models\ViolationEmployee;
use App\Services\Violations\TemporaryPassService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DahuaTerminalAccessControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set('services.faceid.base_url', 'http://127.0.0.1:8008');
        config()->set('services.dahua_terminal.secret', 'terminal-secret');
        config()->set('services.dahua_terminal.default_greeting', 'Спасибо');
        config()->set('services.dahua_terminal.deny_greeting', 'Доступ запрещен');
    }

    public function test_terminal_allows_recognized_employee_and_uses_custom_greeting(): void
    {
        $employee = ViolationEmployee::query()->create([
            'business_key' => 'employee:test-dahua-1',
            'source_system' => 'manual_security',
            'person_kind' => 'employee',
            'full_name' => 'Серик Нурланов',
            'normalized_full_name' => 'серик нурланов',
            'department' => 'Безопасность',
            'position' => 'Старший смены',
            'employment_status' => 'ACTIVE',
            'is_active' => true,
            'face_reference_state' => 'ready',
            'face_reference_count' => 1,
            'imported_at' => now(),
            'meta' => [
                'terminal_greeting' => 'Здравствуйте, Серик',
            ],
        ]);

        Http::fake([
            'http://127.0.0.1:8008/api/search' => Http::response([
                'matched' => true,
                'threshold' => 0.45,
                'bestMatch' => [
                    'referenceKey' => 'employee:' . $employee->id . ':1',
                    'employeeId' => $employee->id,
                    'groupKey' => $employee->business_key,
                    'name' => $employee->full_name,
                    'source' => 'manual_security',
                    'similarity' => 0.97,
                    'profile' => [
                        'sourceLabel' => 'Manual',
                    ],
                ],
                'candidates' => [],
            ], 200),
        ]);

        $response = $this->post('/api/dahua/terminal/recognize', [
            'photo' => UploadedFile::fake()->create('face.jpg', 64, 'image/jpeg'),
            'device_key' => 'front-gate-1',
        ], [
            'X-Dahua-Terminal-Secret' => 'terminal-secret',
            'Accept' => 'application/json',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.decision', 'allow')
            ->assertJsonPath('data.open_door', true)
            ->assertJsonPath('data.reason', 'recognized')
            ->assertJsonPath('data.greeting', 'Здравствуйте, Серик')
            ->assertJsonPath('data.employee.id', $employee->id)
            ->assertJsonPath('data.employee.person_kind', 'employee')
            ->assertJsonPath('data.recognition.matched', true);
    }

    public function test_terminal_allows_base64_image_and_uses_default_greeting_when_custom_missing(): void
    {
        $employee = ViolationEmployee::query()->create([
            'business_key' => 'employee:test-dahua-2',
            'source_system' => 'manual_security',
            'person_kind' => 'employee',
            'full_name' => 'Айбек Сарсенов',
            'normalized_full_name' => 'айбек сарсенов',
            'department' => 'Логистика',
            'position' => 'Координатор',
            'employment_status' => 'ACTIVE',
            'is_active' => true,
            'face_reference_state' => 'ready',
            'face_reference_count' => 1,
            'imported_at' => now(),
            'meta' => [],
        ]);

        Http::fake([
            'http://127.0.0.1:8008/api/search' => Http::response([
                'matched' => true,
                'threshold' => 0.45,
                'bestMatch' => [
                    'referenceKey' => 'employee:' . $employee->id . ':2',
                    'employeeId' => $employee->id,
                    'groupKey' => $employee->business_key,
                    'name' => $employee->full_name,
                    'source' => 'manual_security',
                    'similarity' => 0.88,
                    'profile' => [
                        'sourceLabel' => 'Manual',
                    ],
                ],
                'candidates' => [],
            ], 200),
        ]);

        $response = $this->postJson('/api/dahua/terminal/recognize', [
            'image_base64' => 'data:image/jpeg;base64,' . base64_encode('fake-face-image'),
            'device_key' => 'front-gate-2',
        ], [
            'X-Dahua-Terminal-Secret' => 'terminal-secret',
            'Accept' => 'application/json',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.decision', 'allow')
            ->assertJsonPath('data.open_door', true)
            ->assertJsonPath('data.greeting', 'Спасибо')
            ->assertJsonPath('data.employee.id', $employee->id);
    }

    public function test_terminal_denies_expired_temporary_pass(): void
    {
        $now = Carbon::create(2026, 5, 29, 12, 0, 0);
        $this->travelTo($now);

        $employee = ViolationEmployee::query()->create([
            'business_key' => 'temporary_contractor:test-dahua-expired',
            'source_system' => 'manual_security',
            'person_kind' => TemporaryPassService::PERSON_KIND_TEMPORARY_CONTRACTOR,
            'full_name' => 'Временный Подрядчик',
            'normalized_full_name' => 'временный подрядчик',
            'department' => 'Подрядчики',
            'position' => 'Монтажник',
            'employment_status' => 'TEMPORARY_CONTRACTOR',
            'temporary_pass_status' => TemporaryPassService::PASS_STATUS_ACTIVE,
            'temporary_pass_issued_at' => $now->copy()->subMonth(),
            'temporary_pass_expires_at' => $now->copy()->subMinute(),
            'temporary_pass_duration_months' => 1,
            'is_active' => true,
            'face_reference_state' => 'ready',
            'face_reference_count' => 1,
            'imported_at' => $now,
            'meta' => [],
        ]);

        Http::fake([
            'http://127.0.0.1:8008/api/search' => Http::response([
                'matched' => true,
                'threshold' => 0.45,
                'bestMatch' => [
                    'referenceKey' => 'temporary:' . $employee->id . ':1',
                    'employeeId' => $employee->id,
                    'groupKey' => $employee->business_key,
                    'name' => $employee->full_name,
                    'source' => 'temporary_pass',
                    'similarity' => 0.95,
                    'profile' => [
                        'sourceLabel' => 'Temporary pass',
                    ],
                ],
                'candidates' => [],
            ], 200),
        ]);

        $response = $this->post('/api/dahua/terminal/recognize', [
            'photo' => UploadedFile::fake()->create('expired.jpg', 64, 'image/jpeg'),
            'device_key' => 'front-gate-3',
        ], [
            'X-Dahua-Terminal-Secret' => 'terminal-secret',
            'Accept' => 'application/json',
        ]);

        $response->assertOk()
            ->assertJsonPath('data.decision', 'deny')
            ->assertJsonPath('data.open_door', false)
            ->assertJsonPath('data.reason', 'temporary_pass_expired')
            ->assertJsonPath('data.greeting', 'Доступ запрещен')
            ->assertJsonPath('data.employee.id', $employee->id)
            ->assertJsonPath('data.employee.temporary_pass_status', TemporaryPassService::PASS_STATUS_EXPIRED);
    }
}