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
        Schema::table('weighing_requirements', function (Blueprint $table) {
            // Удаляем внешний ключ
            $table->dropForeign(['visitor_id']);
            
            // Делаем поле nullable
            $table->unsignedBigInteger('visitor_id')->nullable()->change();
            
            // Добавляем внешний ключ обратно с SET NULL
            $table->foreign('visitor_id')
                ->references('id')
                ->on('visitors')
                ->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('weighing_requirements', function (Blueprint $table) {
            $table->dropForeign(['visitor_id']);
            $table->unsignedBigInteger('visitor_id')->nullable(false)->change();
            $table->foreign('visitor_id')
                ->references('id')
                ->on('visitors')
                ->onDelete('cascade');
        });
    }
};
