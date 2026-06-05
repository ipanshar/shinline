<?php

namespace App\Http\Requests\Greenlog;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ListCareTasksRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('greenlog.view') ?? false;
    }

    public function rules(): array
    {
        return [
            'plant_id' => ['nullable', 'integer', 'exists:greenlog_plants,id'],
            'status' => ['nullable', Rule::in(['pending', 'done', 'overdue'])],
            'type' => ['nullable', Rule::in(['watering', 'fertilizing', 'treatment', 'inspection', 'other'])],
        ];
    }
}
