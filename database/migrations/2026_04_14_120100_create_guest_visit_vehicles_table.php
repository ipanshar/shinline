<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('guest_visit_vehicles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('guest_visit_id')->constrained('guest_visits')->cascadeOnDelete();
            $table->foreignId('truck_id')->nullable()->constrained('trucks')->nullOnDelete();
            $table->string('plate_number', 50);
            $table->string('brand')->nullable();
            $table->string('model')->nullable();
            $table->string('color', 50)->nullable();
            $table->text('comment')->nullable();
            $table->timestamps();

            $table->index(['guest_visit_id', 'plate_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('guest_visit_vehicles');
    }
};