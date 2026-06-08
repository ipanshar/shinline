<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('greenlog_care_tasks', function (Blueprint $table) {
            $table->id();
            $table->string('company_key')->nullable()->index();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('plant_id')->nullable()->constrained('greenlog_plants')->nullOnDelete();
            $table->string('type', 40)->index();
            $table->dateTime('due_at')->index();
            $table->string('status', 40)->default('pending')->index();
            $table->dateTime('completed_at')->nullable()->index();
            $table->text('comment')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('greenlog_care_tasks');
    }
};
