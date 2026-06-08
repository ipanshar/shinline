<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('greenlog_plants', function (Blueprint $table) {
            $table->id();
            $table->string('company_key')->nullable()->index();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('inventory_number')->index();
            $table->string('name')->index();
            $table->string('biological_name')->nullable()->index();
            $table->string('category', 40)->index();
            $table->string('status', 40)->default('alive')->index();
            $table->foreignId('location_id')->nullable()->constrained('greenlog_locations')->nullOnDelete();
            $table->unsignedInteger('watering_frequency_days')->nullable();
            $table->unsignedInteger('fertilizing_frequency_days')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('greenlog_plants');
    }
};
