<?php

namespace App\Http\Requests\Telegram;

use Illuminate\Foundation\Http\FormRequest;

class RejectTelegramUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('telegram_users.approve') ?? false;
    }

    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'max:255'],
        ];
    }
}
