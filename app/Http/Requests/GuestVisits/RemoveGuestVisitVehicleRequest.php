<?php

namespace App\Http\Requests\GuestVisits;

use Illuminate\Foundation\Http\FormRequest;

class RemoveGuestVisitVehicleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('guest_visits.update') ?? false;
    }

    public function rules(): array
    {
        return [
            'guest_visit_id' => ['required', 'integer', 'exists:guest_visits,id'],
            'vehicle_id' => ['required', 'integer', 'exists:guest_visit_vehicles,id'],
        ];
    }
}