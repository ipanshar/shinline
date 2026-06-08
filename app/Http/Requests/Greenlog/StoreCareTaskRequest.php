<?php

namespace App\Http\Requests\Greenlog;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCareTaskRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('greenlog.manage_care_tasks') ?? false;
    }

    public function rules(): array
    {
        return [
            'plant_id' => ['nullable', 'integer', 'exists:greenlog_plants,id'],
            'type' => ['required', Rule::in(['watering', 'fertilizing', 'treatment', 'inspection', 'other'])],
            'due_at' => ['required', 'date'],
            'status' => ['nullable', Rule::in(['pending', 'done', 'overdue'])],
            'completed_at' => ['nullable', 'date'],
            'comment' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
