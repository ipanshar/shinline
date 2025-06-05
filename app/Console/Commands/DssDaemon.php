<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Services\DssService;

class DssDaemon extends Command
{
    protected $signature = 'dss:daemon';
    protected $description = 'Поддерживает DSS соединение активным и обновляет токен по расписанию';

    public function handle()
    {
        $this->info("Запущен DSS Daemon (KeepAlive каждые 22 секунды, UpdateToken каждые 28 минут)");

        $service = new DssService();

        $lastTokenUpdate = time();

        while (true) {
            $start = microtime(true);

            // Вызов KeepAlive
            $keepAliveResult = $service->dssKeepAlive();
            $this->logResult('KeepAlive', $keepAliveResult);

            // Вызов UpdateToken если прошло 30 минут
            if ((time() - $lastTokenUpdate) >= (30 * 60)) {
                $tokenUpdateResult = $service->dssUpdateToken();
                $this->logResult('UpdateToken', $tokenUpdateResult);
                $lastTokenUpdate = time();
            }

            $elapsed = microtime(true) - $start;
            $sleep = max(22 - $elapsed, 0); // учесть время выполнения
            sleep((int) $sleep);
        }
    }

    protected function logResult($operation, $result)
    {
        if (isset($result['success'])) {
            $this->info(now()->toDateTimeLocalString()." $operation успешно выполнен.");
        } else {
            $this->error(now()->toDateTimeLocalString()." $operation завершился с ошибкой: " . json_encode($result));
        }
    }
}
