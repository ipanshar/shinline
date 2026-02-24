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
        Schema::create('weighing_requirements', function (Blueprint $table) {
            $table->id();
            
            // Основные связи
            $table->foreignId('yard_id')->constrained('yards')->onDelete('cascade');
            $table->foreignId('visitor_id')->constrained('visitors')->onDelete('cascade');
            $table->foreignId('truck_id')->nullable()->constrained('trucks')->onDelete('set null');
            $table->foreignId('task_id')->nullable()->constrained('tasks')->onDelete('set null');
            $table->string('plate_number', 50);  // Номер ТС
            
            // Тип требования
            $table->enum('required_type', ['entry', 'exit', 'both'])->default('both');
            $table->enum('reason', ['yard_policy', 'truck_category', 'truck_flag', 'permit', 'task', 'manual'])->default('manual');
            
            // Статус выполнения
            $table->enum('status', ['pending', 'entry_done', 'completed', 'skipped'])->default('pending');
            
            // Связи с фактическими взвешиваниями
            $table->foreignId('entry_weighing_id')->nullable();
            $table->foreignId('exit_weighing_id')->nullable();
            
            // Для пропущенных взвешиваний
            $table->text('skipped_reason')->nullable();
            $table->foreignId('skipped_by_user_id')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamp('skipped_at')->nullable();
            
            $table->timestamps();
            
            // Индексы
            $table->index('visitor_id');
            $table->index(['yard_id', 'status']);
            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('weighing_requirements');
    }
};
