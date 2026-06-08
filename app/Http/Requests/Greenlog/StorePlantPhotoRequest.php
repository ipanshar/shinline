<?php

namespace App\Http\Requests\Greenlog;

use App\Rules\Greenlog\ValidPlantPhotoUpload;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePlantPhotoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('greenlog.upload_photos') ?? false;
    }

    public function rules(): array
    {
        return [
            'photo' => ['required', 'file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240', new ValidPlantPhotoUpload()],
            'type' => ['nullable', Rule::in(['plant', 'location'])],
            'description' => ['nullable', 'string', 'max:2000'],
        ];
    }

    public function messages(): array
    {
        return [
            'photo.required' => 'Выберите файл для загрузки',
            'photo.file' => 'Выберите файл для загрузки',
            'photo.image' => 'Поддерживаются только изображения.',
            'photo.mimes' => 'Поддерживаются только JPG, PNG и WEBP до 10 МБ',
            'photo.max' => 'Поддерживаются только JPG, PNG и WEBP до 10 МБ',
        ];
    }
}
