<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('violation_recognition_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('incident_id')->constrained('violation_incidents')->cascadeOnDelete();
            $table->foreignId('evidence_id')->nullable()->constrained('violation_evidences')->nullOnDelete();
            $table->string('attempt_kind', 40)->default('image')->index();
            $table->string('service_name', 80)->default('faceid_python');
            $table->string('status', 40)->default('pending')->index();
            $table->boolean('matched')->default(false)->index();
            $table->decimal('threshold', 5, 4)->nullable();
            $table->decimal('best_similarity', 5, 4)->nullable();
            $table->unsignedSmallInteger('candidate_count')->default(0);
            $table->foreignId('recognized_employee_id')->nullable()->constrained('violation_employees')->nullOnDelete();
            $table->string('recognized_employee_business_key', 190)->nullable()->index();
            $table->string('recognized_full_name', 160)->nullable();
            $table->string('recognized_department', 160)->nullable();
            $table->string('selected_frame_path', 500)->nullable();
            $table->text('error_message')->nullable();
            $table->json('candidates_json')->nullable();
            $table->json('raw_response')->nullable();
            $table->dateTime('started_at')->nullable();
            $table->dateTime('finished_at')->nullable();
            $table->timestamps();

            $table->index(['incident_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('violation_recognition_attempts');
    }
};