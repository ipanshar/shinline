<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('greenlog_plant_photos', function (Blueprint $table) {
            $table->id();
            $table->string('company_key')->nullable()->index();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('plant_id')->constrained('greenlog_plants')->cascadeOnDelete();
            $table->string('disk', 80)->default('public');
            $table->string('path');
            $table->string('url')->nullable();
            $table->string('type', 40)->default('plant')->index();
            $table->text('description')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('greenlog_plant_photos');
    }
};
