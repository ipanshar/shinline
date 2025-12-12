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
        Schema::table('whats_app_busines_setings', function (Blueprint $table) {
            // Добавляем поле is_active для управления активными номерами
            $table->boolean('is_active')->default(true)->after('version');
            
            // Добавляем уникальный индекс на phone_number_id
            $table->unique('phone_number_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('whats_app_busines_setings', function (Blueprint $table) {
            $table->dropUnique(['phone_number_id']);
            $table->dropColumn('is_active');
        });
    }
};
