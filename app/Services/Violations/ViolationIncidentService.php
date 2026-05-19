<?php

namespace App\Services\Violations;

use App\Models\TelegramBotChat;
use App\Models\User;
use App\Models\ViolationEvidence;
use App\Models\ViolationIncident;
use App\Models\ViolationType;
use App\Services\TelegramMessagingService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ViolationIncidentService
{
    public function __construct(private TelegramMessagingService $telegramMessaging)
    {
    }

    /**
     * @param array<int, UploadedFile> $files
     */
    public function createManualTelegramIncident(User $user, TelegramBotChat $chat, array $payload, array $files): ViolationIncident
    {
        return DB::transaction(function () use ($user, $chat, $payload, $files) {
            $type = ViolationType::query()
                ->with('category')
                ->whereKey((int) $payload['type_id'])
                ->where('is_active', true)
                ->firstOrFail();

            $occurredAt = Carbon::parse((string) $payload['occurred_at']);
            $reporterName = $chat->display_full_name ?: $user->name;

            $incident = ViolationIncident::query()->create([
                'source' => 'telegram_miniapp',
                'workflow_status' => ViolationIncident::STATUS_PENDING_REVIEW,
                'recognition_status' => ViolationIncident::RECOGNITION_MANUAL,
                'identity_source' => 'manual',
                'occurred_at' => $occurredAt,
                'reported_by_user_id' => $user->id,
                'reported_by_chat_id' => $chat->chat_id,
                'reported_by_name' => $reporterName,
                'category_id' => $type->category_id,
                'type_id' => $type->id,
                'category_key' => $type->category->key,
                'category_name' => $type->category->name,
                'type_key' => $type->key,
                'type_name' => $type->name,
                'description' => $this->nullableTrim($payload['description'] ?? null),
                'location_label' => $this->nullableTrim($payload['location_label'] ?? null),
                'employee_full_name' => trim((string) $payload['manual_full_name']),
                'employee_normalized_full_name' => Str::lower(trim((string) $payload['manual_full_name'])),
                'employee_department' => $this->nullableTrim($payload['manual_department'] ?? null),
                'employee_position' => $this->nullableTrim($payload['manual_position'] ?? null),
                'is_manual_identity' => true,
                'meta' => [
                    'capture_source' => 'telegram_miniapp',
                    'chat_id' => $chat->chat_id,
                ],
            ]);

            $evidences = collect($files)->values()->map(
                fn (UploadedFile $file, int $index) => $this->storeEvidence($incident, $file, $index)
            );

            $this->syncIncidentEvidenceSnapshot($incident, $evidences);

            $incident->statusHistory()->create([
                'from_status' => ViolationIncident::STATUS_DRAFT_PROCESSING,
                'to_status' => ViolationIncident::STATUS_PENDING_REVIEW,
                'source' => 'telegram_miniapp',
                'changed_by_user_id' => $user->id,
                'note' => 'Нарушение зафиксировано через Telegram Mini App.',
            ]);

            $incident->refresh();
            $this->notifyReviewers($incident, $reporterName);

            return $incident;
        });
    }

    /**
     * @param Collection<int, ViolationEvidence> $evidences
     */
    private function syncIncidentEvidenceSnapshot(ViolationIncident $incident, Collection $evidences): void
    {
        $photoCount = $evidences->where('media_kind', 'photo')->count();
        $videoCount = $evidences->where('media_kind', 'video')->count();
        $primary = $evidences->firstWhere('is_primary', true) ?: $evidences->first();

        $incident->forceFill([
            'evidence_total_count' => $evidences->count(),
            'evidence_photo_count' => $photoCount,
            'evidence_video_count' => $videoCount,
            'primary_evidence_kind' => $primary?->media_kind,
            'primary_evidence_path' => $primary?->path,
        ])->save();
    }

    private function storeEvidence(ViolationIncident $incident, UploadedFile $file, int $index): ViolationEvidence
    {
        $mimeType = (string) ($file->getMimeType() ?: $file->getClientMimeType() ?: 'application/octet-stream');
        $mediaKind = str_starts_with($mimeType, 'video/') ? 'video' : 'photo';
        $extension = strtolower((string) ($file->getClientOriginalExtension() ?: $file->extension() ?: ($mediaKind === 'video' ? 'mp4' : 'jpg')));
        $sourcePath = $this->resolveUploadedFilePath($file);
        $relativePath = 'violations/' . $incident->incident_uid . '/original/' . sprintf('%02d_%s.%s', $index + 1, Str::ulid(), $extension);
        $stream = fopen($sourcePath, 'rb');

        if ($stream === false) {
            throw ValidationException::withMessages([
                'files' => 'Не удалось прочитать загруженный файл на сервере. Повторите попытку.',
            ]);
        }

        try {
            $stored = Storage::disk('public')->put($relativePath, $stream);
        } finally {
            fclose($stream);
        }

        if (! $stored) {
            throw ValidationException::withMessages([
                'files' => 'Не удалось сохранить файл нарушения в хранилище.',
            ]);
        }

        $fileSize = $file->getSize();
        if (! is_int($fileSize) || $fileSize <= 0) {
            $sizeFromDisk = @filesize($sourcePath);
            $fileSize = is_int($sizeFromDisk) ? $sizeFromDisk : null;
        }

        return $incident->evidences()->create([
            'media_role' => 'original',
            'media_kind' => $mediaKind,
            'disk' => 'public',
            'path' => $relativePath,
            'file_name' => $file->getClientOriginalName(),
            'mime_type' => $mimeType,
            'file_size' => $fileSize,
            'sha1' => sha1_file($sourcePath) ?: null,
            'sort_order' => $index,
            'is_primary' => $index === 0,
            'meta' => [
                'original_name' => $file->getClientOriginalName(),
            ],
        ]);
    }

    private function resolveUploadedFilePath(UploadedFile $file): string
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

        Log::warning('Violation upload file path is unavailable', [
            'original_name' => $file->getClientOriginalName(),
            'client_mime' => $file->getClientMimeType(),
            'error' => $file->getError(),
            'candidates' => array_values($candidates),
        ]);

        throw ValidationException::withMessages([
            'files' => 'Сервер не смог получить временный файл загрузки. Проверьте PHP upload_tmp_dir и права на временную папку.',
        ]);
    }

    private function notifyReviewers(ViolationIncident $incident, string $reporterName): void
    {
        $chatIds = array_values(array_filter(array_map('strval', (array) config('telegram.admin_chat_ids', []))));
        if ($chatIds === []) {
            return;
        }

        $text = implode("\n", [
            '<b>Новое нарушение</b>',
            'ID: #' . e((string) $incident->id),
            'Нарушитель: ' . e((string) ($incident->employee_full_name ?: '—')),
            'Категория: ' . e((string) $incident->category_name),
            'Тип: ' . e((string) $incident->type_name),
            'Кто зафиксировал: ' . e($reporterName),
            'Фото: ' . e((string) $incident->evidence_photo_count) . ' / Видео: ' . e((string) $incident->evidence_video_count),
            'Статус: ' . e((string) $incident->workflow_status),
        ]);

        foreach ($chatIds as $chatId) {
            try {
                $this->telegramMessaging->sendText($chatId, $text);
            } catch (\Throwable $exception) {
                Log::warning('Failed to notify violations reviewers', [
                    'chat_id' => $chatId,
                    'incident_id' => $incident->id,
                    'error' => $exception->getMessage(),
                ]);
            }
        }
    }

    private function nullableTrim(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }
}