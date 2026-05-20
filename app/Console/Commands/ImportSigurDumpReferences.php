<?php

namespace App\Console\Commands;

use App\Models\ViolationEmployee;
use App\Models\ViolationEmployeeFaceReference;
use App\Services\Violations\FaceReferenceManifestService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

class ImportSigurDumpReferences extends Command
{
    protected $signature = 'violations:import-sigur-dump
                            {--dump= : Полный путь до SQL dump Sigur}
                            {--python= : Полный путь до python.exe для testFaceID}
                            {--store-dir= : Каталог, куда сохранять эталонные фото}
                            {--import-manifest= : Временный manifest, который соберёт Python extractor}
                            {--dry-run : Только разобрать dump и вывести summary без записи в БД}';

    protected $description = 'Импортирует из dump Sigur только нужные данные для локального Face ID reference store';

    public function handle(FaceReferenceManifestService $manifestService): int
    {
        $dumpPath = $this->resolveDumpPath();
        $python = $this->resolvePythonExecutable();
        $storeDir = $this->resolveStoreDirectory();
        $importManifestPath = $this->resolveImportManifestPath();

        if (! is_file($dumpPath)) {
            $this->error('Dump не найден: ' . $dumpPath);
            return self::FAILURE;
        }

        if (! is_file($python)) {
            $this->error('Python executable не найден: ' . $python);
            return self::FAILURE;
        }

        $processArgs = [
            $python,
            '-m',
            'backend.export_reference_store',
            '--dump',
            $dumpPath,
            '--output-dir',
            $storeDir,
            '--manifest',
            $importManifestPath,
        ];

        if ($this->option('dry-run')) {
            $processArgs[] = '--dry-run';
        }

        $process = new Process($processArgs, base_path('testFaceID'));
        $process->setTimeout(0);
        $process->run(function (string $type, string $buffer) {
            if ($type === Process::ERR) {
                $this->output->write('<error>' . $buffer . '</error>');
                return;
            }

            $this->output->write($buffer);
        });

        if (! $process->isSuccessful()) {
            $this->error('Не удалось извлечь reference store из dump Sigur.');
            return self::FAILURE;
        }

        if ($this->option('dry-run')) {
            return self::SUCCESS;
        }

        if (! is_file($importManifestPath)) {
            $this->error('Python extractor не создал manifest: ' . $importManifestPath);
            return self::FAILURE;
        }

        $payload = json_decode((string) file_get_contents($importManifestPath), true);
        if (! is_array($payload)) {
            $this->error('Manifest импорта не удалось разобрать как JSON.');
            return self::FAILURE;
        }

        $references = collect((array) ($payload['references'] ?? []))
            ->filter(fn ($item) => is_array($item))
            ->values();

        $now = now();

        DB::transaction(function () use ($references, $now, $dumpPath) {
            ViolationEmployeeFaceReference::query()
                ->where('source_system', 'sigur')
                ->update([
                    'is_active' => false,
                    'last_synced_at' => $now,
                ]);

            $primaryAssigned = [];

            foreach ($references as $entry) {
                $businessKey = trim((string) ($entry['businessKey'] ?? ''));
                if ($businessKey === '') {
                    continue;
                }

                $relativePath = trim((string) ($entry['relativePath'] ?? ''));
                if ($relativePath === '') {
                    continue;
                }

                $employee = ViolationEmployee::query()->firstOrNew([
                    'business_key' => $businessKey,
                ]);

                $fullName = trim((string) ($entry['name'] ?? ''));
                $employee->source_system = 'sigur';
                $employee->external_ref = $this->nullableString($entry['externalRef'] ?? $entry['employeeId'] ?? null);
                $employee->iin = $this->nullableString(data_get($entry, 'profile.iin'));
                $employee->full_name = $fullName !== '' ? $fullName : ($employee->full_name ?: 'Неизвестный сотрудник');
                $employee->normalized_full_name = Str::lower($employee->full_name);
                $employee->department = $this->nullableString(data_get($entry, 'profile.department'));
                $employee->position = $this->nullableString(data_get($entry, 'profile.role'));
                $employee->employment_status = $this->nullableString(data_get($entry, 'profile.status'));
                $employee->is_active = $employee->employment_status !== 'BLOCKED';
                $employee->last_face_sync_at = $now;
                $employee->imported_at ??= $now;
                $employee->meta = array_merge(
                    is_array($employee->meta) ? $employee->meta : [],
                    array_filter([
                        'sigur_group_key' => $this->nullableString($entry['groupKey'] ?? null),
                        'sigur_last_dump_path' => $dumpPath,
                    ], fn ($value) => $value !== null && $value !== '')
                );
                $employee->save();

                $sha1 = $this->nullableString($entry['imageHash'] ?? null);
                $sourceImageId = $this->nullableString($entry['imageId'] ?? null);
                $matchAttributes = [
                    'employee_id' => $employee->id,
                ];

                if ($sha1 !== null) {
                    $matchAttributes['sha1'] = $sha1;
                } elseif ($sourceImageId !== null) {
                    $matchAttributes['source_image_id'] = $sourceImageId;
                } else {
                    $matchAttributes['path'] = $relativePath;
                }

                $reference = ViolationEmployeeFaceReference::query()->firstOrNew($matchAttributes);

                $reference->source_system = 'sigur';
                $reference->source = $this->nullableString($entry['source'] ?? null) ?: 'sigur';
                $reference->external_ref = $employee->external_ref;
                $reference->source_image_id = $sourceImageId;
                $reference->group_key = $this->nullableString($entry['groupKey'] ?? null) ?: $employee->business_key;
                $reference->disk = 'faceid_references';
                $reference->path = $relativePath;
                $reference->file_name = basename($reference->path);
                $reference->mime_type = $this->nullableString($entry['mimeType'] ?? null);
                $reference->file_size = is_numeric($entry['fileSize'] ?? null) ? (int) $entry['fileSize'] : null;
                $reference->is_primary = ! ($primaryAssigned[$employee->id] ?? false)
                    && ! ViolationEmployeeFaceReference::query()
                        ->where('employee_id', $employee->id)
                        ->where('is_active', true)
                        ->where('id', '!=', $reference->id ?: 0)
                        ->exists();
                $reference->is_active = true;
                $reference->imported_at ??= $now;
                $reference->last_synced_at = $now;
                $reference->meta = array_filter([
                    'source_label' => $this->nullableString(data_get($entry, 'profile.sourceLabel')),
                    'import_origin' => 'sigur_dump',
                ], fn ($value) => $value !== null && $value !== '');
                $reference->save();

                if ($reference->is_primary) {
                    $primaryAssigned[$employee->id] = true;
                }
            }

            ViolationEmployee::query()
                ->where('source_system', 'sigur')
                ->get()
                ->each(function (ViolationEmployee $employee) use ($now) {
                    $activeCount = $employee->faceReferences()->where('is_active', true)->count();
                    $employee->forceFill([
                        'face_reference_count' => $activeCount,
                        'face_reference_state' => $activeCount > 0 ? 'ready' : 'missing',
                        'last_face_sync_at' => $now,
                    ])->save();
                });
        });

        $manifest = $manifestService->exportActiveManifest();

        $this->info('Импорт завершён.');
        $this->line('Эталонов в manifest: ' . $manifest['count']);
        $this->line('Runtime manifest: ' . $manifest['path']);

        return self::SUCCESS;
    }

    private function resolveDumpPath(): string
    {
        $option = trim((string) $this->option('dump'));
        if ($option !== '') {
            return $option;
        }

        $env = trim((string) env('FACEID_DUMP_PATH', ''));
        if ($env !== '') {
            return $env;
        }

        return base_path('testFaceID/sigur_20260506.sql');
    }

    private function resolvePythonExecutable(): string
    {
        $option = trim((string) $this->option('python'));
        if ($option !== '') {
            return $option;
        }

        return (string) config('services.faceid.python_executable');
    }

    private function resolveStoreDirectory(): string
    {
        $option = trim((string) $this->option('store-dir'));
        if ($option !== '') {
            return $option;
        }

        return (string) config('filesystems.disks.faceid_references.root');
    }

    private function resolveImportManifestPath(): string
    {
        $option = trim((string) $this->option('import-manifest'));
        if ($option !== '') {
            return $option;
        }

        return (string) config('services.faceid.import_manifest_path');
    }

    private function nullableString(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $string = trim((string) $value);

        return $string === '' ? null : $string;
    }
}