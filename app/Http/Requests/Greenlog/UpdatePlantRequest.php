<?php

namespace App\Http\Requests\Greenlog;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePlantRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('greenlog.manage_plants') ?? false;
    }

    public function rules(): array
    {
        return [
            'inventory_number' => ['sometimes', 'required', 'string', 'max:255'],
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'biological_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'category' => ['sometimes', 'required', Rule::in(['indoor', 'outdoor'])],
            'status' => ['sometimes', 'nullable', Rule::in(['alive', 'needs_care', 'written_off'])],
            'location_id' => ['sometimes', 'nullable', 'integer', 'exists:greenlog_locations,id'],
            'species_id' => ['sometimes', 'nullable', 'integer', 'exists:greenlog_plant_species,id'],
            'quantity' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'unit_cost' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'watering_frequency_days' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'fertilizing_frequency_days' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            if ($this->all() === []) {
                $validator->errors()->add('payload', 'Для обновления нужно передать хотя бы одно поле.');
            }
        });
    }
}
