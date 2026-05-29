<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('violation_employees', function (Blueprint $table) {
            $table->string('person_kind', 40)->default('employee')->after('source_system')->index();
            $table->string('temporary_pass_status', 40)->nullable()->after('employment_status')->index();
            $table->dateTime('temporary_pass_issued_at')->nullable()->after('temporary_pass_status')->index();
            $table->dateTime('temporary_pass_expires_at')->nullable()->after('temporary_pass_issued_at')->index();
            $table->unsignedTinyInteger('temporary_pass_duration_months')->nullable()->after('temporary_pass_expires_at');
            $table->foreignId('temporary_pass_created_by_user_id')->nullable()->after('temporary_pass_duration_months')->constrained('users')->nullOnDelete();
            $table->string('temporary_pass_created_by_name', 160)->nullable()->after('temporary_pass_created_by_user_id');
            $table->dateTime('temporary_pass_last_extended_at')->nullable()->after('temporary_pass_created_by_name')->index();
        });
    }

    public function down(): void
    {
        Schema::table('violation_employees', function (Blueprint $table) {
            $table->dropConstrainedForeignId('temporary_pass_created_by_user_id');
            $table->dropColumn([
                'person_kind',
                'temporary_pass_status',
                'temporary_pass_issued_at',
                'temporary_pass_expires_at',
                'temporary_pass_duration_months',
                'temporary_pass_created_by_name',
                'temporary_pass_last_extended_at',
            ]);
        });
    }
};
