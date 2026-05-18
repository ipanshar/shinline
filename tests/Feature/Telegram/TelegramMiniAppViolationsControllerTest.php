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