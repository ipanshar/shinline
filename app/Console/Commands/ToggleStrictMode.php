<?php

namespace App\Console\Commands;

use App\Models\Yard;
use Illuminate\Console\Command;

class ToggleStrictMode extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'yard:strict {yard_id?} {--enable} {--disable} {--list}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Управление строгим режимом дворов (запрет въезда без разрешения)';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        // Показать список дворов
        if ($this->option('list') || !$this->argument('yard_id')) {
            $yards = Yard::all();
            $this->table(
                ['ID', 'Название', 'Строгий режим'],
                $yards->map(fn($y) => [
                    $y->id, 
                    $y->name, 
                    $y->strict_mode ? '🔒 Включён' : '🔓 Выключен'
                ])->toArray()
            );
            
            if (!$this->argument('yard_id')) {
                $this->info('Используйте: php artisan yard:strict {yard_id} --enable/--disable');
            }
            return;
        }

        $yard = Yard::find($this->argument('yard_id'));
        if (!$yard) {
            $this->error('Двор с ID ' . $this->argument('yard_id') . ' не найден');
            return 1;
        }

        if ($this->option('enable')) {
            $yard->update(['strict_mode' => true]);
            $this->info("🔒 Строгий режим ВКЛЮЧЁН для двора: {$yard->name}");
            $this->warn('Въезд без разрешения теперь ЗАПРЕЩЁН!');
        } elseif ($this->option('disable')) {
            $yard->update(['strict_mode' => false]);
            $this->info("🔓 Строгий режим ВЫКЛЮЧЕН для двора: {$yard->name}");
            $this->info('Въезд без разрешения теперь разрешён.');
        } else {
            // Переключить
            $newMode = !$yard->strict_mode;
            $yard->update(['strict_mode' => $newMode]);
            if ($newMode) {
                $this->info("🔒 Строгий режим ВКЛЮЧЁН для двора: {$yard->name}");
            } else {
                $this->info("🔓 Строгий режим ВЫКЛЮЧЕН для двора: {$yard->name}");
            }
        }

        return 0;
    }
}
