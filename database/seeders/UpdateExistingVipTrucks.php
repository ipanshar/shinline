<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class UpdateExistingVipTrucks extends Seeder
{
    /**
     * Обновляет vip_level у существующих грузовиков вместо создания новых
     */
    public function run(): void
    {
        // Список VIP машин с их уровнями
        $vipTrucks = [
            // VIP (золотистые) - vip_level = 1
            '770YA05' => 1,
            '005HN01' => 1,
            '777SL05' => 1,
            '747AHK02' => 1,
            
            // Начальники (серебристые) - vip_level = 2
            '076ZB05' => 2,
            '817OOA02' => 2,
            '001VKR01' => 2,
            'A450FO' => 2,
            'A874FR' => 2,
            '434ZJA02' => 2,
            'A414VKO' => 2,
            '759AKB02' => 2,
            '100SRS02' => 2,
        ];

        $updated = 0;
        $notFound = [];

        foreach ($vipTrucks as $plateNumber => $vipLevel) {
            // Нормализуем номер для поиска (убираем пробелы, приводим к lowercase)
            $normalizedPlate = strtolower(str_replace(' ', '', $plateNumber));
            
            // Ищем грузовик по нормализованному номеру
            $truck = DB::table('trucks')
                ->whereRaw("REPLACE(LOWER(plate_number), ' ', '') = ?", [$normalizedPlate])
                ->first();
            
            if ($truck) {
                // Обновляем vip_level
                DB::table('trucks')
                    ->where('id', $truck->id)
                    ->update(['vip_level' => $vipLevel]);
                
                $this->command->info("✅ Обновлен: {$truck->plate_number} (ID: {$truck->id}) -> VIP: {$vipLevel}");
                $updated++;
            } else {
                $notFound[] = $plateNumber;
                $this->command->warn("⚠️  Не найден: {$plateNumber}");
            }
        }

        $this->command->info("\n📊 Итого:");
        $this->command->info("✅ Обновлено: {$updated}");
        $this->command->info("⚠️  Не найдено: " . count($notFound));
        
        if (!empty($notFound)) {
            $this->command->warn("\nНе найденные номера:");
            foreach ($notFound as $plate) {
                $this->command->warn("  - {$plate}");
            }
        }
    }
}
