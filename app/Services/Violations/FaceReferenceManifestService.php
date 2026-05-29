<?php

namespace App\Services\Violations;

use App\Models\ViolationEmployeeFaceReference;
use Illuminate\Support\Facades\Storage;

class FaceReferenceManifestService
{
    /**
     * @return array{path: string, count: int, missing: int}
     */
    public function exportActiveManifest(?string $targetPath = null): array
    {
        $targetPath ??= (string) config('services.faceid.reference_manifest_path');

        $references = ViolationEmployeeFaceReference::query()
            ->with('employee:id,business_key,external_ref,iin,full_name,department,position,employment_status,person_kind,temporary_pass_status,temporary_pass_expires_at,temporary_pass_issued_at')
            ->where('is_active', true)
            ->orderBy('employee_id')
            ->orderByDesc('is_primary')
            ->orderBy('id')
            ->get();

        $missing = 0;
        $payloadReferences = $references
            ->map(function (ViolationEmployeeFaceReference $reference) use (&$missing) {
                $payload = $this->referencePayload($reference);
                if ($payload === null) {
                    $missing++;
                }

                return $payload;
            })
            ->filter()
            ->values()
            ->all();

        $payload = [
            'generatedAt' => now()->toIso8601String(),
            'referenceCount' => count($payloadReferences),
            'references' => $payloadReferences,
        ];

        $this->ensureParentDirectory($targetPath);
        file_put_contents(
            $targetPath,
            json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        );

        return [
            'path' => $targetPath,
            'count' => count($payloadReferences),
            'missing' => $missing,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function referencePayload(ViolationEmployeeFaceReference $reference): ?array
    {
        $employee = $reference->employee;
        if (! $employee) {
            return null;
        }

        $absolutePath = $this->resolveAbsolutePath($reference->disk, $reference->path);
        if ($absolutePath === null) {
            return null;
        }

        $groupKey = $reference->group_key ?: $employee->business_key;
        $sourceLabel = is_array($reference->meta) ? ($reference->meta['source_label'] ?? null) : null;

        return [
            'imageId' => $reference->id,
            'employeeId' => $employee->id,
            'businessKey' => $employee->business_key,
            'externalRef' => $reference->external_ref ?: $employee->external_ref,
            'groupKey' => $groupKey,
            'name' => $employee->full_name,
            'source' => $reference->source ?: $reference->source_system,
            'sourceSystem' => $reference->source_system,
            'absolutePath' => str_replace('\\', '/', $absolutePath),
            'relativePath' => str_replace('\\', '/', ltrim($reference->path, '/')),
            'referenceImageUrl' => '/reference-images/' . str_replace('\\', '/', ltrim($reference->path, '/')),
            'imageHash' => $reference->sha1,
            'mimeType' => $reference->mime_type,
            'fileSize' => $reference->file_size,
            'profile' => [
                'sourceLabel' => is_string($sourceLabel) && trim($sourceLabel) !== ''
                    ? $sourceLabel
                    : ($reference->source ?: $reference->source_system),
                'role' => $employee->position,
                'department' => $employee->department,
                'iin' => $employee->iin,
                'status' => $employee->employment_status,
                'personKind' => $employee->person_kind,
                'temporaryPassStatus' => $employee->temporary_pass_status,
                'temporaryPassExpiresAt' => $employee->temporary_pass_expires_at?->toIso8601String(),
                'temporaryPassIssuedAt' => $employee->temporary_pass_issued_at?->toIso8601String(),
                'groupKey' => $groupKey,
                'businessKey' => $employee->business_key,
            ],
        ];
    }

    private function resolveAbsolutePath(string $disk, string $path): ?string
    {
        try {
            $absolutePath = Storage::disk($disk)->path($path);
        } catch (\Throwable) {
            return null;
        }

        return is_file($absolutePath) ? $absolutePath : null;
    }

    private function ensureParentDirectory(string $targetPath): void
    {
        $directory = dirname($targetPath);

        if (! is_dir($directory)) {
            mkdir($directory, 0777, true);
        }
    }
}
