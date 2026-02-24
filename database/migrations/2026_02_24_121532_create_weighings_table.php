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
        Schema::create('weighings', function (Blueprint $table) {
            $table->id();
            
            // Обязательные поля
            $table->foreignId('yard_id')->constrained('yards')->onDelete('cascade');
            $table->string('plate_number', 50);  // Номер ТС (всегда сохраняем)
            $table->enum('weighing_type', ['entry', 'exit', 'intermediate'])->default('entry');
            $table->decimal('weight', 10, 2);  // Вес в кг
            $table->timestamp('weighed_at');   // Время взвешивания
            
            // Опциональные связи
            $table->foreignId('visitor_id')->nullable()->constrained('visitors')->onDelete('set null');
            $table->foreignId('truck_id')->nullable()->constrained('trucks')->onDelete('set null');
            $table->foreignId('task_id')->nullable()->constrained('tasks')->onDelete('set null');
            $table->foreignId('requirement_id')->nullable();  // Связь с требованием
            
            // Оператор и примечания
            $table->foreignId('operator_user_id')->nullable()->constrained('users')->onDelete('set null');
            $table->text('notes')->nullable();
            
            $table->timestamps();
            
            // Индексы
            $table->index(['yard_id', 'weighed_at']);
            $table->index('visitor_id');
            $table->index('truck_id');
            $table->index('plate_number');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('weighings');
    }
};
