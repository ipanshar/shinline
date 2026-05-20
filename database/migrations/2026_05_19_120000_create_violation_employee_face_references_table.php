<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('violation_employee_face_references', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained('violation_employees')->cascadeOnDelete();
            $table->string('source_system', 60)->default('manual_security')->index();
            $table->string('source', 80)->nullable()->index();
            $table->string('external_ref', 120)->nullable()->index();
            $table->string('source_image_id', 120)->nullable();
            $table->string('group_key', 190)->nullable();
            $table->string('disk', 40)->default('faceid_references');
            $table->string('path', 500);
            $table->string('file_name', 255)->nullable();
            $table->string('mime_type', 120)->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->string('sha1', 40)->nullable();
            $table->boolean('is_primary')->default(false)->index();
            $table->boolean('is_active')->default(true)->index();
            $table->dateTime('imported_at')->nullable();
            $table->dateTime('last_synced_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'is_active'], 'vefr_emp_active_idx');
            $table->index(['source_system', 'is_active'], 'vefr_source_active_idx');
            $table->unique(['employee_id', 'sha1'], 'vefr_emp_sha1_uidx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('violation_employee_face_references');
    }
};