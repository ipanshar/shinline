<?php

namespace App\Console\Commands;

use App\Models\ViolationEmployeeFaceReference;
use App\Services\Violations\FaceReferenceManifestService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

class SyncFaceIdRuntime extends Command
{
    protected $signature = 'violations:sync-faceid-runtime
                            {--dump= : Полный путь до SQL dump Sigur}
                            {--source= : Источник синхронизации Sigur: dump или database}
                            {--force-import : Принудительно заново импортировать эталоны из источника Sigur}
                            {--restart-service : После sync перезапустить Windows service Face ID}
                            {--without-runtime-refresh : Не отправлять runtime refresh в Python Face ID}
                            {--without-storage-link : Не проверять public/storage link}
                            {--json : Вывести summary в JSON}';

    protected $description = 'Подготавливает локальный Face ID runtime store после деплоя и при плановой синхронизации';

    public function handle(FaceReferenceManifestService $manifestService): int
    {
        $source = $this->resolveImportSource();
        $summary = [
            'status' => 'ok',
            'sigurSource' => $source,
            'referenceManifestPath' => (string) config('services.faceid.reference_manifest_path'),
            'referenceStoreDir' => (string) config('filesystems.disks.faceid_references.root'),
        ];

        if ($source === 'dump') {
            $summary['dumpPath'] = $this->resolveDumpPath();
        }

        try {
            $summary['directories'] = $this->ensureRuntimeDirectories();

            if (! $this->option('without-storage-link')) {
                $summary['storageLink'] = $this->ensureStorageLink();
            }

            if ((bool) $this->option('force-import') || $this->shouldImportFromSource($source)) {
                $summary['syncMode'] = $source === 'database' ? 'import_database' : 'import_dump';
                $summary['import'] = $this->runSigurImport($source);
            } else {
                $summary['syncMode'] = 'export_manifest';
                $summary['manifest'] = $manifestService->exportActiveManifest();
                if (($summary['manifest']['count'] ?? 0) === 0) {
                    $summary['warning'] = 'Active face references are empty. Face ID recognition will stay empty until references are imported or added manually.';
                }
            }

            if (! $this->option('without-runtime-refresh')) {
                $summary['runtimeRefresh'] = $this->refreshRuntime();
            }

            $this->logSummary($summary);

            return $this->renderSummary($summary, self::SUCCESS);
        } catch (\Throwable $exception) {
            $summary['status'] = 'failed';
            $summary['error'] = $exception->getMessage();

            Log::error('faceid_runtime_sync_failed', [
                'error' => $exception->getMessage(),
            ]);

            return $this->renderSummary($summary, self::FAILURE);
        }
    }

    private function ensureRuntimeDirectories(): array
    {
        $paths = array_values(array_unique(array_filter([
            (string) config('filesystems.disks.faceid_references.root'),
            dirname((string) config('services.faceid.reference_manifest_path')),
            dirname((string) config('services.faceid.import_manifest_path')),
            (string) config('services.faceid.cache_dir'),
        ], fn ($value) => is_string($value) && trim($value) !== '')));

        $created = [];
        foreach ($paths as $path) {
            if (! is_dir($path)) {
                mkdir($path, 0777, true);
                $created[] = $path;
            }
        }

        return [
            'checked' => $paths,
            'created' => $created,
        ];
    }

    private function ensureStorageLink(): array
    {
        $links = (array) config('filesystems.links', []);
        $missing = [];

        foreach ($links as $link => $target) {
            if (! file_exists($link)) {
                $missing[$link] = $target;
            }
        }

        if ($missing === []) {
            return [
                'status' => 'already_exists',
                'links' => array_keys($links),
            ];
        }

        $exitCode = Artisan::call('storage:link');
        $output = trim(Artisan::output());

        if ($exitCode !== 0) {
            throw new \RuntimeException('storage:link failed: ' . $output);
        }

        return [
            'status' => 'created',
            'links' => array_keys($missing),
            'output' => $output,
        ];
    }

    private function shouldImportFromSource(string $source): bool
    {
        if ($source === 'database') {
            return true;
        }

        return $this->shouldImportFromDump();
    }

    private function shouldImportFromDump(): bool
    {
        $dumpPath = $this->resolveDumpPath();
        if (! is_file($dumpPath)) {
            return false;
        }

        $manifestPath = (string) config('services.faceid.reference_manifest_path');
        if (! is_file($manifestPath)) {
            return true;
        }

        $latestSigurSyncAt = ViolationEmployeeFaceReference::query()
            ->where('source_system', 'sigur')
            ->max('last_synced_at');

        if (! $latestSigurSyncAt) {
            return true;
        }

        $dumpMtime = (int) (filemtime($dumpPath) ?: 0);
        $latestSyncTs = Carbon::parse($latestSigurSyncAt)->getTimestamp();

        return $dumpMtime > $latestSyncTs;
    }

