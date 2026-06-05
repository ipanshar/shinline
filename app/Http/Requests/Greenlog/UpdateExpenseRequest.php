<?php

namespace App\Http\Requests\Greenlog;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateExpenseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('greenlog.manage_expenses') ?? false;
    }

    public function rules(): array
    {
        return [
            'plant_id' => ['sometimes', 'nullable', 'integer', 'exists:greenlog_plants,id'],
            'location_id' => ['sometimes', 'nullable', 'integer', 'exists:greenlog_locations,id'],
            'category' => ['sometimes', 'required', Rule::in(['purchase', 'pot', 'fertilizer', 'soil', 'watering', 'service', 'other'])],
            'amount' => ['sometimes', 'required', 'numeric', 'gt:0'],
            'expense_date' => ['sometimes', 'required', 'date'],
            'description' => ['sometimes', 'required', 'string', 'max:2000'],
            'document_number' => ['sometimes', 'nullable', 'string', 'max:255'],
        ];
    }
}
