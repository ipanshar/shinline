<?php

namespace App\Services\Telegram;

use App\Models\TelegramBotChat;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;

class TelegramWebAppAuthService
{
    /**
     * Парсит и проверяет initData из Telegram WebApp.
     * Возвращает [auth_date, user(array), validated_payload] либо null.
     *
     * @return array{auth_date:int, user: array<string,mixed>, payload: array<string,string>}|null
     */
    public function verify(string $initData): ?array
    {
        if ($initData === '') {
            return null;
        }

        $token = (string) config('telegram.bots.mybot.token');

        if ($token === '' || $token === 'YOUR-BOT-TOKEN') {
            return null;
        }

        parse_str($initData, $parsed);

        $hash = Arr::pull($parsed, 'hash');

        if (!is_string($hash) || $hash === '') {
            return null;
        }

        ksort($parsed);

        $dataCheckString = collect($parsed)
            ->map(fn ($value, $key) => $key . '=' . $value)
            ->implode("\n");

        $secretKey = hash_hmac('sha256', $token, 'WebAppData', true);
        $calcHash = hash_hmac('sha256', $dataCheckString, $secretKey);

        if (!hash_equals($calcHash, $hash)) {
            return null;
        }

        $authDate = (int) ($parsed['auth_date'] ?? 0);
        $ttl = (int) config('telegram.init_data_ttl', 86400);

        if ($ttl > 0 && Carbon::now()->getTimestamp() - $authDate > $ttl) {
            return null;
        }

        $user = json_decode((string) ($parsed['user'] ?? ''), true);

        if (!is_array($user) || empty($user['id'])) {
            return null;
        }

        return [
            'auth_date' => $authDate,
            'user' => $user,
            'payload' => $parsed,
        ];
    }

    /**
     * Находит/создаёт TelegramBotChat по данным initData.user.
     */
    public function resolveChat(array $tgUser): TelegramBotChat
    {
        $chatId = (string) $tgUser['id'];

        return TelegramBotChat::query()->updateOrCreate(
            ['chat_id' => $chatId],
            [
                'username' => $tgUser['username'] ?? null,
                'first_name' => $tgUser['first_name'] ?? null,
                'last_name' => $tgUser['last_name'] ?? null,
                'last_interaction_at' => now(),
            ]
        );
    }
}
