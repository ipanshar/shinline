<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Services\DssService;
use Exception;

class DssDaemon extends Command
{
    protected $signature = 'dss:daemon';
    protected $description = 'Поддерживает DSS соединение активным и обновляет токен по расписанию';
    
    private $maxRetries = 3;
    private $retryDelay = 5; // секунды

    public function handle()
    {
        $this->info("Запущен DSS Daemon (VehicleCapture каждые 3 секунды, KeepAlive каждые 22 секунды, NewToken каждые 30 минут)");

        $service = new DssService();
        
        // Инициализация с повторными попытками
        $Newsession = $this->executeWithRetry(function() use ($service) {
            return $service->dssAutorize();
        });
        
        if (!$Newsession) {
            $this->error("Не удалось инициализировать сессию DSS после нескольких попыток");
            return 1;
        }
        
        $this->logResult('KeepAlive new session', $Newsession);

        $lastKeepAlive = time();
        $lastTokenUpdate = time();
        $lastOldCapturesDelete = time();
        $lastVehicleCapture = time();
        $consecutiveErrors = 0;
        $maxConsecutiveErrors = 10;

        while (true) {
            try {
                // Вызов VehicleCapture каждые 3 секунды
                if ((time() - $lastVehicleCapture) >= 3) {
                    try {
                        $VehicleCaptureResult = $this->executeWithRetry(function() use ($service) {
                            return $service->dssVehicleCapture();
                        });
                        
                        if ($VehicleCaptureResult) {
                            $this->logResult('VehicleCapture', $VehicleCaptureResult);
                            $consecutiveErrors = 0;
                        }
                    } catch (Exception $e) {
                        $consecutiveErrors++;
                        $this->error(now()->toDateTimeLocalString() . " Ошибка при вызове VehicleCapture:  " . $e->getMessage());
                        
                        // Если слишком много ошибок подряд - переподключаемся
                        if ($consecutiveErrors >= $maxConsecutiveErrors) {
                            $this->warn("Обнаружено {$consecutiveErrors} последовательных ошибок.  Попытка переподключения...");
                            $Newsession = $this->executeWithRetry(function() use ($service) {
                                return $service->dssAutorize();
                            });
                            
                            if ($Newsession) {
                                $consecutiveErrors = 0;
                                $lastTokenUpdate = time();
                                $lastKeepAlive = time();
                            }
                        }
                    }
                    $lastVehicleCapture = time();
                }

                // Вызов KeepAlive если прошло 22 секунды
                if ((time() - $lastKeepAlive) >= 22) {
                    $keepAliveResult = $this->executeWithRetry(function() use ($service) {
                        return $service->dssKeepAlive();
                    });
                    
                    if ($keepAliveResult) {
                        $this->logResult('KeepAlive update session', $keepAliveResult);
                        $consecutiveErrors = 0;
                    }
                    $lastKeepAlive = time();
                }

                // Вызов NewToken если прошло 30 минут
                if ((time() - $lastTokenUpdate) >= (30 * 60)) {
                    $tokenUpdateResult = $this->executeWithRetry(function() use ($service) {
                        return $service->dssAutorize();
                    });
                    
                    if ($tokenUpdateResult) {
                        $this->logResult('NewToken', $tokenUpdateResult);
                        $consecutiveErrors = 0;
                    }
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
                
            } catch (Exception $e) {
                $this->error(now()->toDateTimeLocalString() . " Критическая ошибка в главном цикле: " . $e->getMessage());
                sleep(5); // Подождать перед продолжением
            }
        }
    }
    
    /**
     * Выполнить функцию с повторными попытками при ошибках сети
     */
    private function executeWithRetry(callable $callback)
    {
        $attempts = 0;
        
        while ($attempts < $this->maxRetries) {
            try {
                return $callback();
            } catch (Exception $e) {
                $attempts++;
                $this->warn("Попытка {$attempts}/{$this->maxRetries} не удалась: " . $e->getMessage());
                
                if ($attempts < $this->maxRetries) {
                    sleep($this->retryDelay);
                } else {
                    $this->error("Все попытки исчерпаны");
                    return null;
                }
            }
        }
        
        return null;
    }
    
    protected function logResult($operation, $result)
    {
        if ($result && isset($result['success'])) {
            $this->info(now()->toDateTimeLocalString() . " $operation успешно выполнен.");
        } else {
            $this->error(now()->toDateTimeLocalString() . " $operation завершился с ошибкой: " .  json_encode($result));
        }
    }
}