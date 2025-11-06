<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class AddAllVipToCheckPage extends Seeder
{
    /**
     * Добавляет все VIP машины на страницу проверки (создает visitors)
     */
    public function run(): void
    {
        // Получаем статус "На территории"
        $statusOnTerritory = DB::table('statuses')->where('key', 'on_territory')->first();
        
        if (!$statusOnTerritory) {
            $this->command->error("❌ Статус 'on_territory' не найден!");
            return;
        }

        // Получаем первый двор (yard)
        $yard = DB::table('yards')->first();
        
        if (!$yard) {
            $this->command->error("❌ Не найдено ни одного двора (yard)!");
            return;
        }

        // Получаем все VIP грузовики (vip_level > 0)
        $vipTrucks = DB::table('trucks')
            ->where('vip_level', '>', 0)
            ->get();

        if ($vipTrucks->isEmpty()) {
            $this->command->warn("⚠️  VIP грузовики не найдены!");
            return;
        }

        $this->command->info("Найдено VIP грузовиков: " . $vipTrucks->count());
        $this->command->info("Двор: {$yard->name}");
        $this->command->info("");

        $added = 0;
        $skipped = 0;

        foreach ($vipTrucks as $truck) {
            // Проверяем, есть ли уже visitor для этого грузовика на территории
            $existingVisitor = DB::table('visitors')
                ->where('truck_id', $truck->id)
                ->where('yard_id', $yard->id)
                ->whereNull('exit_date')
                ->first();

            if ($existingVisitor) {
                $this->command->warn("⏭️  {$truck->plate_number} (VIP {$truck->vip_level}) - уже на территории");
                $skipped++;
                continue;
            }

            // Создаем visitor
            DB::table('visitors')->insert([
                'plate_number' => $truck->plate_number,
                'truck_id' => $truck->id,
                'truck_category_id' => $truck->truck_category_id,
                'truck_brand_id' => $truck->truck_brand_id,
                'entry_date' => now(),
                'status_id' => $statusOnTerritory->id,
                'yard_id' => $yard->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $vipLabel = match($truck->vip_level) {
                1 => '⭐ VIP (золотой)',
                2 => '👤 Руководство (серебристый)',
                3 => '🚒 Зд обход (зеленый)',
                default => 'Обычный'
            };

            $this->command->info("✅ {$truck->plate_number} - {$vipLabel}");
            $added++;
        }

        $this->command->info("");
        $this->command->info("📊 Итого:");
        $this->command->info("✅ Добавлено на страницу проверки: {$added}");
        $this->command->info("⏭️  Пропущено (уже на территории): {$skipped}");
        $this->command->info("");
        $this->command->info("🎉 Откройте /check и выберите двор '{$yard->name}' чтобы увидеть все VIP машины!");
    }
}
