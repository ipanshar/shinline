<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Services\DssService;
use App\Services\DssDaemonHeartbeatService;
use App\Services\DssPermitVehicleService;
use App\Models\EntryPermit;
use App\Models\Task;
use App\Models\Status;
use Carbon\Carbon;
use Exception;

class DssDaemon extends Command
{
    protected $signature = 'dss:daemon';
    protected $description = 'Временный polling bridge для DSS: получает события и складывает тяжёлую обработку в очереди';
    
    private $maxRetries = 3;
    private $retryDelay = 5; // секунды
    private $reconnectDelay = 30; // секунды между попытками переподключения

    public function handle()
    {
        $vehicleCaptureInterval = max(1, (int) config('dss.polling.capture_interval_seconds', 600));
        $vehicleCaptureLookback = max($vehicleCaptureInterval, (int) config('dss.polling.capture_history_window_seconds', 900));

        $this->info("Запущен DSS Daemon (polling bridge: VehicleCapture каждые {$vehicleCaptureInterval} секунд, KeepAlive каждые 22 секунды, NewToken каждые 30 минут)");
        $this->warn('Для production рекомендуется supervisor-managed queue workers для очередей dss-enrichment, dss-media, dss-notifications.');

        $service = app(DssService::class);
        $heartbeat = app(DssDaemonHeartbeatService::class);
        $heartbeat->boot([
            'service' => 'dss:daemon',
            'notes' => 'Polling bridge daemon is starting',
        ]);
        
        // Инициализация с бесконечными попытками переподключения
        $Newsession = $this->initializeWithInfiniteRetry($service);
        $heartbeat->recordSuccess('authorize', ['authorization' => $Newsession]);
        
        $this->logResult('KeepAlive new session', $Newsession);

        $lastKeepAlive = time();
        $lastTokenUpdate = time();
        $lastVehicleCapture = time();
        $lastCleanupCheck = Carbon::now();  // Для ежедневной очистки
        $consecutiveErrors = 0;
        $maxConsecutiveErrors = 10;

        while (true) {
            try {
                $heartbeat->touch('running');

                // Историческая подкачка VehicleCapture по расписанию
                if ((time() - $lastVehicleCapture) >= $vehicleCaptureInterval) {
                    try {
                        $heartbeat->touch('vehicle_capture');
                        $VehicleCaptureResult = $this->executeWithRetry(function() use ($service, $vehicleCaptureLookback) {
                            return $service->dssVehicleCapture($vehicleCaptureLookback);
                        });
                        
                        if ($VehicleCaptureResult) {
                            $heartbeat->recordSuccess('vehicle_capture', [
                                'vehicle_capture' => $VehicleCaptureResult,
                            ]);
                            $this->logResult('VehicleCapture', $VehicleCaptureResult);
                            $consecutiveErrors = 0;
                        }
                    } catch (Exception $e) {
                        $heartbeat->recordFailure('vehicle_capture', $e->getMessage());
                        $consecutiveErrors++;
                        $this->error(now()->toDateTimeLocalString() . " Ошибка при вызове VehicleCapture:  " . $e->getMessage());
                        
                        // Если слишком много ошибок подряд - переподключаемся
                        if ($consecutiveErrors >= $maxConsecutiveErrors) {
                            $this->warn("Обнаружено {$consecutiveErrors} последовательных ошибок. Попытка переподключения...");
                            $Newsession = $this->initializeWithInfiniteRetry($service);
                            $consecutiveErrors = 0;
                            $lastTokenUpdate = time();
                            $lastKeepAlive = time();
                        }
                    }
                    $lastVehicleCapture = time();
                }

                // Вызов KeepAlive если прошло 22 секунды
                if ((time() - $lastKeepAlive) >= 22) {
                    $heartbeat->touch('keepalive');
                    $keepAliveResult = $this->executeWithRetry(function() use ($service) {
                        return $service->dssKeepAlive();
                    });
                    
                    if ($keepAliveResult) {
                        $heartbeat->recordSuccess('keepalive', [
                            'keepalive' => $keepAliveResult,
                        ]);
                        $this->logResult('KeepAlive update session', $keepAliveResult);
                        $consecutiveErrors = 0;
                    }
                    $lastKeepAlive = time();
                }

                // Вызов NewToken если прошло 30 минут
                if ((time() - $lastTokenUpdate) >= (30 * 60)) {
                    $heartbeat->touch('token_refresh');
                    $tokenUpdateResult = $this->executeWithRetry(function() use ($service) {
                        return $service->dssAutorize();
                    });
                    
                    if ($tokenUpdateResult) {
                        $heartbeat->recordSuccess('token_refresh', [
                            'token_refresh' => $tokenUpdateResult,
                        ]);
                        $this->logResult('NewToken', $tokenUpdateResult);
                        $consecutiveErrors = 0;
                    }
                    $lastTokenUpdate = time();
                }

                // Ежедневная очистка просроченных разрешений и задач (в 00:05)
                $now = Carbon::now();
                if ($now->format('Y-m-d') !== $lastCleanupCheck->format('Y-m-d') && $now->hour === 0 && $now->minute >= 5) {
                    $heartbeat->touch('cleanup');
                    $this->cleanupExpiredPermitsAndTasks();
                    $heartbeat->recordSuccess('cleanup');
                    $lastCleanupCheck = $now;
                }

                // Спим 1 секунду, чтобы не перегружать CPU
                sleep(1);
                
            } catch (Exception $e) {
                $heartbeat->recordFailure('main_loop', $e->getMessage());
                $this->error(now()->toDateTimeLocalString() . " Критическая ошибка в главном цикле: " . $e->getMessage());
                $this->warn("Попытка восстановления соединения...");
                
                // Пытаемся переподключиться бесконечно
                $Newsession = $this->initializeWithInfiniteRetry($service);
                $heartbeat->recordSuccess('authorize', ['authorization' => $Newsession]);
                $consecutiveErrors = 0;
                $lastTokenUpdate = time();
                $lastKeepAlive = time();
                $lastVehicleCapture = time();
            }
        }
    }
    
