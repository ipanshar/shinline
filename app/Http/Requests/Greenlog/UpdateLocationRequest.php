<?php

namespace App\Http\Requests\Greenlog;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateLocationRequest extends FormRequest
{
    private const MAP_SHAPES = [
        'point',
        'circle',
        'square',
        'rectangle',
        'polygon',
        'line',
        'flower_bed',
        'checkpoint',
    ];

    public function authorize(): bool
    {
        return $this->user()?->hasPermission('greenlog.manage_locations') ?? false;
    }

    public function rules(): array
    {
        return [
            'building' => ['sometimes', 'nullable', 'string', 'max:255'],
            'floor' => ['sometimes', 'nullable', 'string', 'max:255'],
            'room' => ['sometimes', 'nullable', 'string', 'max:255'],
            'factory_zone' => ['sometimes', 'nullable', 'string', 'max:255'],
            'sector' => ['sometimes', 'nullable', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'map_x' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'map_y' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'position_x' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'position_y' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'type' => ['sometimes', 'nullable', Rule::in(['office', 'factory_zone', 'sector', 'room'])],
            'map_image_path' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'marker_size' => ['sometimes', 'nullable', 'integer', 'min:6', 'max:32'],
            'map_shape' => ['sometimes', 'nullable', Rule::in(self::MAP_SHAPES)],
            'map_style' => ['sometimes', 'nullable', 'array'],
            'map_style.fill' => ['sometimes', 'nullable', 'string', 'max:32'],
            'map_style.stroke' => ['sometimes', 'nullable', 'string', 'max:32'],
            'map_style.strokeWidth' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:20'],
            'map_style.opacity' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:1'],
            'map_style.radius' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'map_style.width' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'map_style.height' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'map_width' => ['sometimes', 'nullable', 'numeric', 'min:1', 'max:100'],
            'map_height' => ['sometimes', 'nullable', 'numeric', 'min:1', 'max:100'],
            'map_polygon' => ['sometimes', 'nullable', 'array'],
            'map_polygon.*.x' => ['required_with:map_polygon', 'numeric', 'min:0', 'max:100'],
            'map_polygon.*.y' => ['required_with:map_polygon', 'numeric', 'min:0', 'max:100'],
            'parent_id' => ['sometimes', 'nullable', 'integer', 'exists:greenlog_locations,id'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            if ($this->all() === []) {
                $validator->errors()->add('payload', 'Для обновления нужно передать хотя бы одно поле.');
            }

            $shape = $this->input('map_shape');
            $polygon = $this->input('map_polygon');

            if ($shape === 'polygon' && (! is_array($polygon) || count($polygon) < 3)) {
                $validator->errors()->add('map_polygon', 'Для полигона нужно передать минимум 3 точки.');
            }

            if ($shape === 'line' && (! is_array($polygon) || count($polygon) !== 2)) {
                $validator->errors()->add('map_polygon', 'Для линии нужно передать ровно 2 точки.');
            }
        });
    }
}
