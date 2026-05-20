<?php

namespace App\Console\Commands;

use App\Models\Status;
use App\Models\Task;
use App\Models\Visitor;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class AutoClosePendingVisitorsCommand extends Command
{
    protected $signature = 'visitors:auto-close-pending
                            {--hours=2 : Закрывать pending-визиты старше указанного числа часов}
                            {--dry-run : Только показать, что будет закрыто, без изменений}';

    protected $description = 'Автоматически отклоняет зависшие pending-визиты и закрывает задания без активных визитов';

    public function handle(): int
    {
        $hours  = max(1, (int) $this->option('hours'));
        $dryRun = (bool) $this->option('dry-run');
        $cutoff = Carbon::now()->subHours($hours);

        $this->info("=== Авто-закрытие зависших pending-визитов ===");
        $this->info("Порог: {$hours} ч. (старше {$cutoff->format('Y-m-d H:i:s')})");

        if ($dryRun) {
            $this->warn(">>> РЕЖИМ ПРЕДПРОСМОТРА (dry-run) — изменения НЕ применяются <<<");
        }

        // --- 1. Найти pending-визиты старше порога ---
        $visitors = Visitor::query()
            ->where('confirmation_status', Visitor::CONFIRMATION_PENDING)
            ->whereNull('exit_date')
            ->where(function ($q) use ($cutoff) {
                $q->where('entry_date', '<', $cutoff)
                  ->orWhere(function ($inner) use ($cutoff) {
                      $inner->whereNull('entry_date')
                            ->where('created_at', '<', $cutoff);
                  });
            })
            ->get();

        if ($visitors->isEmpty()) {
            $this->info('Зависших pending-визитов не найдено.');
            return self::SUCCESS;
        }

        $this->info("Найдено pending-визитов: {$visitors->count()}");
        $this->table(
            ['ID', 'ТС', 'Въезд', 'Создан', 'Task ID'],
            $visitors->take(30)->map(fn(Visitor $v) => [
                $v->id,
                $v->plate_number ?? '—',
                $v->entry_date?->format('d.m.Y H:i') ?? '—',
                Carbon::parse($v->created_at)->format('d.m.Y H:i'),
                $v->task_id ?? '—',
            ])
        );

        if ($visitors->count() > 30) {
            $this->line('... показаны первые 30');
        }

        if ($dryRun) {
            $this->newLine();
            $this->warn('Dry-run завершён. Для применения запустите без --dry-run.');
            return self::SUCCESS;
        }

        // --- Загрузить нужные статусы ---
        $leftTerritoryStatus = Status::where('key', 'left_territory')->first();
        $canceledStatus      = Status::where('key', 'canceled')->first();
        $completedStatus     = Status::where('key', 'completed')->first();
        $taskCloseStatus     = $canceledStatus ?? $completedStatus;

        $closedAt = Carbon::now();

        // Собираем task_id для последующей проверки
        $taskIds = $visitors->pluck('task_id')->filter()->unique()->values()->all();

        // --- 2. Закрыть pending-визиты ---
        $visitorsClosed = 0;

        DB::beginTransaction();
        try {
            foreach ($visitors as $visitor) {
                $update = [
                    'confirmation_status' => Visitor::CONFIRMATION_REJECTED,
                    'confirmed_at'        => $closedAt,
                    // Если въезда не было — exit_date не ставим; если был — проставляем
                    'exit_date'           => $visitor->entry_date ? ($visitor->exit_date ?? $closedAt) : null,
                ];

                if ($leftTerritoryStatus) {
                    $update['status_id'] = $leftTerritoryStatus->id;
                }

                // Дописываем комментарий
                $note    = "[AUTO] Pending-визит отклонён командой visitors:auto-close-pending {$closedAt->format('d.m.Y H:i')}";
                $current = trim((string) $visitor->comment);
                $update['comment'] = $current !== '' ? $current . PHP_EOL . $note : $note;

                $visitor->update($update);
                $visitorsClosed++;
            }

            // --- 3. Проверить задания и закрыть те, у которых нет активных визитов ---
            $tasksClosed = 0;

            if ($taskCloseStatus && !empty($taskIds)) {
                foreach ($taskIds as $taskId) {
                    $task = Task::find($taskId);
                    if (!$task) {
                        continue;
                    }

                    // Уже закрыто?
                    $alreadyClosed = in_array(
                        optional(Status::find($task->status_id))->key,
                        ['completed', 'canceled', 'left_territory']
                    );
                    if ($alreadyClosed) {
                        continue;
                    }

                    // Есть ли у задания другие «живые» визиты?
                    $hasActiveVisitor = Visitor::where('task_id', $taskId)
                        ->where('confirmation_status', Visitor::CONFIRMATION_CONFIRMED)
                        ->whereNull('exit_date')
                        ->exists();

                    if ($hasActiveVisitor) {
                        continue; // Задание ещё активно — не трогаем
                    }

                    $task->update([
                        'status_id' => $taskCloseStatus->id,
                        'end_date'  => $task->end_date ?? $closedAt,
                    ]);
                    $tasksClosed++;
                }
            }

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error('Ошибка: ' . $e->getMessage());
            Log::error('AutoClosePendingVisitors ошибка', [
                'message' => $e->getMessage(),
                'trace'   => $e->getTraceAsString(),
            ]);
            return self::FAILURE;
        }

        $this->newLine();
        $this->info("✓ Закрыто pending-визитов: {$visitorsClosed}");
        $this->info("✓ Закрыто заданий (нет активных визитов): {$tasksClosed}");

        Log::info('AutoClosePendingVisitors выполнено', [
            'visitors_closed' => $visitorsClosed,
            'tasks_closed'    => $tasksClosed,
            'hours_threshold' => $hours,
        ]);

        return self::SUCCESS;
    }
}
