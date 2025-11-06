<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class UpdateVisitorsTruckIds extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Обновляем truck_id для существующих visitors по plate_number
        $visitors = DB::table('visitors')->whereNotNull('plate_number')->get();
        
        $updated = 0;
        foreach ($visitors as $visitor) {
            $truck = DB::table('trucks')
                ->where('plate_number', $visitor->plate_number)
                ->first();
            
            if ($truck) {
                DB::table('visitors')
                    ->where('id', $visitor->id)
                    ->update(['truck_id' => $truck->id]);
                $updated++;
            }
        }
        
        $this->command->info("✅ Обновлено записей visitors: {$updated}");
    }
}
