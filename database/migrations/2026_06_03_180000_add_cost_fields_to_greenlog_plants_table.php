<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('greenlog_plants', function (Blueprint $table) {
            $table->decimal('unit_cost', 12, 2)->nullable()->after('quantity');
            $table->decimal('total_cost', 14, 2)->nullable()->after('unit_cost');
            $table->string('cost_source', 40)->nullable()->after('total_cost');
        });

        DB::statement("
            UPDATE greenlog_plants
            SET
                unit_cost = CASE
                    WHEN LOWER(category) IN ('indoor', 'office', 'room') THEN 5000.00
                    ELSE 120000.00
                END,
                total_cost = ROUND(COALESCE(quantity, 1) * CASE
                    WHEN LOWER(category) IN ('indoor', 'office', 'room') THEN 5000.00
                    ELSE 120000.00
                END, 2),
                cost_source = 'auto'
            WHERE unit_cost IS NULL
               OR total_cost IS NULL
               OR cost_source IS NULL
        ");
    }

    public function down(): void
    {
        Schema::table('greenlog_plants', function (Blueprint $table) {
            $table->dropColumn(['unit_cost', 'total_cost', 'cost_source']);
        });
    }
};
