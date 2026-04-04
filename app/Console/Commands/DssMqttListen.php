<?php

namespace App\Console\Commands;

use App\Services\DssMqttListenerService;
use Illuminate\Console\Command;
use Throwable;

class DssMqttListen extends Command
{
    protected $signature = 'dss:mqtt-listen
        {--user-id= : User id part for mq.event.msg.topic.{userId}}
        {--topic= : Explicit MQTT topic override}
        {--qos= : MQTT QoS level (0,1,2)}';

    protected $description = 'Подключается к DSS MQTT broker и слушает notifyVehicleCaptureInfo события';

    public function handle(DssMqttListenerService $listenerService): int
    {
        try {
            $listenerService->listen(
                $this->option('user-id') ? (string) $this->option('user-id') : null,
                $this->option('topic') ? (string) $this->option('topic') : null,
                $this->option('qos') !== null ? (int) $this->option('qos') : null,
                function (string $line): void {
                    $this->line(now()->toDateTimeLocalString() . ' ' . $line);
                }
            );

            return self::SUCCESS;
        } catch (Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }
    }
}