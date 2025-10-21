<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Для SQLite нужно создать новую колонку, скопировать данные, удалить старую
        Schema::table('trucks', function (Blueprint $table) {
            // Создаем временную колонку
            $table->string('own_temp', 50)->nullable();
        });
        
        // Копируем данные с конвертацией: 1 -> 'собственный', 0 -> 'не указано'
        DB::statement("UPDATE trucks SET own_temp = CASE WHEN own = 1 THEN 'собственный' ELSE 'не указано' END");
        
        Schema::table('trucks', function (Blueprint $table) {
            // Удаляем старую колонку
            $table->dropColumn('own');
        });
        
        Schema::table('trucks', function (Blueprint $table) {
            // Создаем новую колонку с правильным типом
            $table->string('own', 50)->default('не указано');
        });
        
        // Копируем данные из временной колонки
        DB::statement("UPDATE trucks SET own = own_temp");
        
        Schema::table('trucks', function (Blueprint $table) {
            // Удаляем временную колонку
            $table->dropColumn('own_temp');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Откатываем обратно к boolean
        Schema::table('trucks', function (Blueprint $table) {
            $table->integer('own_temp')->nullable();
        });
        
        // Конвертируем обратно: 'собственный' -> 1, остальное -> 0
        DB::statement("UPDATE trucks SET own_temp = CASE WHEN own = 'собственный' THEN 1 ELSE 0 END");
        
        Schema::table('trucks', function (Blueprint $table) {
            $table->dropColumn('own');
        });
        
        Schema::table('trucks', function (Blueprint $table) {
            $table->boolean('own')->default(false);
        });
        
        DB::statement("UPDATE trucks SET own = own_temp");
        
        Schema::table('trucks', function (Blueprint $table) {
            $table->dropColumn('own_temp');
        });
    }
};
