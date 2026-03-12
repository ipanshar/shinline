<?php

namespace App\Services;

use Illuminate\Support\Facades\File;

class DssDaemonHeartbeatService
{
    public function boot(array $context = []): void
    {
        $this->write(array_merge([
            'status' => 'starting',
            'started_at' => now()->toIso8601String(),
            'consecutive_errors' => 0,
            'pid' => getmypid(),
            'host' => gethostname(),
        ], $context));
    }

    public function touch(string $stage = 'running', array $context = []): void
    {
        $heartbeat = $this->read() ?? [];

        $this->write(array_merge($heartbeat, [
            'status' => $stage,
            'heartbeat_at' => now()->toIso8601String(),
            'pid' => getmypid(),
            'host' => gethostname(),
        ], $context));
    }

    public function recordSuccess(string $operation, array $context = []): void
    {
        $heartbeat = $this->read() ?? [];
        $timestamp = now()->toIso8601String();

        $this->write(array_merge($heartbeat, [
            'status' => 'running',
            'heartbeat_at' => $timestamp,
            'last_success_operation' => $operation,
            'last_success_at' => $timestamp,
            'consecutive_errors' => 0,
            'operations' => array_merge($heartbeat['operations'] ?? [], [
                $operation => $timestamp,
            ]),
            'last_error_at' => $heartbeat['last_error_at'] ?? null,
            'last_error_operation' => $heartbeat['last_error_operation'] ?? null,
            'last_error_message' => $heartbeat['last_error_message'] ?? null,
        ], $context));
    }

    public function recordFailure(string $operation, string $message, array $context = []): void
    {
        $heartbeat = $this->read() ?? [];
        $timestamp = now()->toIso8601String();

        $this->write(array_merge($heartbeat, [
            'status' => 'degraded',
            'heartbeat_at' => $timestamp,
            'last_error_at' => $timestamp,
            'last_error_operation' => $operation,
            'last_error_message' => $message,
            'consecutive_errors' => ((int) ($heartbeat['consecutive_errors'] ?? 0)) + 1,
        ], $context));
    }

    public function recordStop(string $reason = 'stopped'): void
    {
        $heartbeat = $this->read() ?? [];

        $this->write(array_merge($heartbeat, [
            'status' => 'stopped',
            'stopped_at' => now()->toIso8601String(),
            'stop_reason' => $reason,
        ]));
    }

    public function read(): ?array
    {
        $path = $this->path();
        if (!File::exists($path)) {
            return null;
        }

        $raw = File::get($path);
        if ($raw === '') {
            return null;
        }

        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : null;
    }

    public function path(): string
    {
        return storage_path(config('dss.health.heartbeat_file', 'app/dss/daemon-heartbeat.json'));
    }

    private function write(array $payload): void
    {
        $path = $this->path();
        File::ensureDirectoryExists(dirname($path));
        File::put($path, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
}