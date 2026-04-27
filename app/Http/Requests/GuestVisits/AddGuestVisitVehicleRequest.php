<?php

namespace App\Http\Requests\GuestVisits;

use Illuminate\Foundation\Http\FormRequest;

class AddGuestVisitVehicleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('guest_visits.update') ?? false;
    }

    public function rules(): array
    {
        return [
            'guest_visit_id' => ['required', 'integer', 'exists:guest_visits,id'],
            'plate_number' => ['required', 'string', 'max:50'],
            'brand' => ['nullable', 'string', 'max:255'],
            'model' => ['nullable', 'string', 'max:255'],
            'color' => ['nullable', 'string', 'max:50'],
            'comment' => ['nullable', 'string', 'max:1000'],
        ];
    }
}