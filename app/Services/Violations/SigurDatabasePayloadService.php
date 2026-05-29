<?php

namespace App\Services\Violations;

use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;

class SigurDatabasePayloadService
{
    private const PEOPLE_CHUNK_SIZE = 1000;
    private const PERSONALIMG_CHUNK_SIZE = 10;
    private const PHOTO_CHUNK_SIZE = 2;

    /**
     * @return array<string, mixed>
     */
    public function buildPayload(
        string $connectionName,
        string $storeDir,
        ?string $manifestPath = null,
        bool $writeFiles = true,
        bool $summaryOnly = false,
    ): array {
        $connection = DB::connection($connectionName);
        $connection->disableQueryLog();
        $databaseName = (string) ($connection->getDatabaseName() ?: $connectionName);
        $stats = $this->initialStats();
        $people = $this->loadPeople($connection, $stats, ! $summaryOnly);

        $liveDirectory = rtrim($storeDir, '\\/') . DIRECTORY_SEPARATOR . 'sigur_live';
        if ($writeFiles) {
            File::deleteDirectory($liveDirectory);
            if (! is_dir($liveDirectory)) {
                mkdir($liveDirectory, 0777, true);
            }
        }

        $references = [];
        $seenHashes = [];
        $referenceCount = 0;
        $uniqueReferencePeople = [];

        $this->processPersonalImages(
            connection: $connection,
            people: $people,
            stats: $stats,
            references: $references,
            seenHashes: $seenHashes,
            storeDir: $storeDir,
            writeFiles: $writeFiles,
            includePayload: ! $summaryOnly,
            referenceCount: $referenceCount,
            uniqueReferencePeople: $uniqueReferencePeople,
        );

        $this->processPhotoImages(
            connection: $connection,
            people: $people,
            stats: $stats,
            references: $references,
            seenHashes: $seenHashes,
            storeDir: $storeDir,
            writeFiles: $writeFiles,
            includePayload: ! $summaryOnly,
            referenceCount: $referenceCount,
            uniqueReferencePeople: $uniqueReferencePeople,
        );

        $stats['referenceImagesFromSource'] = $referenceCount;
        $stats['referencesUniquePeople'] = count($uniqueReferencePeople);

        $payload = [
            'generatedAt' => now()->toIso8601String(),
            'source' => 'database',
            'connection' => $connectionName,
            'database' => $databaseName,
            'peopleCount' => count($people),
            'referenceCount' => $referenceCount,
            'stats' => $stats,
            'people' => $summaryOnly
                ? []
                : array_values(array_map(fn (array $person) => $person['payload'], $people)),
            'references' => $summaryOnly ? [] : $references,
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
    private function loadPeople(ConnectionInterface $connection, array &$stats, bool $includePayload): array
    {
        $people = [];

        $lastPersonId = 0;
        do {
            $rows = $connection->table('personal')
                ->selectRaw('ID as person_id, TYPE as person_type, EMP_TYPE as employee_type, NAME as person_name, DESCRIPTION as iin_value, POS as position_value, STATUS as status_value')
                ->where('ID', '>', $lastPersonId)
                ->orderBy('ID')
                ->limit(self::PEOPLE_CHUNK_SIZE)
                ->get();
            $rowCount = $rows->count();

            foreach ($rows as $row) {
                $stats['personalRows']++;

                $personId = (int) ($row->person_id ?? 0);
                if ($personId <= 0) {
                    continue;
                }

                $lastPersonId = $personId;
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
                    'payload' => $includePayload ? [
                        'employeeId' => $personId,
                        'businessKey' => $businessKey,
                        'externalRef' => (string) $personId,
                        'groupKey' => $groupKey,
                        'name' => $name,
                        'sourceSystem' => 'sigur',
                        'profile' => $profile,
                    ] : null,
                ];

                $stats['personalParsed']++;
                if ($status === 'AVAILABLE') {
                    $stats['personalAvailable']++;
                } else {
                    $stats['personalNotAvailable']++;
                }
            }

            unset($rows);
        } while ($rowCount === self::PEOPLE_CHUNK_SIZE);

        return $people;
    }

    /**
     * @param  array<int, array<string, mixed>>  $people
     * @param  array<string, int>  $stats
     * @param  array<int, array<string, mixed>>  $references
     * @param  array<string, bool>  $seenHashes
     * @param  array<string, bool>  $uniqueReferencePeople
     */
    private function processPersonalImages(
        ConnectionInterface $connection,
        array $people,
        array &$stats,
        array &$references,
        array &$seenHashes,
        string $storeDir,
        bool $writeFiles,
        bool $includePayload,
        int &$referenceCount,
        array &$uniqueReferencePeople,
    ): void {
        $lastImageId = 0;

        do {
            $rows = $connection->table('personalimg')
                ->selectRaw('ID as image_id, EMP_ID as employee_id, DATA as image_data')
                ->where('ID', '>', $lastImageId)
                ->orderBy('ID')
                ->limit(self::PERSONALIMG_CHUNK_SIZE)
                ->get();
            $rowCount = $rows->count();

            foreach ($rows as $row) {
                $imageId = (int) ($row->image_id ?? 0);
                if ($imageId <= 0) {
                    continue;
                }

                $lastImageId = $imageId;
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
                    imageId: $imageId,
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

                $referenceCount++;
                $uniqueReferencePeople[(string) $reference['groupKey']] = true;

                if ($includePayload) {
                    $references[] = $reference;
                }
            }

            unset($rows);
        } while ($rowCount === self::PERSONALIMG_CHUNK_SIZE);
    }

    /**
     * @param  array<int, array<string, mixed>>  $people
     * @param  array<string, int>  $stats
     * @param  array<int, array<string, mixed>>  $references
     * @param  array<string, bool>  $seenHashes
     * @param  array<string, bool>  $uniqueReferencePeople
     */
    private function processPhotoImages(
        ConnectionInterface $connection,
        array $people,
        array &$stats,
        array &$references,
        array &$seenHashes,
        string $storeDir,
        bool $writeFiles,
        bool $includePayload,
        int &$referenceCount,
        array &$uniqueReferencePeople,
    ): void {
        $lastImageId = 0;

        do {
            $rows = $connection->table('photo')
                ->selectRaw('ID as image_id, PREVIEW_RASTER as preview_raster, HIRES_RASTER as hires_raster')
                ->where('ID', '>', $lastImageId)
                ->orderBy('ID')
                ->limit(self::PHOTO_CHUNK_SIZE)
                ->get();
            $rowCount = $rows->count();

            foreach ($rows as $row) {
                $imageId = (int) ($row->image_id ?? 0);
                if ($imageId <= 0) {
                    continue;
                }

                $lastImageId = $imageId;
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

                $person = $people[$imageId] ?? null;
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
                    imageId: $imageId,
                    employeeId: $imageId,
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

                $referenceCount++;
                $uniqueReferencePeople[(string) $reference['groupKey']] = true;

                if ($includePayload) {
                    $references[] = $reference;
                }
            }

            unset($rows);
        } while ($rowCount === self::PHOTO_CHUNK_SIZE);
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

            $bytesWritten = @file_put_contents($targetPath, $imageBytes);
            if ($bytesWritten !== strlen($imageBytes)) {
                throw new \RuntimeException('Cannot write Face ID reference image: ' . $targetPath);
            }
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