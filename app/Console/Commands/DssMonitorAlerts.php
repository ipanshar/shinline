<?php

namespace App\Console\Commands;

use App\Services\DssNotificationService;
use App\Services\DssObservabilityService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

class DssMonitorAlerts extends Command
{
    protected $signature = 'dss:monitor-alerts {--force : Ignore cooldown and send alerts immediately}';

    protected $description = 'Проверяет DSS health indicators и отправляет alerting при деградации';

    public function handle(DssObservabilityService $observabilityService, DssNotificationService $notificationService): int
    {
        $result = $observabilityService->evaluateAlerts();
        $alerts = $result['alerts'] ?? [];

        if (empty($alerts)) {
            $this->info('No DSS alerts');
            return self::SUCCESS;
        }

        foreach ($alerts as $alert) {
            $cooldownKey = 'dss:alert:' . $alert['key'];
            $cooldownMinutes = (int) config('dss.monitoring.alert_cooldown_minutes', 15);

            if (!$this->option('force') && Cache::has($cooldownKey)) {
                continue;
            }

            $notificationService->send($this->formatAlertMessage($alert, $result['overview']));
            Cache::put($cooldownKey, true, now()->addMinutes($cooldownMinutes));
            $this->warn('Alert sent: ' . $alert['key']);
        }

        return self::SUCCESS;
    }

    private function formatAlertMessage(array $alert, array $overview): string
    {
        return "<b>⚠️ DSS Alert</b>\n\n"
            . '<b>Тип:</b> ' . e($alert['key']) . "\n"
            . '<b>Уровень:</b> ' . e($alert['severity'] ?? 'warning') . "\n"
            . '<b>Сообщение:</b> ' . e($alert['message'] ?? 'Unknown') . "\n"
            . '<b>Pending visitors:</b> ' . e((string) ($overview['metrics']['pending_visitors'] ?? 0)) . "\n"
            . '<b>Ошибки авторизации:</b> ' . e((string) ($overview['metrics']['auth_failures'] ?? 0)) . "\n"
            . '<b>Последний keepalive:</b> ' . e((string) ($overview['metrics']['last_keepalive_success_at'] ?? 'n/a')) . "\n"
            . '<b>Последний capture:</b> ' . e((string) ($overview['metrics']['last_capture_success_at'] ?? 'n/a'));
    }
}