<?php

namespace App\Providers;

use Illuminate\Database\Events\MigrationsEnded;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if ($this->app->runningUnitTests()) {
            return;
        }

        Event::listen(MigrationsEnded::class, function (): void {
            if (! (bool) config('services.faceid.auto_sync_after_migrate', true)) {
                return;
            }

            try {
                $exitCode = Artisan::call('violations:sync-faceid-runtime', [
                    '--json' => true,
                ]);
                $output = trim(Artisan::output());

                if ($output !== '' && defined('STDOUT')) {
                    fwrite(STDOUT, PHP_EOL . '[faceid-sync] ' . $output . PHP_EOL);
                }

                if ($exitCode !== 0) {
                    Log::warning('faceid_runtime_sync_after_migrate_non_zero', [
                        'exit_code' => $exitCode,
                        'output' => $output,
                    ]);
                }
            } catch (\Throwable $exception) {
                Log::error('faceid_runtime_sync_after_migrate_failed', [
                    'error' => $exception->getMessage(),
                ]);
            }
        });
    }
}
