<?php

namespace App\Services;

use App\Models\DssSetings;
use App\Models\VehicleCapture;
use App\Models\Visitor;
use Carbon\Carbon;
use Illuminate\Support\Facades\File;

class DssObservabilityService
{
    public function __construct(private DssDaemonHeartbeatService $heartbeatService)
    {
    }

    public function getOverview(int $periodMinutes = 60): array
    {
        $settings = DssSetings::first();
        $heartbeat = $this->heartbeatService->read() ?? [];
        $since = now()->subMinutes($periodMinutes);

        $captureCount = VehicleCapture::where('created_at', '>=', $since)->count();
        $pendingVisitors = Visitor::where('confirmation_status', Visitor::CONFIRMATION_PENDING)->count();
        $authFailures = $this->countLogEvents('auth_fail', $since);

        return [
            'connection' => [
                'has_settings' => $settings !== null,
                'has_active_token' => !blank($settings?->token),
                'base_url' => $settings?->base_url,
                'last_keepalive_at' => $settings?->keepalive,
                'last_token_update_at' => $settings?->update_token,
            ],
            'daemon' => [
                'status' => $heartbeat['status'] ?? 'unknown',
                'heartbeat_at' => $heartbeat['heartbeat_at'] ?? null,
                'last_success_operation' => $heartbeat['last_success_operation'] ?? null,
                'last_success_at' => $heartbeat['last_success_at'] ?? null,
                'last_error_operation' => $heartbeat['last_error_operation'] ?? null,
                'last_error_at' => $heartbeat['last_error_at'] ?? null,
                'last_error_message' => $heartbeat['last_error_message'] ?? null,
                'consecutive_errors' => (int) ($heartbeat['consecutive_errors'] ?? 0),
            ],
            'metrics' => [
                'period_minutes' => $periodMinutes,
                'capture_count' => $captureCount,
                'pending_visitors' => $pendingVisitors,
                'auth_failures' => $authFailures,
                'last_capture_success_at' => $heartbeat['operations']['vehicle_capture'] ?? null,
                'last_keepalive_success_at' => $heartbeat['operations']['keepalive'] ?? null,
            ],
            'alerts' => [
                'settings_present' => $settings !== null,
                'token_present' => !blank($settings?->token),
                'keepalive_stale' => $this->isStale($heartbeat['operations']['keepalive'] ?? $settings?->keepalive, (int) config('dss.health.max_keepalive_age_seconds', 180)),
                'capture_stale' => $this->isStale($heartbeat['operations']['vehicle_capture'] ?? null, (int) config('dss.health.max_capture_age_seconds', 180)),
                'consecutive_errors' => (int) ($heartbeat['consecutive_errors'] ?? 0),
                'pending_visitors' => $pendingVisitors,
                'auth_failures' => $authFailures,
            ],
            'recent_errors' => $this->recentErrorEvents(10),
        ];
    }

    public function evaluateAlerts(): array
    {
        $overview = $this->getOverview((int) config('dss.monitoring.pending_visitors_window_minutes', 60));
        $alerts = [];

        if ($overview['alerts']['keepalive_stale']) {
            $alerts[] = [
                'key' => 'keepalive_missing',
                'severity' => 'critical',
                'message' => 'DSS keepalive отсутствует дольше допустимого порога.',
            ];
        }

        if ($overview['alerts']['capture_stale']) {
            $alerts[] = [
                'key' => 'capture_missing',
                'severity' => 'critical',
                'message' => 'DSS capture отсутствует дольше допустимого порога.',
            ];
        }

        if (($overview['metrics']['pending_visitors'] ?? 0) >= (int) config('dss.monitoring.pending_visitors_alert_threshold', 10)) {
            $alerts[] = [
                'key' => 'pending_visitors_growth',
                'severity' => 'warning',
                'message' => 'Количество pending visitor превысило порог.',
                'value' => $overview['metrics']['pending_visitors'],
            ];
        }

        if (($overview['metrics']['auth_failures'] ?? 0) >= (int) config('dss.monitoring.auth_failures_alert_threshold', 3)) {
            $alerts[] = [
                'key' => 'auth_failures_growth',
                'severity' => 'critical',
                'message' => 'Количество ошибок авторизации DSS превысило порог.',
                'value' => $overview['metrics']['auth_failures'],
            ];
        }

        return [
            'overview' => $overview,
            'alerts' => $alerts,
        ];
    }

    private function recentErrorEvents(int $limit = 10): array
    {
        $path = storage_path('logs/dss.log');
        if (!File::exists($path)) {
            return [];
        }

        $lines = preg_split('/\r\n|\r|\n/', trim(File::get($path))) ?: [];
        $errors = [];

        for ($index = count($lines) - 1; $index >= 0 && count($errors) < $limit; $index--) {
            $line = trim($lines[$index]);
            if ($line === '') {
                continue;
            }

            $decoded = json_decode($line, true);
            if (!is_array($decoded)) {
                continue;
            }

            $level = strtolower((string) ($decoded['level_name'] ?? ''));
            if (!in_array($level, ['error', 'warning', 'critical'], true)) {
                continue;
            }

            $context = $decoded['context'] ?? [];
            $errors[] = [
                'timestamp' => $decoded['datetime'] ?? ($context['timestamp'] ?? null),
                'level' => $level,
                'event' => $context['event'] ?? ($decoded['message'] ?? 'unknown'),
                'message' => $context['message'] ?? ($decoded['message'] ?? null),
                'context' => $context,
            ];
        }

        return $errors;
    }

    private function countLogEvents(string $event, Carbon $since): int
    {
        $path = storage_path('logs/dss.log');
        if (!File::exists($path)) {
            return 0;
        }

        $count = 0;
        $lines = preg_split('/\r\n|\r|\n/', trim(File::get($path))) ?: [];

        foreach ($lines as $line) {
            $decoded = json_decode(trim($line), true);
            if (!is_array($decoded)) {
                continue;
            }

            $context = $decoded['context'] ?? [];
            if (($context['event'] ?? null) !== $event) {
                continue;
            }

            $timestamp = $context['timestamp'] ?? ($decoded['datetime'] ?? null);
            if (!$timestamp) {
                continue;
            }

            try {
                if (Carbon::parse($timestamp)->gte($since)) {
                    $count++;
                }
            } catch (\Throwable) {
            }
        }

        return $count;
    }

    private function isStale(?string $timestamp, int $thresholdSeconds): bool
    {
        if (!$timestamp) {
            return true;
        }

        try {
            return Carbon::parse($timestamp)->diffInSeconds(now()) > $thresholdSeconds;
        } catch (\Throwable) {
            return true;
        }
    }
}