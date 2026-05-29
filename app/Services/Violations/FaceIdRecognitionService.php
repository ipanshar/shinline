<?php

namespace App\Services\Violations;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;

class FaceIdRecognitionService
{
    /**
     * @return array{ok: bool, error: ?string, error_type: ?string, payload: ?array<string, mixed>}
     */
    public function recognize(UploadedFile $file, array $options = []): array
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
                ->post($this->searchUrl(), $this->buildSearchPayload($options));
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
        $loading = (bool) ($payload['loading'] ?? false);
        if ($errorMessage !== '') {
            return [
                'ok' => false,
                'error' => $errorMessage,
                'error_type' => (! $response->successful() || $loading) ? 'service' : 'validation',
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

    /**
     * @return array{ok: bool, error: ?string, http_status: ?int}
     */
    public function requestRuntimeRebuild(): array
    {
        try {
            $response = Http::timeout(3)
                ->connectTimeout(1)
                ->acceptJson()
                ->post($this->rebuildUrl());
        } catch (\Throwable $exception) {
            return [
                'ok' => false,
                'error' => $exception->getMessage(),
                'http_status' => null,
            ];
        }

        if (! $response->successful()) {
            return [
                'ok' => false,
                'error' => 'Face ID runtime rebuild failed with HTTP ' . $response->status() . '.',
                'http_status' => $response->status(),
            ];
        }

        return [
            'ok' => true,
            'error' => null,
            'http_status' => $response->status(),
        ];
    }

    /**
     * @return array{ok: bool, error: ?string, http_status: ?int, payload: ?array<string, mixed>}
     */
    public function getRuntimeStatus(): array
    {
        try {
            $response = Http::timeout(3)
                ->connectTimeout(1)
                ->acceptJson()
                ->get($this->statusUrl());
        } catch (\Throwable $exception) {
            return [
                'ok' => false,
                'error' => $exception->getMessage(),
                'http_status' => null,
                'payload' => null,
            ];
        }

        $payload = $response->json();
        if (! is_array($payload)) {
            return [
                'ok' => false,
                'error' => 'Face ID runtime status returned an empty or invalid payload.',
                'http_status' => $response->status(),
                'payload' => null,
            ];
        }

        if (! $response->successful()) {
            return [
                'ok' => false,
                'error' => 'Face ID runtime status failed with HTTP ' . $response->status() . '.',
                'http_status' => $response->status(),
                'payload' => $payload,
            ];
        }

        return [
            'ok' => true,
            'error' => null,
            'http_status' => $response->status(),
            'payload' => $payload,
        ];
    }

    /**
     * @return array{ok: bool, error: ?string, http_status: ?int, timed_out: bool, business_key_found: bool, payload: ?array<string, mixed>}
     */
    public function requestRuntimeRebuildAndWait(?string $businessKey = null): array
    {
        $rebuild = $this->requestRuntimeRebuild();
        if (! ($rebuild['ok'] ?? false)) {
            return [
                'ok' => false,
                'error' => $rebuild['error'] ?? 'Face ID runtime rebuild request failed.',
                'http_status' => $rebuild['http_status'] ?? null,
                'timed_out' => false,
                'business_key_found' => false,
                'payload' => null,
            ];
        }

        return $this->waitForRuntimeReady($businessKey, $rebuild['http_status'] ?? null);
    }

    private function searchUrl(): string
    {
        return rtrim((string) config('services.faceid.base_url', 'http://127.0.0.1:8008'), '/') . '/api/search';
    }

    private function rebuildUrl(): string
    {
        return rtrim((string) config('services.faceid.base_url', 'http://127.0.0.1:8008'), '/') . '/api/rebuild';
    }

    private function statusUrl(): string
    {
        return rtrim((string) config('services.faceid.base_url', 'http://127.0.0.1:8008'), '/') . '/api/status';
    }

    /**
     * @param array<string, mixed> $options
     * @return array<string, string>
     */
    private function buildSearchPayload(array $options): array
    {
        $payload = [];
        $personKinds = array_values(array_filter(
            array_map(
                static fn ($value) => is_string($value) ? trim($value) : '',
                (array) ($options['person_kinds'] ?? [])
            ),
            static fn ($value) => $value !== ''
        ));

        if ($personKinds !== []) {
            $payload['person_kinds'] = implode(',', $personKinds);
        }

        return $payload;
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

    /**
     * @return array{ok: bool, error: ?string, http_status: ?int, timed_out: bool, business_key_found: bool, payload: ?array<string, mixed>}
     */
    private function waitForRuntimeReady(?string $businessKey, ?int $httpStatus): array
    {
        $timeoutMs = max(1000, (int) config('services.faceid.rebuild_wait_timeout_ms', 15000));
        $pollMs = max(100, (int) config('services.faceid.rebuild_wait_poll_interval_ms', 250));
        $deadline = microtime(true) + ($timeoutMs / 1000);
        $lastPayload = null;
        $lastError = null;
        $businessKeyFound = false;

        do {
            $status = $this->getRuntimeStatus();
            if ($status['ok'] ?? false) {
                $payload = is_array($status['payload'] ?? null) ? $status['payload'] : null;
                if ($payload !== null) {
                    $lastPayload = $payload;
                    $lastError = null;
                    $loading = (bool) ($payload['loading'] ?? false);
                    $ready = (bool) ($payload['ready'] ?? true);
                    $businessKeyFound = $businessKey === null || $this->statusContainsBusinessKey($payload, $businessKey);

                    if (! $loading && $ready && $businessKeyFound) {
                        return [
                            'ok' => true,
                            'error' => null,
                            'http_status' => $status['http_status'] ?? $httpStatus,
                            'timed_out' => false,
                            'business_key_found' => true,
                            'payload' => $payload,
                        ];
                    }

                    if ($businessKey !== null && $loading && $ready && $businessKeyFound) {
                        return [
                            'ok' => true,
                            'error' => null,
                            'http_status' => $status['http_status'] ?? $httpStatus,
                            'timed_out' => false,
                            'business_key_found' => true,
                            'payload' => $payload,
                        ];
                    }
                }
            } else {
                $lastError = $status['error'] ?? null;
            }

            usleep($pollMs * 1000);
        } while (microtime(true) < $deadline);

        return [
            'ok' => false,
            'error' => $lastError ?: 'Timed out while waiting for Face ID runtime rebuild to finish.',
            'http_status' => $httpStatus,
            'timed_out' => true,
            'business_key_found' => $businessKeyFound,
            'payload' => $lastPayload,
        ];
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function statusContainsBusinessKey(array $payload, string $businessKey): bool
    {
        $people = $payload['people'] ?? null;
        if (! is_array($people)) {
            return false;
        }

        foreach ($people as $person) {
            if (! is_array($person)) {
                continue;
            }

            $profile = is_array($person['profile'] ?? null) ? $person['profile'] : [];
            $candidateBusinessKey = $profile['businessKey'] ?? null;
            if (is_string($candidateBusinessKey) && trim($candidateBusinessKey) === $businessKey) {
                return true;
            }
        }

        return false;
    }
}
