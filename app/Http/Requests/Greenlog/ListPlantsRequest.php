<?php

namespace App\Http\Requests\Greenlog;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ListPlantsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('greenlog.view') ?? false;
    }

    public function rules(): array
    {
        return [
            'search' => ['nullable', 'string', 'max:255'],
            'category' => ['nullable', Rule::in(['indoor', 'outdoor'])],
            'status' => ['nullable', Rule::in(['alive', 'needs_care', 'written_off'])],
            'location_id' => ['nullable', 'integer', 'exists:greenlog_locations,id'],
        ];
    }
}
