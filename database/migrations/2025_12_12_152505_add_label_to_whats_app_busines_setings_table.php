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
            // Добавляем поле label для описания назначения номера
            $table->string('label')->nullable()->after('is_active')->comment('Метка назначения номера (например: переписка с поставщиками, сотрудники и т.д.)');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('whats_app_busines_setings', function (Blueprint $table) {
            $table->dropColumn('label');
        });
    }
};
