<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('violation_evidences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('incident_id')->constrained('violation_incidents')->cascadeOnDelete();
            $table->string('media_role', 40)->default('original')->index();
            $table->string('media_kind', 40)->index();
            $table->string('disk', 40)->default('public');
            $table->string('path', 500);
            $table->string('thumbnail_path', 500)->nullable();
            $table->string('file_name', 255)->nullable();
            $table->string('mime_type', 120)->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->string('sha1', 40)->nullable()->index();
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->boolean('is_primary')->default(false)->index();
            $table->dateTime('captured_at')->nullable()->index();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['incident_id', 'sort_order']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('violation_evidences');
    }
};