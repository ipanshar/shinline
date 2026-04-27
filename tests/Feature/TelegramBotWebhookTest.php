<?php

namespace Tests\Feature;

use App\Models\GuestVisit;
use App\Models\User;
use App\Models\Yard;
use App\Services\TelegramMessagingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery;
use Tests\TestCase;

class TelegramBotWebhookTest extends TestCase
{
    use RefreshDatabase;

    public function test_linked_user_can_create_guest_visit_via_telegram_webhook(): void
    {
        $messaging = Mockery::mock(TelegramMessagingService::class);
        $messaging->shouldReceive('sendText')->zeroOrMoreTimes();
        $this->app->instance(TelegramMessagingService::class, $messaging);

        $user = User::create([
            'name' => 'Telegram User',
            'login' => 'telegram.user',
            'email' => 'telegram@example.com',
            'password' => 'password',
            'phone' => '+77001112233',
        ]);

        $yard = Yard::create([
            'name' => 'Основная площадка',
            'strict_mode' => false,
            'weighing_required' => false,
        ]);

        $chatId = '100500';

        $this->postJson('/api/telegram/webhook', $this->telegramMessage($chatId, '/start'))->assertOk();
        $this->postJson('/api/telegram/webhook', $this->telegramMessage($chatId, $user->login))->assertOk();
        $this->postJson('/api/telegram/webhook', $this->telegramMessage($chatId, '2233'))->assertOk();
        $this->postJson('/api/telegram/webhook', $this->telegramMessage($chatId, '/guest'))->assertOk();
        $this->postJson('/api/telegram/webhook', $this->telegramMessage($chatId, '1'))->assertOk();
        $this->postJson('/api/telegram/webhook', $this->telegramMessage($chatId, 'Иван Иванов'))->assertOk();
        $this->postJson('/api/telegram/webhook', $this->telegramMessage($chatId, '+77001234567'))->assertOk();
        $this->postJson('/api/telegram/webhook', $this->telegramMessage($chatId, 'Инженер'))->assertOk();
        $this->postJson('/api/telegram/webhook', $this->telegramMessage($chatId, 'Тестовая компания'))->assertOk();
        $this->postJson('/api/telegram/webhook', $this->telegramMessage($chatId, 'сейчас'))->assertOk();
        $this->postJson('/api/telegram/webhook', $this->telegramMessage($chatId, '1'))->assertOk();
        $this->postJson('/api/telegram/webhook', $this->telegramMessage($chatId, '-'))->assertOk();

        $this->assertDatabaseHas('telegram_bot_chats', [
            'chat_id' => $chatId,
            'user_id' => $user->id,
        ]);

        $this->assertDatabaseHas('guest_visits', [
            'yard_id' => $yard->id,
            'guest_full_name' => 'Иван Иванов',
            'guest_phone' => '+77001234567',
            'guest_position' => 'Инженер',
            'guest_company_name' => 'Тестовая компания',
            'host_name' => $user->name,
            'host_phone' => $user->phone,
            'created_by_user_id' => $user->id,
            'permit_kind' => GuestVisit::PERMIT_KIND_ONE_TIME,
        ]);
    }

    protected function tearDown(): void
    {
        Mockery::close();

        parent::tearDown();
    }

    private function telegramMessage(string $chatId, string $text): array
    {
        return [
            'update_id' => random_int(1, 1000000),
            'message' => [
                'message_id' => random_int(1, 1000000),
                'date' => now()->timestamp,
                'text' => $text,
                'chat' => [
                    'id' => $chatId,
                    'type' => 'private',
                ],
                'from' => [
                    'id' => $chatId,
                    'is_bot' => false,
                    'first_name' => 'Tester',
                    'username' => 'telegramtester',
                ],
            ],
        ];
    }
}