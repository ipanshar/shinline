<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('guest_visits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('yard_id')->constrained('yards');
            $table->string('guest_full_name');
            $table->string('guest_iin', 20)->nullable()->index();
            $table->string('guest_company_name')->nullable();
            $table->string('guest_position');
            $table->string('guest_phone', 50);
            $table->string('host_name');
            $table->string('host_phone', 50);
            $table->dateTime('visit_starts_at');
            $table->dateTime('visit_ends_at')->nullable();
            $table->enum('permit_kind', ['one_time', 'multi_time'])->default('one_time');
            $table->enum('workflow_status', ['active', 'closed', 'canceled'])->default('active')->index();
            $table->boolean('has_vehicle')->default(false);
            $table->text('comment')->nullable();
            $table->dateTime('last_entry_at')->nullable();
            $table->dateTime('last_exit_at')->nullable();
            $table->dateTime('closed_at')->nullable();
            $table->enum('source', ['operator', 'integration', 'import'])->default('operator');
            $table->foreignId('created_by_user_id')->constrained('users');
            $table->foreignId('approved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('cancelled_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['yard_id', 'workflow_status']);
            $table->index(['permit_kind', 'workflow_status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('guest_visits');
    }
};