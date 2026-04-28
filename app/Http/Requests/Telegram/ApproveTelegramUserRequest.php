<?php

namespace App\Http\Requests\Telegram;

use Illuminate\Foundation\Http\FormRequest;

class ApproveTelegramUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('telegram_users.approve') ?? false;
    }

    public function rules(): array
    {
        return [
            'yard_ids' => ['required', 'array', 'min:1'],
            'yard_ids.*' => ['integer', 'exists:yards,id'],
        ];
    }
}
