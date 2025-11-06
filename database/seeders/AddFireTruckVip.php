<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class AddFireTruckVip extends Seeder
{
    /**
     * Добавляет пожарную машину в VIP 3 (Зд обход - зеленый)
     */
    public function run(): void
    {
        // Пожарная машина
        $plateNumber = '411C05';
        $normalizedPlate = strtolower(str_replace(' ', '', $plateNumber));
        
        $truck = DB::table('trucks')
            ->whereRaw("REPLACE(LOWER(plate_number), ' ', '') = ?", [$normalizedPlate])
            ->first();
        
        if ($truck) {
            DB::table('trucks')
                ->where('id', $truck->id)
                ->update(['vip_level' => 3]);
            
            $this->command->info("✅ Пожарная машина {$truck->plate_number} (ID: {$truck->id}) -> VIP: 3 (Зд обход)");
        } else {
            $this->command->warn("⚠️  Пожарная машина {$plateNumber} не найдена в базе");
            $this->command->info("Создаем новую запись...");
            
            // Создаем новую запись
            $truckId = DB::table('trucks')->insertGetId([
                'plate_number' => '411 C 05',
                'name' => 'Пожарная машина ЗИЛ',
                'vip_level' => 3,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            
            $this->command->info("✅ Создана пожарная машина 411 C 05 (ID: {$truckId}) -> VIP: 3");
        }
    }
}
