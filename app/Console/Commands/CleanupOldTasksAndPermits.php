<?php

namespace App\Console\Commands;

use App\Models\EntryPermit;
use App\Models\Status;
use App\Models\Task;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

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
    protected $description = 'Завершает старые задачи со статусом "новый" и аннулирует одноразовые разрешения';

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
        
        // === 2. Находим одноразовые разрешения с истёкшим сроком ===
        $expiredPermits = EntryPermit::where('one_permission', true)
            ->where(function ($query) use ($cutoffDate) {
                $query->where('end_date', '<', $cutoffDate)
                      ->orWhere(function ($q) use ($cutoffDate) {
                          $q->whereNull('end_date')
                            ->where('created_at', '<', $cutoffDate);
                      });
            })
            ->get();
        
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
        
        // === Подтверждение ===
        if (!$dryRun && !$force) {
            if (!$this->confirm("Продолжить? Будет обновлено {$oldTasks->count()} задач и удалено {$expiredPermits->count()} разрешений")) {
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
            // Обновляем задачи
            $tasksUpdated = 0;
            foreach ($oldTasks as $task) {
                $task->update([
                    'status_id' => $targetStatus->id,
                    'end_date' => $task->end_date ?? Carbon::now(),
                ]);
                $tasksUpdated++;
            }
            
            // Удаляем разрешения
            $permitsDeleted = EntryPermit::where('one_permission', true)
                ->where(function ($query) use ($cutoffDate) {
                    $query->where('end_date', '<', $cutoffDate)
                          ->orWhere(function ($q) use ($cutoffDate) {
                              $q->whereNull('end_date')
                                ->where('created_at', '<', $cutoffDate);
                          });
                })
                ->delete();
            
            DB::commit();
            
            $this->newLine();
            $this->info("=== Результаты ===");
            $this->info("✓ Задач обновлено (статус -> {$targetStatus->name}): {$tasksUpdated}");
            $this->info("✓ Разрешений удалено: {$permitsDeleted}");
            
        } catch (\Exception $e) {
            DB::rollBack();
            $this->error("Ошибка: " . $e->getMessage());
            return 1;
        }
        
        return 0;
    }
}
