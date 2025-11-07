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
    $this->info("Запущен DSS Daemon (VehicleCapture каждые 3 секунды, KeepAlive каждые 22 секунды, NewToken каждые 30 минут)");

    $service = new DssService();

    $Newsession = $service->dssAutorize();
    $this->logResult('KeepAlive new session', $Newsession);

    $lastKeepAlive = time();
    $lastTokenUpdate = time();
    $lastOldCapturesDelete = time();
    $lastVehicleCapture = time();

    while (true) {
        $start = microtime(true);

        // Вызов VehicleCapture каждые 3 секунды
        if ((time() - $lastVehicleCapture) >= 3) {
            try {
                $VehicleCaptureResult = $service->dssVehicleCapture();
                $this->logResult('VehicleCapture', $VehicleCaptureResult);
            } catch (\Exception $e) {
                $this->error(now()->toDateTimeLocalString() . " Ошибка при вызове VehicleCapture: " . $e->getMessage());
            }
            $lastVehicleCapture = time();
        }

        // Вызов KeepAlive если прошло 22 секунды
        if ((time() - $lastKeepAlive) >= 22) {
            $keepAliveResult = $service->dssKeepAlive();
            $this->logResult('KeepAlive update session', $keepAliveResult);
            $lastKeepAlive = time();
        }

        // Вызов NewToken если прошло 30 минут
        if ((time() - $lastTokenUpdate) >= (30 * 60)) {
            $tokenUpdateResult = $service->dssAutorize();
            $this->logResult('NewToken', $tokenUpdateResult);
            $lastTokenUpdate = time();
        }

        // Удаление старых захватов каждые 30 минут
        if ((time() - $lastOldCapturesDelete) >= (30 * 60)) {
            $service->deleteOldVehicleCaptures();
            $this->info(now()->toDateTimeLocalString() . " Удалены старые захваты транспортных средств.");
            $lastOldCapturesDelete = time();
        }

        // Спим 1 секунду, чтобы не перегружать CPU
        sleep(1);
    }
}
    protected function logResult($operation, $result)
    {
        if (isset($result['success'])) {
            $this->info(now()->toDateTimeLocalString() . " $operation успешно выполнен.");
        } else {
            $this->error(now()->toDateTimeLocalString() . " $operation завершился с ошибкой: " . json_encode($result));
        }
    }
}
