<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('task_loadings', function (Blueprint $table) {
            $table->dateTime('plane_date')->nullable()->after('warehouse_gate_fact_id');
            $table->dateTime('fact_date')->nullable()->after('plane_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('task_loadings', function (Blueprint $table) {
            $table->dropColumn('plane_date');
            $table->dropColumn('fact_date');
        });
    }
};