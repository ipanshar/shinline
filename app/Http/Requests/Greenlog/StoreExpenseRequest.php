<?php

namespace App\Http\Requests\Greenlog;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('greenlog.manage_expenses') ?? false;
    }

    public function rules(): array
    {
        return [
            'plant_id' => ['nullable', 'integer', 'exists:greenlog_plants,id'],
            'location_id' => ['nullable', 'integer', 'exists:greenlog_locations,id'],
            'category' => ['required', Rule::in(['purchase', 'pot', 'fertilizer', 'soil', 'watering', 'service', 'other'])],
            'amount' => ['required', 'numeric', 'gt:0'],
            'expense_date' => ['required', 'date'],
            'description' => ['required', 'string', 'max:2000'],
            'document_number' => ['nullable', 'string', 'max:255'],
        ];
    }
}
