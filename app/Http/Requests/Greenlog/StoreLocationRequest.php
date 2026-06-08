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
        });
    }
}
