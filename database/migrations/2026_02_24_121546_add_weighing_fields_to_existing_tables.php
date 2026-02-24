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
        // Добавляем политику взвешивания в yards
        Schema::table('yards', function (Blueprint $table) {
            $table->enum('weighing_policy', ['none', 'entry_only', 'exit_only', 'both'])
                ->default('none')
                ->after('strict_mode')
                ->comment('Политика взвешивания: none-не требуется, entry_only-только въезд, exit_only-только выезд, both-оба');
        });

        // Добавляем флаг взвешивания в truck_categories
        Schema::table('truck_categories', function (Blueprint $table) {
            $table->boolean('weighing_required')
                ->default(false)
                ->after('name')
                ->comment('Требуется ли взвешивание для этой категории');
        });

        // Добавляем флаг взвешивания в trucks (переопределяет категорию)
        Schema::table('trucks', function (Blueprint $table) {
            $table->boolean('weighing_required')
                ->nullable()
                ->after('vip_level')
                ->comment('Требуется ли взвешивание (null = по категории)');
        });

        // Добавляем флаг взвешивания в entry_permits
        Schema::table('entry_permits', function (Blueprint $table) {
            $table->boolean('weighing_required')
                ->nullable()
                ->after('one_permission')
                ->comment('Требуется ли взвешивание по этому разрешению');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('yards', function (Blueprint $table) {
            $table->dropColumn('weighing_policy');
        });

        Schema::table('truck_categories', function (Blueprint $table) {
            $table->dropColumn('weighing_required');
        });

        Schema::table('trucks', function (Blueprint $table) {
            $table->dropColumn('weighing_required');
        });

        Schema::table('entry_permits', function (Blueprint $table) {
            $table->dropColumn('weighing_required');
        });
    }
};
