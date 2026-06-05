<?php

namespace App\Http\Requests\Greenlog;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePlantRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('greenlog.manage_plants') ?? false;
    }

    public function rules(): array
    {
        return [
            'inventory_number' => ['required', 'string', 'max:255'],
            'name' => ['required', 'string', 'max:255'],
            'biological_name' => ['nullable', 'string', 'max:255'],
            'category' => ['required', Rule::in(['indoor', 'outdoor'])],
            'status' => ['nullable', Rule::in(['alive', 'needs_care', 'written_off'])],
            'location_id' => ['nullable', 'integer', 'exists:greenlog_locations,id'],
            'species_id' => ['nullable', 'integer', 'exists:greenlog_plant_species,id'],
            'quantity' => ['nullable', 'integer', 'min:1'],
            'unit_cost' => ['nullable', 'numeric', 'min:0'],
            'watering_frequency_days' => ['nullable', 'integer', 'min:1'],
            'fertilizing_frequency_days' => ['nullable', 'integer', 'min:1'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
