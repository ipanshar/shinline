<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('spectech_schedules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->foreignId('truck_id')->nullable()->constrained()->onDelete('set null');
            $table->string('equipment_type_key', 100);   // ключ для группировки (truck_category_id или имя группы)
            $table->string('equipment_type_label', 100); // отображаемое название типа
            $table->string('assigned_truck_name', 255)->nullable(); // имя назначенной техники
            $table->datetime('scheduled_start');
            $table->datetime('scheduled_end');
            $table->string('purpose', 500);
            $table->string('address', 500)->nullable();
            $table->text('notes')->nullable();
            $table->enum('status', ['pending', 'confirmed', 'in_progress', 'done', 'cancelled'])->default('pending');
            $table->json('conflict_info')->nullable(); // когда все заняты — сюда пишем инфо о занятости
            $table->timestamps();

            $table->index(['truck_id', 'scheduled_start', 'scheduled_end']);
            $table->index(['equipment_type_key', 'scheduled_start']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('spectech_schedules');
    }
};

