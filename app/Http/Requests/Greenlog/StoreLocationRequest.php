<?php

namespace App\Http\Requests\Greenlog;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreLocationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('greenlog.manage_locations') ?? false;
    }

    public function rules(): array
    {
        return [
            'building' => ['nullable', 'string', 'max:255'],
            'floor' => ['nullable', 'string', 'max:255'],
            'room' => ['nullable', 'string', 'max:255'],
            'factory_zone' => ['nullable', 'string', 'max:255'],
            'sector' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'map_x' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'map_y' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'position_x' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'position_y' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'type' => ['nullable', Rule::in(['office', 'factory_zone', 'sector', 'room'])],
            'map_image_path' => ['nullable', 'string', 'max:1000'],
            'marker_size' => ['nullable', 'integer', 'min:6', 'max:32'],
            'map_shape' => ['nullable', Rule::in(['point', 'rectangle', 'polygon'])],
            'map_width' => ['nullable', 'numeric', 'min:1', 'max:100'],
            'map_height' => ['nullable', 'numeric', 'min:1', 'max:100'],
            'map_polygon' => ['nullable', 'array'],
            'map_polygon.*.x' => ['required_with:map_polygon', 'numeric', 'min:0', 'max:100'],
            'map_polygon.*.y' => ['required_with:map_polygon', 'numeric', 'min:0', 'max:100'],
            'parent_id' => ['nullable', 'integer', 'exists:greenlog_locations,id'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            if (
                ! $this->filled('building')
                && ! $this->filled('floor')
                && ! $this->filled('room')
                && ! $this->filled('factory_zone')
                && ! $this->filled('sector')
                && ! $this->filled('type')
                && ! $this->filled('description')
            ) {
                $validator->errors()->add('building', 'Заполните хотя бы одно поле локации.');
            }

            $shape = $this->input('map_shape');
            $polygon = $this->input('map_polygon');

            if ($shape === 'polygon' && (! is_array($polygon) || count($polygon) < 3)) {
                $validator->errors()->add('map_polygon', 'Для полигона нужно передать минимум 3 точки.');
            }
        });
    }
}
