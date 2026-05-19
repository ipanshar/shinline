<?php

namespace App\Services\Violations;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;

class FaceIdRecognitionService
{
    /**
     * @return array{ok: bool, error: ?string, error_type: ?string, payload: ?array<string, mixed>}
     */
    public function recognize(UploadedFile $file): array
    {
        $sourcePath = $this->resolveUploadedFilePath($file);

        if ($sourcePath === null) {
            return [
                'ok' => false,
                'error' => 'Не удалось прочитать фото для распознавания на сервере.',
                'error_type' => 'validation',
                'payload' => null,
            ];
        }

        $stream = fopen($sourcePath, 'rb');

        if ($stream === false) {
            return [
                'ok' => false,
                'error' => 'Не удалось открыть фото для распознавания.',
                'error_type' => 'validation',
                'payload' => null,
            ];
        }

        try {
            $response = Http::timeout((int) config('services.faceid.timeout', 12))
                ->connectTimeout((int) config('services.faceid.connect_timeout', 5))
                ->attach(
                    'file',
                    $stream,
                    $file->getClientOriginalName(),
                    [
                        'Content-Type' => (string) ($file->getMimeType() ?: $file->getClientMimeType() ?: 'application/octet-stream'),
                    ]
                )
                ->post($this->searchUrl());
        } catch (\Throwable $exception) {
            return [
                'ok' => false,
                'error' => 'Face ID сервис сейчас недоступен. Попробуйте ещё раз.',
                'error_type' => 'service',
                'payload' => null,
            ];
        } finally {
            fclose($stream);
        }

        $payload = $response->json();
        if (! is_array($payload)) {
            return [
                'ok' => false,
                'error' => 'Face ID сервис вернул пустой или некорректный ответ.',
                'error_type' => 'service',
                'payload' => null,
            ];
        }

        $errorMessage = trim((string) ($payload['error'] ?? $payload['message'] ?? ''));
        if ($errorMessage !== '') {
            return [
                'ok' => false,
                'error' => $errorMessage,
                'error_type' => $response->successful() ? 'validation' : 'service',
                'payload' => $payload,
            ];
        }

        if (! $response->successful()) {
            return [
                'ok' => false,
                'error' => 'Face ID сервис вернул ошибку (' . $response->status() . ').',
                'error_type' => 'service',
                'payload' => $payload,
            ];
        }

        return [
            'ok' => true,
            'error' => null,
            'error_type' => null,
            'payload' => $payload,
        ];
    }

    private function searchUrl(): string
    {
        return rtrim((string) config('services.faceid.base_url', 'http://127.0.0.1:8008'), '/') . '/api/search';
    }

    private function resolveUploadedFilePath(UploadedFile $file): ?string
    {
        $candidates = array_filter([
            $file->getRealPath() ?: null,
            method_exists($file, 'path') ? $file->path() : null,
            $file->getPathname() ?: null,
        ], fn ($value) => is_string($value) && trim($value) !== '');

        foreach ($candidates as $candidate) {
            if (is_file($candidate)) {
                return $candidate;
            }
        }

        return null;
    }
}