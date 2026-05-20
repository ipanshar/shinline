<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('violation_incidents', function (Blueprint $table) {
            $table->id();
            $table->string('incident_uid', 26)->unique();
            $table->string('source', 40)->default('telegram_miniapp')->index();
            $table->string('workflow_status', 40)->default('draft_processing')->index();
            $table->string('recognition_status', 40)->default('pending')->index();
            $table->string('identity_source', 40)->nullable()->index();

            $table->dateTime('occurred_at')->index();
            $table->dateTime('reported_at')->nullable()->index();
            $table->dateTime('reviewed_at')->nullable()->index();
            $table->dateTime('closed_at')->nullable();

            $table->foreignId('reported_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('reviewed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reported_by_chat_id', 40)->nullable()->index();
            $table->string('reported_by_name', 160)->nullable();

            $table->foreignId('category_id')->nullable()->constrained('violation_categories')->nullOnDelete();
            $table->foreignId('type_id')->nullable()->constrained('violation_types')->nullOnDelete();
            $table->string('category_key', 80)->index();
            $table->string('category_name', 160);
            $table->string('type_key', 80)->index();
            $table->string('type_name', 160);
            $table->text('description')->nullable();

            $table->foreignId('yard_id')->nullable()->constrained('yards')->nullOnDelete();
            $table->foreignId('zone_id')->nullable()->constrained('zones')->nullOnDelete();
            $table->string('location_label', 255)->nullable();

            $table->foreignId('employee_id')->nullable()->constrained('violation_employees')->nullOnDelete();
            $table->string('employee_business_key', 190)->nullable()->index();
            $table->string('employee_iin', 32)->nullable()->index();
            $table->string('employee_full_name', 160)->nullable();
            $table->string('employee_normalized_full_name', 160)->nullable()->index();
            $table->string('employee_department', 160)->nullable()->index();
            $table->string('employee_position', 160)->nullable();
            $table->string('employee_status', 40)->nullable()->index();
            $table->boolean('is_manual_identity')->default(false)->index();

            $table->foreignId('recognition_employee_id')->nullable()->constrained('violation_employees')->nullOnDelete();
            $table->string('recognition_employee_business_key', 190)->nullable()->index();
            $table->string('recognition_employee_full_name', 160)->nullable();
            $table->string('recognition_employee_department', 160)->nullable();
            $table->unsignedSmallInteger('recognition_attempts_count')->default(0);
            $table->unsignedSmallInteger('recognition_candidate_count')->default(0);
            $table->decimal('recognition_similarity', 5, 4)->nullable();
            $table->decimal('recognition_threshold', 5, 4)->nullable();
            $table->text('recognition_error')->nullable();

            $table->unsignedSmallInteger('evidence_total_count')->default(0);
            $table->unsignedSmallInteger('evidence_photo_count')->default(0);
            $table->unsignedSmallInteger('evidence_video_count')->default(0);
            $table->string('primary_evidence_kind', 40)->nullable();
            $table->string('primary_evidence_path', 500)->nullable();

            $table->dateTime('disciplinary_due_at')->nullable()->index();
            $table->dateTime('disciplinary_expires_at')->nullable()->index();
            $table->string('sanction_state', 40)->nullable()->index();
            $table->text('review_note')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['workflow_status', 'occurred_at']);
            $table->index(['recognition_status', 'workflow_status']);
            $table->index(['category_key', 'occurred_at']);
            $table->index(['employee_business_key', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('violation_incidents');
    }
};