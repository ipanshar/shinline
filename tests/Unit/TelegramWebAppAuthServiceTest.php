<?php

namespace Tests\Unit;

use App\Services\Telegram\TelegramWebAppAuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class TelegramWebAppAuthServiceTest extends TestCase
{
    use RefreshDatabase;

    private string $token = '123456:ABCDEF-test-token';

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('telegram.bots.mybot.token', $this->token);
        config()->set('telegram.init_data_ttl', 86400);
    }

    public function test_returns_null_for_empty_init_data(): void
    {
        $service = new TelegramWebAppAuthService();
        $this->assertNull($service->verify(''));
    }

    public function test_returns_null_when_hash_invalid(): void
    {
        $service = new TelegramWebAppAuthService();
        $payload = $this->buildInitData(['id' => 1, 'first_name' => 'A'], time(), 'wronghash');
        $this->assertNull($service->verify($payload));
    }

    public function test_validates_correct_init_data(): void
    {
        $service = new TelegramWebAppAuthService();
        $authDate = time();
        $payload = $this->buildSignedInitData(['id' => 42, 'first_name' => 'Иван', 'username' => 'ivan'], $authDate);

        $result = $service->verify($payload);

        $this->assertIsArray($result);
        $this->assertSame($authDate, $result['auth_date']);
        $this->assertSame(42, $result['user']['id']);
        $this->assertSame('ivan', $result['user']['username']);
    }

    public function test_rejects_expired_init_data(): void
    {
        $service = new TelegramWebAppAuthService();
        $authDate = Carbon::now()->subSeconds(86401)->getTimestamp();
        $payload = $this->buildSignedInitData(['id' => 1, 'first_name' => 'A'], $authDate);

        $this->assertNull($service->verify($payload));
    }

    public function test_resolve_chat_creates_record(): void
    {
        $service = new TelegramWebAppAuthService();
        $chat = $service->resolveChat(['id' => 999, 'username' => 'newuser', 'first_name' => 'New']);

        $this->assertSame('999', $chat->chat_id);
        $this->assertSame('newuser', $chat->username);
        $this->assertDatabaseHas('telegram_bot_chats', ['chat_id' => '999', 'username' => 'newuser']);
    }

    private function buildSignedInitData(array $user, int $authDate): string
    {
        $params = [
            'auth_date' => (string) $authDate,
            'query_id' => 'AAH123',
            'user' => json_encode($user, JSON_UNESCAPED_UNICODE),
        ];
        ksort($params);
        $dataCheck = collect($params)->map(fn ($v, $k) => $k . '=' . $v)->implode("\n");
        $secret = hash_hmac('sha256', $this->token, 'WebAppData', true);
        $hash = hash_hmac('sha256', $dataCheck, $secret);

        return $this->buildInitData($user, $authDate, $hash, $params);
    }

    private function buildInitData(array $user, int $authDate, string $hash, ?array $params = null): string
    {
        $params = $params ?? [
            'auth_date' => (string) $authDate,
            'query_id' => 'AAH123',
            'user' => json_encode($user, JSON_UNESCAPED_UNICODE),
        ];
        $params['hash'] = $hash;

        return http_build_query($params);
    }
}
