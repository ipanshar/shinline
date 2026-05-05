<?php

namespace App\Console\Commands;

use App\Models\EntryPermit;
use App\Models\GuestVisitPermit;
use App\Models\Status;
use App\Models\Task;
use App\Services\DssPermitVehicleService;
use App\Services\GuestVisitPermitService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class CleanupOldTasksAndPermits extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'cleanup:old-tasks-permits 
                            {--days=7 : Количество дней (задачи старше этого срока будут обработаны)}
                            {--dry-run : Показать что будет сделано, без реальных изменений}
                            {--force : Выполнить без подтверждения}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Завершает старые задачи со статусом "новый", деактивирует просроченные одноразовые и гостевые разрешения';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $days = (int) $this->option('days');
        $dryRun = $this->option('dry-run');
        $force = $this->option('force');
        
        $cutoffDate = Carbon::now()->subDays($days);
        
        $this->info("=== Очистка старых задач и разрешений ===");
        $this->info("Дата отсечки: {$cutoffDate->format('Y-m-d H:i:s')} (старше {$days} дней)");
        
        if ($dryRun) {
            $this->warn(">>> РЕЖИМ ПРЕДПРОСМОТРА (dry-run) - изменения НЕ будут применены <<<");
        }
        
        // Получаем статусы
        $newStatus = Status::where('key', 'new')->first();
        $canceledStatus = Status::where('key', 'canceled')->first();
        $completedStatus = Status::where('key', 'completed')->first();
        $leftTerritoryStatus = Status::where('key', 'left_territory')->first();
        $activeStatus = Status::where('key', 'active')->first();
        $inactiveStatus = Status::where('key', 'not_active')->first();
        
        if (!$newStatus) {
            $this->error("Статус 'new' не найден в базе данных!");
            return 1;
        }
        
        // Статус для завершения задач - предпочитаем 'canceled', иначе 'completed' или 'left_territory'
        $targetStatus = $canceledStatus ?? $completedStatus ?? $leftTerritoryStatus;
        
        if (!$targetStatus) {
            $this->error("Не найден подходящий статус для завершения задач!");
            return 1;
        }
        
        $this->info("Статус для завершения задач: {$targetStatus->name} (key: {$targetStatus->key})");
        $this->newLine();
        
        // === 1. Находим старые задачи со статусом "новый" ===
        $oldTasks = Task::where('status_id', $newStatus->id)
            ->where(function ($query) use ($cutoffDate) {
                $query->where('plan_date', '<', $cutoffDate)
                      ->orWhere(function ($q) use ($cutoffDate) {
                          $q->whereNull('plan_date')
                            ->where('created_at', '<', $cutoffDate);
                      });
            })
            ->get();
        
        $this->info("Найдено задач со статусом 'новый' старше {$days} дней: " . $oldTasks->count());
        
        if ($oldTasks->count() > 0) {
            $this->table(
                ['ID', 'Название', 'План. дата', 'Создана', 'Описание'],
                $oldTasks->take(20)->map(function ($task) {
                    return [
                        $task->id,
                        $task->name,
                        $task->plan_date ? Carbon::parse($task->plan_date)->format('d.m.Y') : '-',
                        Carbon::parse($task->created_at)->format('d.m.Y'),
                        mb_substr($task->description ?? '-', 0, 40),
                    ];
                })
            );
            
            if ($oldTasks->count() > 20) {
                $this->info("... и ещё " . ($oldTasks->count() - 20) . " задач");
            }
        }
        
        $this->newLine();
        
        // === 2. Находим активные одноразовые разрешения с истёкшим сроком ===
        $expiredPermitsQuery = EntryPermit::where('one_permission', true)
            ->where('end_date', '<', now()->startOfDay());
        
        // Фильтруем только активные, если статус найден
        if ($activeStatus) {
            $expiredPermitsQuery->where('status_id', $activeStatus->id);
        }
        
        $expiredPermits = $expiredPermitsQuery->get();
        
        $this->info("Найдено одноразовых разрешений старше {$days} дней: " . $expiredPermits->count());
        
        if ($expiredPermits->count() > 0) {
            // Группируем по двору для статистики
            $permitsByYard = $expiredPermits->groupBy('yard_id');
            $this->info("Разрешения по дворам:");
            foreach ($permitsByYard as $yardId => $permits) {
                $yardName = $permits->first()->yard->name ?? "Двор #{$yardId}";
                $this->line("  - {$yardName}: {$permits->count()} шт.");
            }
        }
        
        $this->newLine();

        // === 3. Находим гостевые разрешения с истёкшим сроком ===
        $expiredGuestPermitLinksQuery = GuestVisitPermit::query()
            ->with(['entryPermit.yard'])
            ->where('permit_subject_type', 'vehicle')
            ->whereNull('revoked_at')
            ->whereNotNull('entry_permit_id')
            ->whereHas('entryPermit', function ($query) use ($activeStatus) {
                $query->whereNotNull('end_date')
                    ->where('end_date', '<', now());

                if ($activeStatus) {
                    $query->where('status_id', $activeStatus->id);
                }
            });

        $expiredGuestPermitLinks = $expiredGuestPermitLinksQuery->get();

        $this->info('Найдено гостевых разрешений с истёкшим сроком: ' . $expiredGuestPermitLinks->count());

        if ($expiredGuestPermitLinks->count() > 0) {
            $guestPermitsByYard = $expiredGuestPermitLinks
                ->filter(fn (GuestVisitPermit $permitLink) => $permitLink->entryPermit !== null)
                ->groupBy(fn (GuestVisitPermit $permitLink) => $permitLink->entryPermit->yard_id);

            $this->info('Гостевые разрешения по дворам:');
            foreach ($guestPermitsByYard as $yardId => $permitLinks) {
                $yardName = $permitLinks->first()?->entryPermit?->yard?->name ?? "Двор #{$yardId}";
                $this->line("  - {$yardName}: {$permitLinks->count()} шт.");
            }
        }

        $this->newLine();
        
        // === Подтверждение ===
        if (!$dryRun && !$force) {
            $totalPermitsToRevoke = $expiredPermits->count() + $expiredGuestPermitLinks->count();

            if (!$this->confirm("Продолжить? Будет обновлено {$oldTasks->count()} задач и деактивировано/отозвано {$totalPermitsToRevoke} разрешений")) {
                $this->info("Операция отменена.");
                return 0;
            }
        }
        
        if ($dryRun) {
            $this->warn("Dry-run завершён. Для применения изменений запустите без --dry-run");
            return 0;
        }
        
        // === Применяем изменения ===
        DB::beginTransaction();
        
        try {
            $permitVehicleService = app(DssPermitVehicleService::class);
            /** @var GuestVisitPermitService $guestVisitPermitService */
            $guestVisitPermitService = app(GuestVisitPermitService::class);

            // Обновляем задачи
            $tasksUpdated = 0;
            foreach ($oldTasks as $task) {
                $task->update([
                    'status_id' => $targetStatus->id,
                    'end_date' => $task->end_date ?? Carbon::now(),
                ]);
                $tasksUpdated++;
            }
            
            // Деактивируем разрешения
            $permitsDeactivated = 0;
            $dssRevokeSummary = [
                'success' => 0,
                'failed' => 0,
                'skipped' => 0,
            ];
            $guestPermitsRevoked = 0;
            if ($inactiveStatus) {
                foreach ($expiredPermits as $permit) {
                    if ($activeStatus && (int) $permit->status_id !== (int) $activeStatus->id) {
                        continue;
                    }

                    $permit->update(['status_id' => $inactiveStatus->id]);
                    $permitsDeactivated++;

                    $revokeResult = $permitVehicleService->revokePermitVehicleSafely($permit->fresh());

                    if (!empty($revokeResult['success'])) {
                        $dssRevokeSummary['success']++;
                    } elseif (isset($revokeResult['error'])) {
                        $dssRevokeSummary['failed']++;
                    } else {
                        $dssRevokeSummary['skipped']++;
                    }
                }
            } else {
                $this->warn("Статус 'not_active' не найден, разрешения не деактивированы");
            }

            foreach ($expiredGuestPermitLinks as $permitLink) {
                $result = $guestVisitPermitService->revokeVehiclePermitLink($permitLink);

                if (($result['status'] ?? null) === 'revoked') {
                    $guestPermitsRevoked++;
                }

                $dssResult = $result['dss_vehicle_revoke'] ?? null;

                if (!empty($dssResult['success'])) {
                    $dssRevokeSummary['success']++;
                } elseif (is_array($dssResult) && isset($dssResult['error'])) {
                    $dssRevokeSummary['failed']++;
                } else {
                    $dssRevokeSummary['skipped']++;
                }
            }
            
            DB::commit();
            
            $this->newLine();
            $this->info("=== Результаты ===");
            $this->info("✓ Задач обновлено (статус -> {$targetStatus->name}): {$tasksUpdated}");
            $this->info("✓ Разрешений деактивировано: {$permitsDeactivated}");
            $this->info("✓ Гостевых разрешений отозвано: {$guestPermitsRevoked}");
            $this->info("✓ DSS отзывов: {$dssRevokeSummary['success']} успешно, {$dssRevokeSummary['failed']} с ошибкой, {$dssRevokeSummary['skipped']} пропущено");
            
            // Логируем только если были изменения
            if ($tasksUpdated > 0 || $permitsDeactivated > 0 || $guestPermitsRevoked > 0) {
                Log::info('CleanupOldTasksAndPermits выполнено', [
                    'tasks_updated' => $tasksUpdated,
                    'permits_deactivated' => $permitsDeactivated,
                    'guest_permits_revoked' => $guestPermitsRevoked,
                    'dss_revoke_summary' => $dssRevokeSummary,
                    'cutoff_date' => $cutoffDate->format('Y-m-d'),
                ]);
            }
            
        } catch (\Exception $e) {
            DB::rollBack();
            $this->error("Ошибка: " . $e->getMessage());
            Log::error('CleanupOldTasksAndPermits ошибка', [
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return 1;
        }
        
        return 0;
    }
}
