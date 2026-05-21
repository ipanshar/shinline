<?php

namespace App\Console\Commands;

use App\Services\Violations\SigurDatabasePayloadService;
use App\Services\Violations\SigurImportPayloadService;
use Illuminate\Console\Command;

class ImportSigurLiveReferences extends Command
{
    protected $signature = 'violations:import-sigur-live
                            {--connection= : Имя DB connection для Sigur}
                            {--store-dir= : Каталог, куда сохранять эталонные фото}
                            {--import-manifest= : Временный manifest для диагностики импорта}
                            {--dry-run : Только собрать summary без записи в локальную БД}';

    protected $description = 'Импортирует сотрудников и эталонные фото напрямую из БД Sigur в локальный Face ID store';

    public function handle(
        SigurDatabasePayloadService $payloadService,
        SigurImportPayloadService $importService,
    ): int {
        $connectionName = $this->resolveConnectionName();
        $storeDir = $this->resolveStoreDirectory();
        $importManifestPath = $this->resolveImportManifestPath();

        try {
            $payload = $payloadService->buildPayload(
                connectionName: $connectionName,
                storeDir: $storeDir,
                manifestPath: $importManifestPath,
                writeFiles: ! $this->option('dry-run'),
                summaryOnly: (bool) $this->option('dry-run'),
            );
        } catch (\Throwable $exception) {
            $this->error('Не удалось получить данные из БД Sigur: ' . $exception->getMessage());

            return self::FAILURE;
        }

        if ($this->option('dry-run')) {
            $this->line(json_encode([
                'status' => 'ok',
                'source' => 'database',
                'connection' => $connectionName,
                'database' => $payload['database'] ?? null,
                'peopleCount' => $payload['peopleCount'] ?? 0,
                'referenceCount' => $payload['referenceCount'] ?? 0,
                'stats' => $payload['stats'] ?? [],
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

            return self::SUCCESS;
        }

        $syncOrigin = sprintf(
            'database:%s:%s',
            $connectionName,
            (string) ($payload['database'] ?? $connectionName)
        );
        $result = $importService->import($payload, $syncOrigin, 'sigur_database');

        $this->info('Импорт завершён.');
        $this->line('Людей обработано: ' . (int) ($result['peopleCount'] ?? 0));
        $this->line('Эталонов в manifest: ' . (int) (($result['manifest']['count'] ?? 0)));
        $this->line('Runtime manifest: ' . (string) ($result['manifest']['path'] ?? 'n/a'));

        return self::SUCCESS;
    }

    private function resolveConnectionName(): string
    {
        $option = trim((string) $this->option('connection'));
        if ($option !== '') {
            return $option;
        }

        return (string) config('services.faceid.sigur_connection', 'sigur');
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