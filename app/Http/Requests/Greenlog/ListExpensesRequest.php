<?php

namespace App\Http\Requests\Greenlog;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ListExpensesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('greenlog.view') ?? false;
    }

    public function rules(): array
    {
        return [
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'category' => ['nullable', Rule::in(['purchase', 'pot', 'fertilizer', 'soil', 'watering', 'service', 'other'])],
            'plant_id' => ['nullable', 'integer', 'exists:greenlog_plants,id'],
            'location_id' => ['nullable', 'integer', 'exists:greenlog_locations,id'],
        ];
    }
}
