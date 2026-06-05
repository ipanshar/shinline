<?php

namespace App\Http\Requests\Greenlog;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCareTaskRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('greenlog.manage_care_tasks') ?? false;
    }

    public function rules(): array
    {
        return [
            'plant_id' => ['sometimes', 'nullable', 'integer', 'exists:greenlog_plants,id'],
            'type' => ['sometimes', 'required', Rule::in(['watering', 'fertilizing', 'treatment', 'inspection', 'other'])],
            'due_at' => ['sometimes', 'required', 'date'],
            'status' => ['sometimes', 'nullable', Rule::in(['pending', 'done', 'overdue'])],
            'completed_at' => ['sometimes', 'nullable', 'date'],
            'comment' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ];
    }
}
