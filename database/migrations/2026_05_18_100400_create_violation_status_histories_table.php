<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('violation_status_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('incident_id')->constrained('violation_incidents')->cascadeOnDelete();
            $table->string('from_status', 40)->nullable();
            $table->string('to_status', 40)->index();
            $table->string('source', 40)->default('manual')->index();
            $table->foreignId('changed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('note')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['incident_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('violation_status_histories');
    }
};