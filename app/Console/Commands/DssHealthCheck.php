<?php

namespace App\Console\Commands;

use App\Services\DssDaemonHeartbeatService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Symfony\Component\Process\Process;

class DssHealthCheck extends Command
{
    protected $signature = 'dss:health-check
                            {--max-age=120 : Максимальный возраст heartbeat в секундах}
                            {--max-keepalive-age=180 : Максимальный возраст успешного keepalive в секундах}
                            {--max-capture-age=180 : Максимальный возраст успешного vehicle capture в секундах}
                            {--restart-service= : Имя NSSM-сервиса для рестарта при деградации}
                            {--nssm= : Полный путь до nssm.exe}
                            {--json : Вывести результат в JSON}';

    protected $description = 'Проверяет реальное состояние DSS daemon по heartbeat и при необходимости перезапускает NSSM service';

    public function handle(DssDaemonHeartbeatService $heartbeatService): int
    {
        $heartbeat = $heartbeatService->read();
        if (!$heartbeat) {
            return $this->failCheck('Heartbeat file not found', ['path' => $heartbeatService->path()]);
        }

        $issues = [];
        $now = now();

        $this->checkAge($issues, 'heartbeat', $heartbeat['heartbeat_at'] ?? null, (int) $this->option('max-age'), $now);
        $this->checkAge($issues, 'keepalive', $heartbeat['operations']['keepalive'] ?? null, (int) $this->option('max-keepalive-age'), $now);
        $this->checkAge($issues, 'vehicle_capture', $heartbeat['operations']['vehicle_capture'] ?? null, (int) $this->option('max-capture-age'), $now);

        if (($heartbeat['status'] ?? null) === 'stopped') {
            $issues[] = 'Daemon heartbeat status is stopped';
        }

        if (!empty($issues)) {
            $restarted = $this->restartServiceIfNeeded();

            return $this->failCheck('DSS daemon health-check failed', [
                'issues' => $issues,
                'heartbeat' => $heartbeat,
                'restart_attempted' => $restarted,
            ]);
        }

        $payload = [
            'status' => 'ok',
            'message' => 'DSS daemon heartbeat is healthy',
            'heartbeat' => $heartbeat,
        ];

        if ($this->option('json')) {
            $this->line(json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        } else {
            $this->info('DSS daemon heartbeat is healthy');
            $this->line('Heartbeat file: ' . $heartbeatService->path());
            $this->line('Last keepalive: ' . ($heartbeat['operations']['keepalive'] ?? 'n/a'));
            $this->line('Last vehicle capture: ' . ($heartbeat['operations']['vehicle_capture'] ?? 'n/a'));
        }

        return self::SUCCESS;
    }

    private function checkAge(array &$issues, string $label, ?string $timestamp, int $thresholdSeconds, Carbon $now): void
    {
        if (!$timestamp) {
            $issues[] = "{$label} timestamp is missing";
            return;
        }

        try {
            $age = Carbon::parse($timestamp)->diffInSeconds($now);
        } catch (\Throwable) {
            $issues[] = "{$label} timestamp is invalid";
            return;
        }

        if ($age > $thresholdSeconds) {
            $issues[] = "{$label} is stale: {$age}s > {$thresholdSeconds}s";
        }
    }

    private function restartServiceIfNeeded(): bool
    {
        $serviceName = $this->option('restart-service');
        if (!$serviceName) {
            return false;
        }

        $nssmPath = $this->option('nssm')
            ?: config('dss.health.nssm_path')
            ?: 'nssm';

        try {
            $process = new Process([$nssmPath, 'restart', $serviceName]);
            $process->setTimeout(30);
            $process->run();

            if ($process->isSuccessful()) {
                $this->warn("NSSM service '{$serviceName}' restarted successfully.");
                return true;
            }

            $this->error("Failed to restart NSSM service '{$serviceName}': " . $process->getErrorOutput());
            return false;
        } catch (\Throwable $exception) {
            $this->error("Failed to execute NSSM restart for '{$serviceName}': " . $exception->getMessage());
            return false;
        }
    }

    private function failCheck(string $message, array $payload): int
    {
        $response = array_merge(['status' => 'failed', 'message' => $message], $payload);

        if ($this->option('json')) {
            $this->line(json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        } else {
            $this->error($message);
            foreach (($payload['issues'] ?? []) as $issue) {
                $this->line('- ' . $issue);
            }
        }

        return self::FAILURE;
    }
}