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
            'status' => ['nullable', Rule::in(['active', 'alive', 'needs_care', 'written_off'])],
            'location_id' => ['nullable', 'integer', 'exists:greenlog_locations,id'],
            'species_id' => ['nullable', 'integer', 'exists:greenlog_plant_species,id'],
            'quantity' => ['nullable', 'integer', 'min:1'],
            'unit_cost' => ['nullable', 'numeric', 'min:0'],
            'branch' => ['nullable', 'string', 'max:255'],
            'office' => ['nullable', 'string', 'max:255'],
            'room' => ['nullable', 'string', 'max:255'],
            'responsible_person' => ['nullable', 'string', 'max:255'],
            'plant_type' => ['nullable', 'string', 'max:255'],
            'height_value' => ['nullable', 'numeric', 'min:0'],
            'height_unit' => ['nullable', 'string', 'max:20'],
            'trunk_diameter_value' => ['nullable', 'numeric', 'min:0'],
            'trunk_diameter_unit' => ['nullable', 'string', 'max:20'],
            'condition_text' => ['nullable', 'string', 'max:255'],
            'gps_coordinates' => ['nullable', 'string', 'max:255'],
            'last_inspection_date' => ['nullable', 'date'],
            'condition_notes' => ['nullable', 'string'],
            'acquisition_date' => ['nullable', 'date'],
            'last_inventory_date' => ['nullable', 'date'],
            'watering_frequency_days' => ['nullable', 'integer', 'min:1'],
            'fertilizing_frequency_days' => ['nullable', 'integer', 'min:1'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
