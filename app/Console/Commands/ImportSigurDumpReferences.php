<?php

namespace App\Console\Commands;

use App\Services\Violations\SigurImportPayloadService;
use Illuminate\Console\Command;
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

    public function handle(SigurImportPayloadService $importService): int
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

        $result = $importService->import($payload, $dumpPath, 'sigur_dump');

        $this->info('Импорт завершён.');
        $this->line('Эталонов в manifest: ' . (int) (($result['manifest']['count'] ?? 0)));
        $this->line('Runtime manifest: ' . (string) ($result['manifest']['path'] ?? 'n/a'));

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
}