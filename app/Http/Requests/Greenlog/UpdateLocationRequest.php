<?php

namespace App\Http\Requests\Greenlog;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateLocationRequest extends FormRequest
{
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
            'parent_id' => ['sometimes', 'nullable', 'integer', 'exists:greenlog_locations,id'],
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
