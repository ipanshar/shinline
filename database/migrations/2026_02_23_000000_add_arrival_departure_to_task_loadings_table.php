<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Добавляет поля для фиксации времени прибытия и убытия ТС на складе
     */
    public function up(): void
    {
        Schema::table('task_loadings', function (Blueprint $table) {
            $table->dateTime('arrival_at')->nullable()->after('fact_date')->comment('Время прибытия ТС на склад');
            $table->dateTime('departure_at')->nullable()->after('arrival_at')->comment('Время убытия ТС со склада');
            $table->unsignedBigInteger('arrival_user_id')->nullable()->after('departure_at')->comment('ID пользователя, зафиксировавшего прибытие');
            $table->unsignedBigInteger('departure_user_id')->nullable()->after('arrival_user_id')->comment('ID пользователя, зафиксировавшего убытие');
            
            // Индексы для быстрого поиска
            $table->index(['task_id', 'arrival_at'], 'idx_task_arrival');
            $table->index(['task_id', 'departure_at'], 'idx_task_departure');
            $table->index(['warehouse_id', 'arrival_at'], 'idx_warehouse_arrival');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('task_loadings', function (Blueprint $table) {
            $table->dropIndex('idx_task_arrival');
            $table->dropIndex('idx_task_departure');
            $table->dropIndex('idx_warehouse_arrival');
            
            $table->dropColumn(['arrival_at', 'departure_at', 'arrival_user_id', 'departure_user_id']);
        });
    }
};