    private function runSigurImport(string $source): array
    {
        $parameters = [
            '--store-dir' => (string) config('filesystems.disks.faceid_references.root'),
            '--import-manifest' => (string) config('services.faceid.import_manifest_path'),
        ];

        if ($source === 'database') {
            $parameters['--connection'] = (string) config('services.faceid.sigur_connection', 'sigur');
            $command = 'violations:import-sigur-live';
        } else {
            $parameters['--dump'] = $this->resolveDumpPath();
            $parameters['--python'] = (string) config('services.faceid.python_executable');
            $command = 'violations:import-sigur-dump';
        }

        $exitCode = Artisan::call($command, $parameters);
        $output = trim(Artisan::output());

        if ($exitCode !== 0) {
            throw new \RuntimeException($command . ' failed: ' . $output);
        }

        return [
            'status' => 'completed',
            'output' => $output,
        ];
    }

    private function refreshRuntime(): array
    {
        $restartRequested = (bool) $this->option('restart-service')
            || (bool) config('services.faceid.auto_restart_service_after_sync', false);

        if ($restartRequested) {
            $restart = $this->restartWindowsService();
            if (($restart['status'] ?? null) === 'restarted') {
                return $restart;
            }

            $rebuild = $this->requestRuntimeRebuild();
            $rebuild['previousRestartAttempt'] = $restart;
            return $rebuild;
        }

        return $this->requestRuntimeRebuild();
    }

    private function restartWindowsService(): array
    {
        $serviceName = trim((string) config('services.faceid.restart_service', ''));
        if ($serviceName === '') {
            return [
                'status' => 'restart_skipped_not_configured',
            ];
        }

        $nssmPath = trim((string) config('services.faceid.nssm_path', 'nssm')) ?: 'nssm';
        $process = new Process([$nssmPath, 'restart', $serviceName]);
        $process->setTimeout(45);
        $process->run();

        if (! $process->isSuccessful()) {
            return [
                'status' => 'restart_failed',
                'service' => $serviceName,
                'nssm' => $nssmPath,
                'errorOutput' => trim($process->getErrorOutput()),
                'output' => trim($process->getOutput()),
                'exitCode' => $process->getExitCode(),
            ];
        }

        return [
            'status' => 'restarted',
            'service' => $serviceName,
            'nssm' => $nssmPath,
            'output' => trim($process->getOutput()),
        ];
    }

    private function requestRuntimeRebuild(): array
    {
        try {
            $response = Http::timeout((int) config('services.faceid.timeout', 12))
                ->connectTimeout((int) config('services.faceid.connect_timeout', 5))
                ->acceptJson()
                ->post($this->rebuildUrl());
        } catch (\Throwable $exception) {
            return [
                'status' => 'rebuild_unavailable',
                'message' => $exception->getMessage(),
            ];
        }

        if (! $response->successful()) {
            return [
                'status' => 'rebuild_failed',
                'httpStatus' => $response->status(),
                'body' => trim($response->body()),
            ];
        }

        return [
            'status' => 'rebuild_requested',
            'httpStatus' => $response->status(),
        ];
    }

    private function rebuildUrl(): string
    {
        return rtrim((string) config('services.faceid.base_url', 'http://127.0.0.1:8008'), '/') . '/api/rebuild';
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

    private function resolveImportSource(): string
    {
        $option = trim((string) $this->option('source'));
        $source = $option !== ''
            ? $option
            : (string) config('services.faceid.sigur_sync_source', 'dump');

        $normalized = Str::lower(trim($source));
        if (! in_array($normalized, ['dump', 'database'], true)) {
            throw new \InvalidArgumentException('Unsupported Sigur sync source: ' . $source);
        }

        return $normalized;
    }

    private function renderSummary(array $summary, int $exitCode): int
    {
        if ($this->option('json')) {
            $this->line(json_encode($summary, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            return $exitCode;
        }

        if (($summary['status'] ?? 'ok') === 'failed') {
            $this->error((string) ($summary['error'] ?? 'Face ID runtime sync failed.'));
        } else {
            $this->info('Face ID runtime sync completed.');
        }

        $this->line('Mode: ' . (string) ($summary['syncMode'] ?? 'n/a'));
        $this->line('Manifest: ' . (string) ($summary['referenceManifestPath'] ?? 'n/a'));
        $this->line('Store: ' . (string) ($summary['referenceStoreDir'] ?? 'n/a'));

        if (isset($summary['warning'])) {
            $this->warn((string) $summary['warning']);
        }

        if (isset($summary['runtimeRefresh']['status'])) {
            $this->line('Runtime refresh: ' . (string) $summary['runtimeRefresh']['status']);
        }

        return $exitCode;
    }

    private function logSummary(array $summary): void
    {
        Log::info('faceid_runtime_sync_completed', [
            'syncMode' => $summary['syncMode'] ?? null,
            'referenceManifestPath' => $summary['referenceManifestPath'] ?? null,
            'referenceStoreDir' => $summary['referenceStoreDir'] ?? null,
            'runtimeRefresh' => $summary['runtimeRefresh']['status'] ?? null,
            'warning' => $summary['warning'] ?? null,
        ]);
    }
}