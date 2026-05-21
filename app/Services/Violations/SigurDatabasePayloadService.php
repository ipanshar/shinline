<?php

namespace App\Services\Violations;

use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class SigurDatabasePayloadService
{
    /**
     * @return array<string, mixed>
     */
    public function buildPayload(
        string $connectionName,
        string $storeDir,
        ?string $manifestPath = null,
        bool $writeFiles = true,
    ): array {
        $connection = DB::connection($connectionName);
        $databaseName = (string) ($connection->getDatabaseName() ?: $connectionName);
        $stats = $this->initialStats();
        $people = $this->loadPeople($connection, $stats);

        $liveDirectory = rtrim($storeDir, '\\/') . DIRECTORY_SEPARATOR . 'sigur_live';
        if ($writeFiles) {
            File::deleteDirectory($liveDirectory);
            if (! is_dir($liveDirectory)) {
                mkdir($liveDirectory, 0777, true);
            }
        }

        $references = [];
        $seenHashes = [];

        foreach ($connection->table('personalimg')
            ->selectRaw('ID as image_id, EMP_ID as employee_id, DATA as image_data')
            ->orderBy('image_id')
            ->cursor() as $row) {
            $stats['personalimgRows']++;
            $imageBytes = $this->normalizeBinary($row->image_data ?? null);
            $extension = $this->detectImageExtension($imageBytes);
            if ($extension === null) {
                $stats['personalimgInvalidImages']++;
                continue;
            }

            $employeeId = (int) ($row->employee_id ?? 0);
            $person = $people[$employeeId] ?? null;
            if ($person === null) {
                $stats['personalimgMissingPerson']++;
                continue;
            }

            if (($person['status'] ?? null) !== 'AVAILABLE') {
                $stats['personalimgInactivePerson']++;
                continue;
            }

            $stats['personalimgValidImages']++;
            $reference = $this->buildReferencePayload(
                person: $person,
                imageId: (int) ($row->image_id ?? 0),
                employeeId: $employeeId,
                imageBytes: $imageBytes,
                extension: $extension,
                source: 'sigur-personalimg',
                sourceLabel: 'Sigur personalimg',
                department: 'Sigur DB',
                storeDir: $storeDir,
                writeFiles: $writeFiles,
            );

            if ($this->isDuplicateReference($reference, $seenHashes)) {
                $stats['referencesDuplicateHashes']++;
                continue;
            }

            $references[] = $reference;
        }

        foreach ($connection->table('photo')
            ->selectRaw('ID as image_id, PREVIEW_RASTER as preview_raster, HIRES_RASTER as hires_raster')
            ->orderBy('image_id')
            ->cursor() as $row) {
            $stats['photoRows']++;
            $previewBytes = $this->normalizeBinary($row->preview_raster ?? null);
            $hiresBytes = $this->normalizeBinary($row->hires_raster ?? null);
            $imageBytes = $hiresBytes !== '' ? $hiresBytes : $previewBytes;
            if ($imageBytes === '') {
                $stats['photoEmptyImages']++;
                continue;
            }

            $stats['photoRowsWithBinary']++;
            $extension = $this->detectImageExtension($imageBytes);
            if ($extension === null) {
                $stats['photoInvalidImages']++;
                continue;
            }

            $employeeId = (int) ($row->image_id ?? 0);
            $person = $people[$employeeId] ?? null;
            if ($person === null) {
                $stats['photoMissingPerson']++;
                continue;
            }

            if (($person['status'] ?? null) !== 'AVAILABLE') {
                $stats['photoInactivePerson']++;
                continue;
            }

            $stats['photoValidImages']++;
            $reference = $this->buildReferencePayload(
                person: $person,
                imageId: $employeeId,
                employeeId: $employeeId,
                imageBytes: $imageBytes,
                extension: $extension,
                source: 'sigur-photo',
                sourceLabel: 'Sigur photo',
                department: 'Справочник personal',
                storeDir: $storeDir,
                writeFiles: $writeFiles,
            );

            if ($this->isDuplicateReference($reference, $seenHashes)) {
                $stats['referencesDuplicateHashes']++;
                continue;
            }

            $references[] = $reference;
        }

        $stats['referenceImagesFromSource'] = count($references);
        $stats['referencesUniquePeople'] = count(array_unique(array_map(
            fn (array $reference) => (string) ($reference['groupKey'] ?? ''),
            $references
        )));

        $payload = [
            'generatedAt' => now()->toIso8601String(),
            'source' => 'database',
            'connection' => $connectionName,
            'database' => $databaseName,
            'peopleCount' => count($people),
            'referenceCount' => count($references),
            'stats' => $stats,
            'people' => array_values(array_map(fn (array $person) => $person['payload'], $people)),
            'references' => $references,
        ];

        if ($writeFiles && $manifestPath) {
            $directory = dirname($manifestPath);
            if (! is_dir($directory)) {
                mkdir($directory, 0777, true);
            }

            file_put_contents(
                $manifestPath,
                json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            );
        }

        return $payload;
    }

    /**
     * @param  array<string, int>  $stats
     * @return array<int, array<string, mixed>>
     */
    private function loadPeople(ConnectionInterface $connection, array &$stats): array
    {
        $people = [];

        foreach ($connection->table('personal')
            ->selectRaw('ID as person_id, TYPE as person_type, EMP_TYPE as employee_type, NAME as person_name, DESCRIPTION as iin_value, POS as position_value, STATUS as status_value')
            ->orderBy('person_id')
            ->cursor() as $row) {
            $stats['personalRows']++;

            $personId = (int) ($row->person_id ?? 0);
            $name = $this->cleanProfileValue((string) ($row->person_name ?? ''));
            if ($name === '') {
                $name = 'ID ' . $personId;
            }

            $iin = $this->cleanProfileValue((string) ($row->iin_value ?? ''));
            $position = $this->cleanProfileValue((string) ($row->position_value ?? ''));
            $status = strtoupper(trim((string) ($row->status_value ?? '')));
            $groupKey = $this->buildPersonIdentityKey($iin, $name);
            $businessKey = 'faceid:' . $groupKey;

            $profile = array_filter([
                'sourceLabel' => 'Sigur personal',
                'role' => $position,
                'department' => '',
                'iin' => $iin,
                'status' => $status,
                'groupKey' => $groupKey,
                'employeeType' => (string) ($row->employee_type ?? ''),
                'personType' => (string) ($row->person_type ?? ''),
            ], fn ($value) => $value !== null);

            $people[$personId] = [
                'id' => $personId,
                'name' => $name,
                'iin' => $iin,
                'position' => $position,
                'status' => $status,
                'groupKey' => $groupKey,
                'businessKey' => $businessKey,
                'employeeType' => (string) ($row->employee_type ?? ''),
                'personType' => (string) ($row->person_type ?? ''),
                'payload' => [
                    'employeeId' => $personId,
                    'businessKey' => $businessKey,
                    'externalRef' => (string) $personId,
                    'groupKey' => $groupKey,
                    'name' => $name,
                    'sourceSystem' => 'sigur',
                    'profile' => $profile,
                ],
            ];

            $stats['personalParsed']++;
            if ($status === 'AVAILABLE') {
                $stats['personalAvailable']++;
            } else {
                $stats['personalNotAvailable']++;
            }
        }

        return $people;
    }

    /**
     * @param  array<string, mixed>  $person
     * @param  array<string, bool>  $seenHashes
     * @return array<string, mixed>
     */
    private function buildReferencePayload(
        array $person,
        int $imageId,
        int $employeeId,
        string $imageBytes,
        string $extension,
        string $source,
        string $sourceLabel,
        string $department,
        string $storeDir,
        bool $writeFiles,
    ): array {
        $fileName = sprintf('%s_emp_%d_img_%d%s', $source, $employeeId, $imageId, $extension);
        $relativePath = 'sigur_live/' . $fileName;
        if ($writeFiles) {
            $targetPath = rtrim($storeDir, '\\/') . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
            $targetDirectory = dirname($targetPath);
            if (! is_dir($targetDirectory)) {
                mkdir($targetDirectory, 0777, true);
            }

            file_put_contents($targetPath, $imageBytes);
        }

        return [
            'imageId' => $imageId,
            'employeeId' => $employeeId,
            'businessKey' => $person['businessKey'],
            'externalRef' => (string) $employeeId,
            'groupKey' => $person['groupKey'],
            'name' => $person['name'],
            'source' => $source,
            'sourceSystem' => 'sigur',
            'imageHash' => sha1($imageBytes),
            'mimeType' => $this->mimeTypeForExtension($extension),
            'fileSize' => strlen($imageBytes),
            'profile' => array_filter([
                'sourceLabel' => $sourceLabel,
                'role' => $person['position'],
                'department' => $department,
                'iin' => $person['iin'],
                'status' => $person['status'],
                'groupKey' => $person['groupKey'],
            ], fn ($value) => $value !== null),
            'relativePath' => str_replace('\\', '/', $relativePath),
        ];
    }

    /**
     * @param  array<string, mixed>  $reference
     * @param  array<string, bool>  $seenHashes
     */
    private function isDuplicateReference(array $reference, array &$seenHashes): bool
    {
        $groupKey = (string) ($reference['groupKey'] ?? '');
        $imageHash = (string) ($reference['imageHash'] ?? '');
        $dedupeKey = $groupKey . '|' . $imageHash;

        if (isset($seenHashes[$dedupeKey])) {
            return true;
        }

        $seenHashes[$dedupeKey] = true;

        return false;
    }

    /**
     * @return array<string, int>
     */
    private function initialStats(): array
    {
        return [
            'personalRows' => 0,
            'personalParsed' => 0,
            'personalAvailable' => 0,
            'personalNotAvailable' => 0,
            'personalimgRows' => 0,
            'personalimgValidImages' => 0,
            'personalimgInvalidImages' => 0,
            'personalimgInactivePerson' => 0,
            'personalimgMissingPerson' => 0,
            'photoRows' => 0,
            'photoRowsWithBinary' => 0,
            'photoValidImages' => 0,
            'photoEmptyImages' => 0,
            'photoInvalidImages' => 0,
            'photoMissingPerson' => 0,
            'photoInactivePerson' => 0,
            'referencesUniquePeople' => 0,
            'referencesDuplicateHashes' => 0,
            'referenceImagesFromSource' => 0,
        ];
    }

    private function normalizeBinary(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        if (is_resource($value)) {
            $contents = stream_get_contents($value);

            return $contents === false ? '' : $contents;
        }

        return (string) $value;
    }

    private function detectImageExtension(string $imageBytes): ?string
    {
        if ($imageBytes === '') {
            return null;
        }

        if (str_starts_with($imageBytes, "\xFF\xD8\xFF")) {
            return '.jpg';
        }

        if (str_starts_with($imageBytes, "\x89PNG\r\n\x1A\n")) {
            return '.png';
        }

        if (str_starts_with($imageBytes, 'GIF87a') || str_starts_with($imageBytes, 'GIF89a')) {
            return '.gif';
        }

        if (str_starts_with($imageBytes, 'BM')) {
            return '.bmp';
        }

        if (strlen($imageBytes) >= 12
            && substr($imageBytes, 0, 4) === 'RIFF'
            && substr($imageBytes, 8, 4) === 'WEBP') {
            return '.webp';
        }

        return null;
    }

    private function mimeTypeForExtension(string $extension): string
    {
        return match ($extension) {
            '.jpg', '.jpeg' => 'image/jpeg',
            '.png' => 'image/png',
            '.gif' => 'image/gif',
            '.bmp' => 'image/bmp',
            '.webp' => 'image/webp',
            default => 'application/octet-stream',
        };
    }

    private function cleanProfileValue(string $value): string
    {
        $trimmed = trim($value);
        if ($trimmed === '' || strtoupper($trimmed) === 'NULL') {
            return '';
        }

        if (str_starts_with($trimmed, '$')) {
            return '';
        }

        return $trimmed;
    }

    private function buildPersonIdentityKey(string $iin, string $name): string
    {
        $normalizedIin = preg_replace('/\D+/', '', $iin) ?: '';
        if ($normalizedIin !== '') {
            return 'iin:' . $normalizedIin;
        }

        $normalizedName = preg_replace('/\s+/', ' ', mb_strtolower(trim($name)));

        return 'name:' . $normalizedName;
    }
}