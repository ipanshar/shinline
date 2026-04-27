<?php

namespace App\Http\Requests\GuestVisits;

use App\Models\GuestVisit;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class GuestVisitListRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('guest_visits.view') ?? false;
    }

    public function rules(): array
    {
        return [
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'yard_id' => ['nullable', 'integer', 'exists:yards,id'],
            'workflow_status' => ['nullable', Rule::in(['all', GuestVisit::STATUS_ACTIVE, GuestVisit::STATUS_CLOSED, GuestVisit::STATUS_CANCELED])],
            'permit_kind' => ['nullable', Rule::in(['all', GuestVisit::PERMIT_KIND_ONE_TIME, GuestVisit::PERMIT_KIND_MULTI_TIME])],
            'has_vehicle' => ['nullable', Rule::in(['all', 'true', 'false', true, false, 1, 0, '1', '0'])],
            'search' => ['nullable', 'string', 'max:255'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
        ];
    }
}