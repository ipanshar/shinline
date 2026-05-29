<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Access\DahuaTerminalAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;

class DahuaTerminalAccessController extends Controller
{
    public function __construct(private DahuaTerminalAccessService $terminalAccess)
    {
    }

    public function recognize(Request $request): JsonResponse
    {
        $secretError = $this->validateSecret($request);
        if ($secretError instanceof JsonResponse) {
            return $secretError;
        }

        $resolvedImage = $this->resolveIncomingImage($request);
        if (($resolvedImage['file'] ?? null) === null) {
            return response()->json([
                'message' => $resolvedImage['error'] ?? 'Снимок от терминала не был получен.',
            ], 422);
        }

        /** @var UploadedFile $file */
        $file = $resolvedImage['file'];
        $tempPath = $resolvedImage['temp_path'] ?? null;

        try {
            $result = $this->terminalAccess->recognizeAndAuthorize($file, [
                'device_key' => (string) ($request->input('device_key') ?? $request->input('serial_no') ?? ''),
                'device_name' => (string) ($request->input('device_name') ?? $request->input('terminal_name') ?? ''),
                'device_ip' => (string) ($request->input('device_ip') ?? $request->ip() ?? ''),
            ]);
        } finally {
            if (is_string($tempPath) && $tempPath !== '' && is_file($tempPath)) {
                @unlink($tempPath);
            }
        }

        if (! ($result['ok'] ?? false)) {
            return response()->json([
                'message' => $result['error'] ?? 'Не удалось обработать снимок от терминала.',
            ], (int) ($result['status'] ?? 500));
        }

        return response()->json([
            'data' => $result['payload'],
        ], (int) ($result['status'] ?? 200));
    }

    private function validateSecret(Request $request): ?JsonResponse
    {
        $expectedSecret = trim((string) config('services.dahua_terminal.secret', ''));
        if ($expectedSecret === '') {
            return null;
        }

        $providedSecret = trim((string) ($request->header('X-Dahua-Terminal-Secret', $request->input('secret', ''))));
        if ($providedSecret !== '' && hash_equals($expectedSecret, $providedSecret)) {
            return null;
        }

        return response()->json([
            'message' => 'Невалидный секрет терминала.',
        ], 401);
    }

    /**
     * @return array{file: ?UploadedFile, temp_path: ?string, error: ?string}
     */
    private function resolveIncomingImage(Request $request): array
    {
        foreach (['photo', 'image', 'file', 'snapshot'] as $field) {
            $file = $request->file($field);
            if ($file instanceof UploadedFile) {
                return [
                    'file' => $file,
                    'temp_path' => null,
                    'error' => null,
                ];
            }
        }

        $base64Payload = $this->extractBase64Payload($request);
        if ($base64Payload === null) {
            return [
                'file' => null,
                'temp_path' => null,
                'error' => 'Терминал не прислал фото ни как файл, ни как base64-строку.',
            ];
        }

        return $this->uploadedFileFromBase64($base64Payload);
    }

    private function extractBase64Payload(Request $request): ?string
    {
        $payload = $request->all();

        foreach ([
            'image_base64',
            'photo_base64',
            'snapshot_base64',
            'picture_base64',
            'alarm_picture_base64',
            'event.image_base64',
            'event.snapshot_base64',
            'alarmPictures.0.base64',
            'alarmPictures.0.data',
            'alarmPictures.0.content',
        ] as $field) {
            $value = data_get($payload, $field);
            $encoded = $this->base64FromValue($value);
            if ($encoded !== null) {
                return $encoded;
            }
        }

        $alarmPictures = data_get($payload, 'alarmPictures');
        if (is_array($alarmPictures)) {
            foreach ($alarmPictures as $picture) {
                $encoded = $this->base64FromValue($picture);
                if ($encoded !== null) {
                    return $encoded;
                }
            }
        }

        return null;
    }

    private function base64FromValue(mixed $value): ?string
    {
        if (is_string($value) && trim($value) !== '') {
            return trim($value);
        }

        if (! is_array($value)) {
            return null;
        }

        foreach (['base64', 'data', 'content', 'pictureBase64'] as $key) {
            $candidate = $value[$key] ?? null;
            if (is_string($candidate) && trim($candidate) !== '') {
                return trim($candidate);
            }
        }

        return null;
    }

    /**
     * @return array{file: ?UploadedFile, temp_path: ?string, error: ?string}
     */
    private function uploadedFileFromBase64(string $payload): array
    {
        $payload = trim($payload);
        $mimeType = 'image/jpeg';

        if (preg_match('/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/', $payload, $matches) === 1) {
            $mimeType = strtolower($matches[1]);
            $payload = $matches[2];
        }

        $binary = base64_decode($payload, true);
        if ($binary === false || $binary === '') {
            return [
                'file' => null,
                'temp_path' => null,
                'error' => 'Base64-снимок терминала повреждён или пустой.',
            ];
        }

        if (strlen($binary) > 15 * 1024 * 1024) {
            return [
                'file' => null,
                'temp_path' => null,
                'error' => 'Снимок терминала превышает лимит 15 МБ.',
            ];
        }

        $extension = match ($mimeType) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/heic' => 'heic',
            'image/heif' => 'heif',
            default => 'jpg',
        };

        $tempPath = tempnam(sys_get_temp_dir(), 'dahua-terminal-');
        if ($tempPath === false) {
            return [
                'file' => null,
                'temp_path' => null,
                'error' => 'Сервер не смог подготовить временный файл для снимка терминала.',
            ];
        }

        file_put_contents($tempPath, $binary);

        return [
            'file' => new UploadedFile(
                $tempPath,
                'dahua-terminal.' . $extension,
                $mimeType,
                null,
                true,
            ),
            'temp_path' => $tempPath,
            'error' => null,
        ];
    }
}