<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('violation_temporary_pass_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained('violation_employees')->cascadeOnDelete();
            $table->string('event_type', 40)->index();
            $table->unsignedTinyInteger('duration_months');
            $table->string('matched_reference_key', 255)->nullable();
            $table->decimal('matched_similarity', 5, 4)->nullable();
            $table->foreignId('performed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('performed_by_name', 160)->nullable();
            $table->string('performed_by_chat_id', 40)->nullable()->index();
            $table->dateTime('performed_at')->index();
            $table->dateTime('previous_expires_at')->nullable();
            $table->dateTime('pass_issued_at')->nullable()->index();
            $table->dateTime('pass_expires_at')->nullable()->index();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'event_type'], 'vtpe_employee_event_type_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('violation_temporary_pass_events');
    }
};
