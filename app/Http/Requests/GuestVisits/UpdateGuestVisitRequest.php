<?php

namespace App\Http\Requests\GuestVisits;

use App\Models\GuestVisit;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateGuestVisitRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('guest_visits.update') ?? false;
    }

    public function rules(): array
    {
        return [
            'id' => ['required', 'integer', 'exists:guest_visits,id'],
            'yard_id' => ['required', 'integer', 'exists:yards,id'],
            'guest_full_name' => ['required', 'string', 'max:255'],
            'guest_iin' => ['nullable', 'string', 'max:20'],
            'guest_company_name' => ['nullable', 'string', 'max:255'],
            'guest_position' => ['required', 'string', 'max:255'],
            'guest_phone' => ['required', 'string', 'max:50'],
            'host_name' => ['required', 'string', 'max:255'],
            'host_phone' => ['required', 'string', 'max:50'],
            'visit_starts_at' => ['required', 'date'],
            'visit_ends_at' => ['nullable', 'date', 'after_or_equal:visit_starts_at'],
            'permit_kind' => ['required', Rule::in([GuestVisit::PERMIT_KIND_ONE_TIME, GuestVisit::PERMIT_KIND_MULTI_TIME])],
            'comment' => ['nullable', 'string', 'max:1000'],
            'vehicles' => ['nullable', 'array'],
            'vehicles.*.id' => ['nullable', 'integer', 'exists:guest_visit_vehicles,id'],
            'vehicles.*.plate_number' => ['required_with:vehicles', 'string', 'max:50'],
            'vehicles.*.brand' => ['nullable', 'string', 'max:255'],
            'vehicles.*.model' => ['nullable', 'string', 'max:255'],
            'vehicles.*.color' => ['nullable', 'string', 'max:50'],
            'vehicles.*.comment' => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            if ($this->input('permit_kind') === GuestVisit::PERMIT_KIND_MULTI_TIME && !$this->filled('visit_ends_at')) {
                $validator->errors()->add('visit_ends_at', 'Для многоразового гостевого пропуска укажите дату окончания.');
            }
        });
    }
}