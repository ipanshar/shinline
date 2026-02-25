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
        Schema::table('roles', function (Blueprint $table) {
            $table->integer('level')->default(0)->after('name');
            $table->string('description')->nullable()->after('level');
        });

        // Установим уровни для существующих ролей
        DB::table('roles')->where('name', 'Администратор')->update(['level' => 100, 'description' => 'Полный доступ ко всем функциям системы']);
        DB::table('roles')->where('name', 'Интегратор')->update(['level' => 80, 'description' => 'Настройка интеграций и оборудования']);
        DB::table('roles')->where('name', 'Оператор')->update(['level' => 60, 'description' => 'Управление заданиями, справочниками и ТС']);
        DB::table('roles')->where('name', 'Охрана')->update(['level' => 40, 'description' => 'КПП, весовой контроль, разрешения']);
        DB::table('roles')->where('name', 'Снабженец')->update(['level' => 30, 'description' => 'Создание заданий на поставку']);
        DB::table('roles')->where('name', 'Статистика')->update(['level' => 20, 'description' => 'Просмотр статистики и отчётов']);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->dropColumn(['level', 'description']);
        });
    }
};
