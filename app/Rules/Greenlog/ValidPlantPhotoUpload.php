<?php

namespace App\Rules\Greenlog;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Http\UploadedFile;

class ValidPlantPhotoUpload implements ValidationRule
{
    private const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

    private const BLOCKED_EXTENSIONS = ['heic', 'heif'];

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! $value instanceof UploadedFile) {
            $fail('Файл не удалось распознать.');

            return;
        }

        if (! $value->isValid()) {
            $fail('Файл не удалось загрузить.');

            return;
        }

        $extension = strtolower((string) $value->getClientOriginalExtension());
        $mimeType = strtolower((string) $value->getClientMimeType());

        if (in_array($extension, self::BLOCKED_EXTENSIONS, true) || str_contains($mimeType, 'heic') || str_contains($mimeType, 'heif')) {
            $fail('Формат HEIC/HEIF пока не поддерживается. Загрузите JPG, PNG или WEBP.');

            return;
        }

        if (
            ! in_array($extension, self::ALLOWED_EXTENSIONS, true)
            && ! in_array($mimeType, ['image/jpeg', 'image/png', 'image/webp'], true)
        ) {
            $fail('Поддерживаются только JPG, PNG и WEBP до 10 МБ');
        }
    }
}
