<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("
            UPDATE greenlog_plants
            SET
                unit_cost = 50000.00,
                total_cost = ROUND(COALESCE(quantity, 1) * 50000.00, 2)
            WHERE cost_source = 'auto'
              AND LOWER(category) NOT IN ('indoor', 'office', 'room')
        ");
    }

    public function down(): void
    {
        DB::statement("
            UPDATE greenlog_plants
            SET
                unit_cost = 120000.00,
                total_cost = ROUND(COALESCE(quantity, 1) * 120000.00, 2)
            WHERE cost_source = 'auto'
              AND LOWER(category) NOT IN ('indoor', 'office', 'room')
        ");
    }
};