    /**
     * Инициализация с бесконечными попытками переподключения
     * Никогда не завершается, пока соединение не будет установлено
     */
    private function initializeWithInfiniteRetry(DssService $service)
    {
        $attempt = 0;
        $heartbeat = app(DssDaemonHeartbeatService::class);
        
        while (true) {
            $attempt++;
            
            try {
                $heartbeat->touch('authorize_retry', ['authorize_attempt' => $attempt]);
                $result = $this->executeWithRetry(function() use ($service) {
                    return $service->dssAutorize();
                });
                
                if ($result) {
                    $heartbeat->recordSuccess('authorize', [
                        'authorize_attempt' => $attempt,
                    ]);
                    if ($attempt > 1) {
                        $this->info(now()->toDateTimeLocalString() . " Соединение восстановлено после {$attempt} попыток");
                    }
                    return $result;
                }
            } catch (Exception $e) {
                $heartbeat->recordFailure('authorize', $e->getMessage(), [
                    'authorize_attempt' => $attempt,
                ]);
                $this->error(now()->toDateTimeLocalString() . " Ошибка при подключении: " . $e->getMessage());
            }
            
            $this->warn(now()->toDateTimeLocalString() . " Не удалось подключиться к DSS. Повторная попытка через {$this->reconnectDelay} секунд... (попытка #{$attempt})");
            sleep($this->reconnectDelay);
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

    /**
     * Очистка просроченных разовых разрешений и старых задач со статусом "новый"
     */
    private function cleanupExpiredPermitsAndTasks()
    {
        $this->info(now()->toDateTimeLocalString() . " Запуск ежедневной очистки просроченных разрешений и задач...");
        
        try {
            $permitVehicleService = app(DssPermitVehicleService::class);
            $activeStatus = Status::where('key', 'active')->first();
            $inactiveStatus = Status::where('key', 'not_active')->first();
            $newStatus = Status::where('key', 'new')->first();
            $canceledStatus = Status::where('key', 'canceled')->first();
            
            // 1. Деактивируем просроченные разовые разрешения
            $expiredPermitsCount = 0;
            $dssRevokedCount = 0;
            $dssRevokeFailedCount = 0;
            $dssRevokeSkippedCount = 0;
            if ($activeStatus && $inactiveStatus) {
                $expiredPermits = EntryPermit::where('status_id', $activeStatus->id)
                    ->where('one_permission', true)
                    ->where('end_date', '<', now()->startOfDay())
                    ->get();

                foreach ($expiredPermits as $permit) {
                    $permit->update(['status_id' => $inactiveStatus->id]);
                    $expiredPermitsCount++;

                    $revokeResult = $permitVehicleService->revokePermitVehicleSafely($permit->fresh());

                    if (!empty($revokeResult['success'])) {
                        $dssRevokedCount++;
                    } elseif (isset($revokeResult['error'])) {
                        $dssRevokeFailedCount++;
                    } else {
                        $dssRevokeSkippedCount++;
                    }
                }
            }
            
            // 2. Отменяем старые задачи со статусом "новый" (старше 7 дней)
            $oldTasksCount = 0;
            $cutoffDate = Carbon::now()->subDays(7);
            $targetStatus = $canceledStatus ?? $inactiveStatus;
            
            if ($newStatus && $targetStatus) {
                $oldTasksCount = Task::where('status_id', $newStatus->id)
                    ->where(function ($query) use ($cutoffDate) {
                        $query->where('plan_date', '<', $cutoffDate)
                              ->orWhere(function ($q) use ($cutoffDate) {
                                  $q->whereNull('plan_date')
                                    ->where('created_at', '<', $cutoffDate);
                              });
                    })
                    ->update([
                        'status_id' => $targetStatus->id,
                        'end_date' => now(),
                    ]);
            }
            
            $this->info(now()->toDateTimeLocalString() . " Очистка завершена: деактивировано {$expiredPermitsCount} разрешений, DSS отзывов {$dssRevokedCount} успешно / {$dssRevokeFailedCount} ошибок / {$dssRevokeSkippedCount} пропущено, отменено {$oldTasksCount} задач.");
            
        } catch (Exception $e) {
            $this->error(now()->toDateTimeLocalString() . " Ошибка при очистке: " . $e->getMessage());
        }
    }
}