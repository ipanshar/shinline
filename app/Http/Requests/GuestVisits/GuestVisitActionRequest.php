<?php

namespace App\Http\Requests\GuestVisits;

use Illuminate\Foundation\Http\FormRequest;

class GuestVisitActionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return false;
    }

    public function rules(): array
    {
        return [
            'id' => ['required', 'integer', 'exists:guest_visits,id'],
        ];
    }
}