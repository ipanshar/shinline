<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('spectech_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->foreignId('truck_id')->constrained()->onDelete('cascade');
            $table->date('start_date');
            $table->date('end_date');
            $table->string('terminal', 10); // T1, T2, T3, T4
            $table->string('zone', 100);    // здание/зона
            $table->string('gate', 50)->nullable();
            $table->string('address', 500); // авто-формируемый адрес
            $table->text('comment')->nullable();
            $table->enum('status', [
                'new',
                'departure',
                'on_location',
                'work_started',
                'completed',
                'returned',
            ])->default('new');
            $table->json('photos')->nullable();   // массив путей к файлам
            $table->json('timeline')->nullable(); // история смены статусов
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('spectech_requests');
    }
};

