<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

class DssStructuredLogger
{
    public function info(string $event, array $context = []): void
    {
        $this->write('info', $event, $context);
    }

    public function warning(string $event, array $context = []): void
    {
        $this->write('warning', $event, $context);
    }

    public function error(string $event, array $context = []): void
    {
        $this->write('error', $event, $context);
    }

    private function write(string $level, string $event, array $context = []): void
    {
        Log::channel('dss')->{$level}($event, array_merge([
            'event' => $event,
            'timestamp' => now()->toIso8601String(),
            'source' => 'dss',
        ], $context));
    }
}