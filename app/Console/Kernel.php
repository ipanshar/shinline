<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    
    protected $commands = [
        \App\Console\Commands\DssDaemon::class,
        \App\Console\Commands\DssMqttListen::class,
        \App\Console\Commands\DssArchiveData::class,
        \App\Console\Commands\DssHealthCheck::class,
        \App\Console\Commands\DssMonitorAlerts::class,
        \App\Console\Commands\CleanupOldTasksAndPermits::class,
        \App\Console\Commands\ForceCloseVisitors::class,
        \App\Console\Commands\DssPurgeVehicleSyncCommand::class,
        \App\Console\Commands\CleanupGarbageTrucks::class,
        \App\Console\Commands\AutoSkipStaleWeighingCommand::class,
        \App\Console\Commands\AutoClosePendingVisitorsCommand::class,
    ];

    /**
     * Define the application's command schedule.
     *
     * @param \Illuminate\Console\Scheduling\Schedule $schedule
     * @return void
     */
    protected function schedule(Schedule $schedule): void
    {
        // Автоматическая деактивация просроченных разрешений каждый день в 00:05
        $schedule->command('cleanup:old-tasks-permits --force --days=0')
            ->dailyAt('00:05')
            ->withoutOverlapping()
            ->appendOutputTo(storage_path('logs/cleanup-permits.log'));

        $schedule->command('dss:archive-data')
            ->dailyAt('01:10')
            ->withoutOverlapping()
            ->appendOutputTo(storage_path('logs/dss-archive.log'));

        $schedule->command('dss:health-check')
            ->everyMinute()
            ->withoutOverlapping()
            ->appendOutputTo(storage_path('logs/dss-health-check.log'));

        $schedule->command('weighing:auto-skip-stale --hours=24')
            ->everyThirtyMinutes()
            ->withoutOverlapping()
            ->appendOutputTo(storage_path('logs/weighing-auto-skip.log'));

        $schedule->command('visitors:auto-close-pending --hours=2')
            ->everyThirtyMinutes()
            ->withoutOverlapping()
            ->appendOutputTo(storage_path('logs/visitors-auto-close-pending.log'));

        $schedule->command('dss:monitor-alerts')
            ->everyFiveMinutes()
            ->withoutOverlapping()
            ->appendOutputTo(storage_path('logs/dss-monitor-alerts.log'));

        $schedule->command('violations:sync-faceid-runtime --json')
            ->dailyAt('02:20')
            ->withoutOverlapping()
            ->appendOutputTo(storage_path('logs/violations-faceid-sync.log'));

        $schedule->command('some:command')->daily();
    }

    /**
     * Register the commands for the application.
     *
     * @return void
     */
    protected function commands(): void
    {
        $this->load(__DIR__ . '/Commands');

        require base_path('routes/console.php');
    }
}
