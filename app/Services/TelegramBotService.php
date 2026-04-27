<?php

namespace App\Services;

use App\Models\GuestVisit;
use App\Models\TelegramBotChat;
use App\Models\User;
use App\Models\Yard;
use Carbon\Carbon;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class TelegramBotService
{
    private const STATE_AWAITING_LOGIN = 'awaiting_login';
    private const STATE_AWAITING_PHONE = 'awaiting_phone';
    private const STATE_GUEST_YARD = 'guest_yard';
    private const STATE_GUEST_NAME = 'guest_name';
    private const STATE_GUEST_PHONE = 'guest_phone';
    private const STATE_GUEST_POSITION = 'guest_position';
    private const STATE_GUEST_COMPANY = 'guest_company';
    private const STATE_GUEST_START_AT = 'guest_start_at';
    private const STATE_GUEST_PERMIT_KIND = 'guest_permit_kind';
    private const STATE_GUEST_END_AT = 'guest_end_at';
    private const STATE_GUEST_COMMENT = 'guest_comment';

    public function __construct(
        private GuestVisitService $guestVisitService,
        private TelegramMessagingService $telegramMessaging,
    )
    {
    }

    public function handleUpdate(array $update): void
    {
        $message = Arr::get($update, 'message');

        if (!is_array($message)) {
            return;
        }

        $chatId = (string) Arr::get($message, 'chat.id', '');
        $text = trim((string) Arr::get($message, 'text', ''));

        if ($chatId === '' || $text === '') {
            return;
        }

        $chat = $this->syncChat($message);

        if ($this->handleCommand($chat, $text)) {
            return;
        }

        $this->handleState($chat, $text);
    }

    private function syncChat(array $message): TelegramBotChat
    {
        return TelegramBotChat::query()->updateOrCreate(
            ['chat_id' => (string) Arr::get($message, 'chat.id')],
            [
                'username' => Arr::get($message, 'from.username'),
                'first_name' => Arr::get($message, 'from.first_name'),
                'last_name' => Arr::get($message, 'from.last_name'),
                'last_interaction_at' => now(),
            ]
        );
    }

    private function handleCommand(TelegramBotChat $chat, string $text): bool
    {
        $command = Str::lower(Str::before($text, ' '));

        return match ($command) {
            '/start' => $this->start($chat),
            '/help' => $this->showHelp($chat),
            '/cancel' => $this->cancelFlow($chat),
            '/guest' => $this->startGuestFlow($chat),
            '/unlink' => $this->unlink($chat),
            default => false,
        };
    }

    private function start(TelegramBotChat $chat): bool
    {
        $chat->refresh();

        if ($chat->user_id) {
            $this->clearState($chat);
            $this->sendMessage($chat->chat_id, $this->buildLinkedGreeting($chat));

            return true;
        }

        $this->setState($chat, self::STATE_AWAITING_LOGIN);
        $this->sendMessage(
            $chat->chat_id,
            "Здравствуйте. Я помогу оформить гостевой визит.\n\nВведите ваш логин из системы Shinline для привязки Telegram к учётной записи."
        );

        return true;
    }

    private function showHelp(TelegramBotChat $chat): bool
    {
        $message = $chat->user_id
            ? $this->buildLinkedGreeting($chat)
            : "Доступные команды:\n/start - привязать Telegram к учётной записи\n/help - показать подсказку\n/cancel - отменить текущий диалог";

        $this->sendMessage($chat->chat_id, $message);

        return true;
    }

    private function cancelFlow(TelegramBotChat $chat): bool
    {
        $this->clearState($chat);
        $this->sendMessage($chat->chat_id, "Текущий диалог отменён.\nИспользуйте /guest для создания нового гостевого визита.");

        return true;
    }

    private function unlink(TelegramBotChat $chat): bool
    {
        $chat->forceFill([
            'user_id' => null,
            'state' => null,
            'state_payload' => null,
        ])->save();

        $this->sendMessage($chat->chat_id, 'Привязка Telegram к пользователю удалена. Для повторной привязки используйте /start.');

        return true;
    }

    private function startGuestFlow(TelegramBotChat $chat): bool
    {
        if (!$chat->user_id) {
            $this->setState($chat, self::STATE_AWAITING_LOGIN);
            $this->sendMessage($chat->chat_id, 'Сначала привяжите Telegram к учётной записи через /start.');

            return true;
        }

        $yards = Yard::query()->orderBy('name')->get(['id', 'name']);

        if ($yards->isEmpty()) {
            $this->sendMessage($chat->chat_id, 'В системе нет доступных площадок для оформления визита.');

            return true;
        }

        $options = [];
        $lines = [
            'Выберите площадку для гостевого визита.',
            '',
        ];

        foreach ($yards->values() as $index => $yard) {
            $number = $index + 1;
            $options[$number] = $yard->id;
            $lines[] = $number . '. ' . $yard->name;
        }

        $lines[] = '';
        $lines[] = 'Введите номер площадки.';

        $this->setState($chat, self::STATE_GUEST_YARD, [
            'yard_options' => $options,
        ]);
        $this->sendMessage($chat->chat_id, implode("\n", $lines));

        return true;
    }

    private function handleState(TelegramBotChat $chat, string $text): void
    {
        $chat->refresh();

        match ($chat->state) {
            self::STATE_AWAITING_LOGIN => $this->handleLoginInput($chat, $text),
            self::STATE_AWAITING_PHONE => $this->handlePhoneVerification($chat, $text),
            self::STATE_GUEST_YARD => $this->handleGuestYard($chat, $text),
            self::STATE_GUEST_NAME => $this->handleGuestName($chat, $text),
            self::STATE_GUEST_PHONE => $this->handleGuestPhone($chat, $text),
            self::STATE_GUEST_POSITION => $this->handleGuestPosition($chat, $text),
            self::STATE_GUEST_COMPANY => $this->handleGuestCompany($chat, $text),
            self::STATE_GUEST_START_AT => $this->handleGuestStartAt($chat, $text),
            self::STATE_GUEST_PERMIT_KIND => $this->handlePermitKind($chat, $text),
            self::STATE_GUEST_END_AT => $this->handleGuestEndAt($chat, $text),
            self::STATE_GUEST_COMMENT => $this->handleGuestComment($chat, $text),
            default => $this->sendMessage($chat->chat_id, 'Не понял сообщение. Используйте /help для списка команд.'),
        };
    }

    private function handleLoginInput(TelegramBotChat $chat, string $text): void
    {
        $login = trim($text);
        $user = User::query()->whereRaw('LOWER(login) = ?', [Str::lower($login)])->first();

        if (!$user) {
            $this->sendMessage($chat->chat_id, 'Пользователь с таким логином не найден. Попробуйте ещё раз или нажмите /cancel.');

            return;
        }

        $digits = $this->digitsOnly($user->phone);

        if (strlen($digits) < 4) {
            $chat->forceFill([
                'user_id' => $user->id,
                'state' => null,
                'state_payload' => null,
            ])->save();

            $this->sendMessage($chat->chat_id, $this->buildLinkedGreeting($chat->fresh()));

            return;
        }

        $this->setState($chat, self::STATE_AWAITING_PHONE, [
            'candidate_user_id' => $user->id,
        ]);
        $this->sendMessage($chat->chat_id, 'Для подтверждения введите последние 4 цифры вашего номера телефона из профиля.');
    }

    private function handlePhoneVerification(TelegramBotChat $chat, string $text): void
    {
        $userId = (int) ($chat->state_payload['candidate_user_id'] ?? 0);
        $user = User::query()->find($userId);

        if (!$user) {
            $this->setState($chat, self::STATE_AWAITING_LOGIN);
            $this->sendMessage($chat->chat_id, 'Не удалось завершить привязку. Введите логин заново.');

            return;
        }

        $expected = substr($this->digitsOnly($user->phone), -4);
        $actual = substr($this->digitsOnly($text), -4);

        if ($expected === '' || $actual !== $expected) {
            $this->sendMessage($chat->chat_id, 'Код не совпал. Введите последние 4 цифры телефона ещё раз или нажмите /cancel.');

            return;
        }

        TelegramBotChat::query()
            ->where('user_id', $user->id)
            ->where('id', '!=', $chat->id)
            ->update(['user_id' => null, 'state' => null, 'state_payload' => null]);

        $chat->forceFill([
            'user_id' => $user->id,
            'state' => null,
            'state_payload' => null,
        ])->save();

        $this->sendMessage($chat->chat_id, $this->buildLinkedGreeting($chat->fresh()));
    }

    private function handleGuestYard(TelegramBotChat $chat, string $text): void
    {
        $options = $chat->state_payload['yard_options'] ?? [];
        $choice = (int) trim($text);
        $yardId = $options[$choice] ?? null;

        if (!$yardId || !Yard::query()->whereKey($yardId)->exists()) {
            $this->sendMessage($chat->chat_id, 'Некорректный номер площадки. Введите номер из списка.');

            return;
        }

        $payload = $chat->state_payload ?? [];
        $payload['yard_id'] = $yardId;
        unset($payload['yard_options']);

        $this->setState($chat, self::STATE_GUEST_NAME, $payload);
        $this->sendMessage($chat->chat_id, 'Введите ФИО гостя.');
    }

    private function handleGuestName(TelegramBotChat $chat, string $text): void
    {
        $value = trim($text);

        if ($value === '') {
            $this->sendMessage($chat->chat_id, 'ФИО гостя не может быть пустым.');

            return;
        }

        $this->advanceGuestPayload($chat, self::STATE_GUEST_PHONE, 'guest_full_name', $value, 'Введите телефон гостя.');
    }

    private function handleGuestPhone(TelegramBotChat $chat, string $text): void
    {
        $value = trim($text);

        if ($value === '') {
            $this->sendMessage($chat->chat_id, 'Телефон гостя не может быть пустым.');

            return;
        }

        $this->advanceGuestPayload($chat, self::STATE_GUEST_POSITION, 'guest_phone', $value, 'Введите должность или роль гостя.');
    }

    private function handleGuestPosition(TelegramBotChat $chat, string $text): void
    {
        $value = trim($text);

        if ($value === '') {
            $this->sendMessage($chat->chat_id, 'Должность гостя не может быть пустой.');

            return;
        }

        $this->advanceGuestPayload($chat, self::STATE_GUEST_COMPANY, 'guest_position', $value, 'Введите компанию гостя или отправьте - чтобы пропустить.');
    }

    private function handleGuestCompany(TelegramBotChat $chat, string $text): void
    {
        $value = trim($text);

        $this->advanceGuestPayload(
            $chat,
            self::STATE_GUEST_START_AT,
            'guest_company_name',
            $value === '-' ? null : $value,
            'Введите дату и время визита в формате ДД.ММ.ГГГГ ЧЧ:ММ или слово сейчас.'
        );
    }

    private function handleGuestStartAt(TelegramBotChat $chat, string $text): void
    {
        $date = $this->parseDateTime($text);

        if (!$date) {
            $this->sendMessage($chat->chat_id, 'Не удалось распознать дату. Используйте формат ДД.ММ.ГГГГ ЧЧ:ММ или слово сейчас.');

            return;
        }

        $payload = $chat->state_payload ?? [];
        $payload['visit_starts_at'] = $date->toDateTimeString();
        $this->setState($chat, self::STATE_GUEST_PERMIT_KIND, $payload);
        $this->sendMessage($chat->chat_id, "Выберите тип пропуска:\n1 - разовый\n2 - многоразовый");
    }

    private function handlePermitKind(TelegramBotChat $chat, string $text): void
    {
        $choice = trim(Str::lower($text));
        $permitKind = match ($choice) {
            '1', 'разовый', 'one_time' => GuestVisit::PERMIT_KIND_ONE_TIME,
            '2', 'многоразовый', 'multi_time' => GuestVisit::PERMIT_KIND_MULTI_TIME,
            default => null,
        };

        if (!$permitKind) {
            $this->sendMessage($chat->chat_id, 'Неверный тип пропуска. Ответьте 1 или 2.');

            return;
        }

        $payload = $chat->state_payload ?? [];
        $payload['permit_kind'] = $permitKind;

        if ($permitKind === GuestVisit::PERMIT_KIND_MULTI_TIME) {
            $this->setState($chat, self::STATE_GUEST_END_AT, $payload);
            $this->sendMessage($chat->chat_id, 'Введите дату окончания визита в формате ДД.ММ.ГГГГ ЧЧ:ММ.');

            return;
        }

        $this->setState($chat, self::STATE_GUEST_COMMENT, $payload);
        $this->sendMessage($chat->chat_id, 'Введите комментарий или отправьте - чтобы пропустить.');
    }

    private function handleGuestEndAt(TelegramBotChat $chat, string $text): void
    {
        $date = $this->parseDateTime($text);
        $payload = $chat->state_payload ?? [];

        if (!$date) {
            $this->sendMessage($chat->chat_id, 'Не удалось распознать дату окончания. Используйте формат ДД.ММ.ГГГГ ЧЧ:ММ.');

            return;
        }

        $startAt = isset($payload['visit_starts_at']) ? Carbon::parse($payload['visit_starts_at']) : null;

        if ($startAt && $date->lt($startAt)) {
            $this->sendMessage($chat->chat_id, 'Дата окончания не может быть раньше даты начала.');

            return;
        }

        $payload['visit_ends_at'] = $date->toDateTimeString();
        $this->setState($chat, self::STATE_GUEST_COMMENT, $payload);
        $this->sendMessage($chat->chat_id, 'Введите комментарий или отправьте - чтобы пропустить.');
    }

    private function handleGuestComment(TelegramBotChat $chat, string $text): void
    {
        $user = $chat->user;

        if (!$user) {
            $this->setState($chat, self::STATE_AWAITING_LOGIN);
            $this->sendMessage($chat->chat_id, 'Привязка пользователя потеряна. Используйте /start.');

            return;
        }

        $payload = $chat->state_payload ?? [];
        $payload['comment'] = trim($text) === '-' ? null : trim($text);
        $payload['host_name'] = $user->name;
        $payload['host_phone'] = $user->phone ?: 'не указан';
        $payload['source'] = GuestVisit::SOURCE_OPERATOR;
        $payload['vehicles'] = [];

        try {
            $guestVisit = $this->guestVisitService->create($payload, $user);

            $this->clearState($chat);
            $this->sendMessage($chat->chat_id, $this->buildGuestCreatedMessage($guestVisit));
        } catch (\Throwable $exception) {
            Log::warning('Telegram guest visit creation failed', [
                'chat_id' => $chat->chat_id,
                'user_id' => $user->id,
                'payload' => $payload,
                'error' => $exception->getMessage(),
            ]);

            $this->sendMessage($chat->chat_id, 'Не удалось создать гостевой визит: ' . $exception->getMessage());
        }
    }

    private function advanceGuestPayload(TelegramBotChat $chat, string $nextState, string $key, mixed $value, string $message): void
    {
        $payload = $chat->state_payload ?? [];
        $payload[$key] = $value;

        $this->setState($chat, $nextState, $payload);
        $this->sendMessage($chat->chat_id, $message);
    }

    private function setState(TelegramBotChat $chat, string $state, array $payload = []): void
    {
        $chat->forceFill([
            'state' => $state,
            'state_payload' => $payload,
            'last_interaction_at' => now(),
        ])->save();
    }

    private function clearState(TelegramBotChat $chat): void
    {
        $chat->forceFill([
            'state' => null,
            'state_payload' => null,
            'last_interaction_at' => now(),
        ])->save();
    }

    private function sendMessage(string $chatId, string $text): void
    {
        $this->telegramMessaging->sendText($chatId, $text);
    }

    private function buildLinkedGreeting(TelegramBotChat $chat): string
    {
        $name = $chat->user?->name ?? $chat->first_name ?? 'пользователь';

        return "Привязка активна для {$name}.\n\nДоступные команды:\n/guest - создать гостевой визит\n/cancel - отменить текущий диалог\n/unlink - отвязать Telegram от учётной записи\n/help - показать подсказку";
    }

    private function buildGuestCreatedMessage(GuestVisit $guestVisit): string
    {
        $guestVisit->loadMissing('yard:id,name');

        return implode("\n", [
            '<b>Гостевой визит создан</b>',
            '',
            '<b>ID:</b> ' . e((string) $guestVisit->id),
            '<b>Гость:</b> ' . e($guestVisit->guest_full_name),
            '<b>Объект:</b> ' . e($guestVisit->yard?->name ?? 'Не указан'),
            '<b>Начало:</b> ' . e(optional($guestVisit->visit_starts_at)->format('d.m.Y H:i') ?? ''),
            '<b>Тип:</b> ' . e($guestVisit->permit_kind === GuestVisit::PERMIT_KIND_MULTI_TIME ? 'Многоразовый' : 'Разовый'),
            '',
            'Когда гость прибудет на территорию, я отправлю отдельное уведомление.',
        ]);
    }

    private function parseDateTime(string $value): ?Carbon
    {
        $normalized = trim(Str::lower($value));

        if ($normalized === 'сейчас' || $normalized === 'now') {
            return now();
        }

        try {
            return Carbon::createFromFormat('d.m.Y H:i', trim($value), config('app.timezone'));
        } catch (\Throwable) {
            return null;
        }
    }

    private function digitsOnly(?string $value): string
    {
        return preg_replace('/\D+/', '', (string) $value) ?? '';
    }
}