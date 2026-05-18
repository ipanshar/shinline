<?php

namespace App\Console\Commands;

use App\Models\DssParkingPermit;
use App\Services\DssPermitVehicleService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Массово удаляет из DSS все ТС, ранее синхронизированные через vehicle/save/batch.
 *
 * Используется для перехода на режим самостоятельного управления шлагбаумом (DSS_SELF_BARRIER_MODE=true).
 * После выполнения DSS не знает ни об одном из наших ТС и не будет открывать шлагбаум самостоятельно.
 *
 * Примеры:
 *   php artisan dss:purge-vehicle-sync --dry-run
 *   php artisan dss:purge-vehicle-sync --batch-size=50 --delay-ms=500
 */
class DssPurgeVehicleSyncCommand extends Command
{
    protected $signature = 'dss:purge-vehicle-sync
                            {--dry-run     : Показать сколько записей будет обработано, не удаляя}
                            {--batch-size=50 : Количество записей в одном пакете}
                            {--delay-ms=500  : Задержка между запросами к DSS (мс)}
                            {--status=synced : Статус записей для удаления (по умолчанию: synced)}';

    protected $description = 'Удалить из DSS все ТС, синхронизированные через vehicle/save/batch (переход на self_barrier_mode)';

    public function handle(DssPermitVehicleService $permitVehicleService): int
    {
        $isDryRun   = (bool) $this->option('dry-run');
        $batchSize  = max(1, (int) $this->option('batch-size'));
        $delayMs    = max(0, (int) $this->option('delay-ms'));
        $statusFilter = (string) $this->option('status');

        $query = DssParkingPermit::query()
            ->where('status', $statusFilter)
            ->whereNotNull('remote_vehicle_id')
            ->where('remote_vehicle_id', '!=', '')
            ->orderBy('id');

        $total = $query->clone()->count();

        if ($total === 0) {
            $this->info("Нет записей со статусом «{$statusFilter}» и заполненным remote_vehicle_id. Ничего не делаем.");

            return self::SUCCESS;
        }

        $this->info("Найдено {$total} записей для удаления из DSS (статус: {$statusFilter}).");

        if ($isDryRun) {
            $this->warn('Режим --dry-run: удаление не выполняется.');
            $query->clone()->select(['id', 'entry_permit_id', 'plate_number', 'remote_vehicle_id', 'status'])
                ->orderBy('id')
                ->limit(20)
                ->get()
                ->each(function (DssParkingPermit $p) {
                    $this->line(sprintf(
                        '  id=%-6d  permit=%-6s  plate=%-15s  remote_id=%s',
                        $p->id,
                        $p->entry_permit_id ?? '—',
                        $p->plate_number ?? '—',
                        $p->remote_vehicle_id
                    ));
                });

            if ($total > 20) {
                $this->line("  ... и ещё " . ($total - 20) . ' записей.');
            }

            return self::SUCCESS;
        }

        $confirmed = $this->confirm(
            "Будет отправлено {$total} DELETE-запросов в DSS. Продолжить?",
            false
        );

        if (!$confirmed) {
            $this->line('Отменено.');

            return self::SUCCESS;
        }

        $processed = 0;
        $deleted   = 0;
        $skipped   = 0;
        $failed    = 0;

        $bar = $this->output->createProgressBar($total);
        $bar->start();

        $query->clone()->chunkById($batchSize, function ($records) use (
            $permitVehicleService,
            $delayMs,
            &$processed,
            &$deleted,
            &$skipped,
            &$failed,
            $bar,
        ) {
            foreach ($records as $parkingPermit) {
                $result = $permitVehicleService->purgeVehicleByParkingPermit($parkingPermit);

                if (!empty($result['error'])) {
                    $failed++;
                    Log::warning('dss:purge-vehicle-sync — ошибка удаления', [
                        'parking_permit_id' => $parkingPermit->id,
                        'remote_vehicle_id' => $parkingPermit->remote_vehicle_id,
                        'error'             => $result['error'],
                    ]);
                } elseif (!empty($result['skipped'])) {
                    $skipped++;
                } else {
                    $deleted++;
                }

                $processed++;
                $bar->advance();

                if ($delayMs > 0) {
                    usleep($delayMs * 1000);
                }
            }
        });

        $bar->finish();
        $this->newLine();

        $this->table(
            ['Всего', 'Удалено', 'Пропущено', 'Ошибок'],
            [[$processed, $deleted, $skipped, $failed]]
        );

        if ($failed > 0) {
            $this->warn("{$failed} записей не удалось удалить — подробности в logs/laravel.log.");
        } else {
            $this->info('Очистка DSS завершена успешно.');
        }

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
