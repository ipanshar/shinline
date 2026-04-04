<?php

namespace App\Console\Commands;

use App\Services\DssMqttListenerService;
use Illuminate\Console\Command;
use Throwable;

class DssMqttListen extends Command
{
    protected $signature = 'dss:mqtt-listen
        {--user-id= : DSS userId for user-scoped topics}
        {--topic= : Explicit MQTT topic override, one or many topics separated by comma}
        {--qos= : MQTT QoS level (0,1,2)}
        {--dump-raw : Print raw MQTT payloads for diagnostics}';

    protected $description = 'Подключается к DSS MQTT broker и слушает стандартные DSS topics';

    public function handle(DssMqttListenerService $listenerService): int
    {
        try {
            $listenerService->listen(
                $this->option('user-id') ? (string) $this->option('user-id') : null,
                $this->option('topic') ? (string) $this->option('topic') : null,
                $this->option('qos') !== null ? (int) $this->option('qos') : null,
                function (string $line): void {
                    $this->line(now()->toDateTimeLocalString() . ' ' . $line);
                },
                (bool) $this->option('dump-raw')
            );

            return self::SUCCESS;
        } catch (Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }
    }
}