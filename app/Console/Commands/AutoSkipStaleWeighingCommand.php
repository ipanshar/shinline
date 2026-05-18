<?php

namespace App\Console\Commands;

use App\Models\WeighingRequirement;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class AutoSkipStaleWeighingCommand extends Command
{
    protected $signature = 'weighing:auto-skip-stale
                            {--hours=24 : Пропускать записи старше N часов без завершения}
                            {--dry-run : Только показать, без изменений}';

    protected $description = 'Автоматически отменяет зависшие требования взвешивания (посетитель выехал или запись слишком старая)';

    public function handle(): int
    {
        $hours   = (int) $this->option('hours');
        $dryRun  = (bool) $this->option('dry-run');
        $now     = now();
        $reason  = 'Автоматически: посетитель покинул территорию без взвешивания';
        $skipped = 0;

        // ── 1. Посетитель уже выехал, а требование ещё активно ──────────────
        $exitedQuery = WeighingRequirement::query()
            ->whereIn('status', [
                WeighingRequirement::STATUS_PENDING,
                WeighingRequirement::STATUS_ENTRY_DONE,
            ])
            ->whereNotNull('visitor_id')
            ->whereHas('visitor', fn ($q) => $q->whereNotNull('exit_date'));

        $exitedCount = $exitedQuery->count();

        if ($exitedCount > 0) {
            $this->line("Посетитель выехал без взвешивания: <comment>{$exitedCount}</comment> записей");

            if (!$dryRun) {
                $exitedQuery->each(function (WeighingRequirement $req) use ($reason, $now) {
                    $req->update([
                        'status'             => WeighingRequirement::STATUS_SKIPPED,
                        'skipped_reason'     => $reason,
                        'skipped_by_user_id' => null,
                        'skipped_at'         => $now,
                    ]);
                });
                $skipped += $exitedCount;
            }
        }

        // ── 2. Запись создана давно и посетитель уже не на территории ────────
        $staleQuery = WeighingRequirement::query()
            ->whereIn('status', [
                WeighingRequirement::STATUS_PENDING,
                WeighingRequirement::STATUS_ENTRY_DONE,
            ])
            ->where('created_at', '<', $now->copy()->subHours($hours))
            ->where(function ($q) {
                // либо visitor_id нет, либо посетитель выехал
                $q->whereNull('visitor_id')
                  ->orWhereHas('visitor', fn ($v) => $v->whereNotNull('exit_date'));
            });

        $staleCount = $staleQuery->count();

        if ($staleCount > 0) {
            $this->line("Зависшие записи старше {$hours} ч: <comment>{$staleCount}</comment>");

            if (!$dryRun) {
                $staleReason = "Автоматически: запись не закрыта за {$hours} часов";
                $staleQuery->each(function (WeighingRequirement $req) use ($staleReason, $now) {
                    $req->update([
                        'status'             => WeighingRequirement::STATUS_SKIPPED,
                        'skipped_reason'     => $staleReason,
                        'skipped_by_user_id' => null,
                        'skipped_at'         => $now,
                    ]);
                });
                $skipped += $staleCount;
            }
        }

        if ($skipped > 0) {
            $this->info("Отменено: {$skipped} записей.");
        } elseif ($dryRun) {
            $this->warn('Dry-run: изменений не применено.');
        } else {
            $this->info('Зависших записей не найдено.');
        }

        return self::SUCCESS;
    }
}
