<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('violation_employees', function (Blueprint $table) {
            $table->id();
            $table->string('business_key', 190)->unique();
            $table->string('source_system', 60)->default('manual_seed')->index();
            $table->string('external_ref', 120)->nullable()->index();
            $table->string('iin', 32)->nullable()->index();
            $table->string('full_name', 160)->index();
            $table->string('normalized_full_name', 160)->index();
            $table->string('department', 160)->nullable()->index();
            $table->string('position', 160)->nullable();
            $table->string('employment_status', 40)->nullable()->index();
            $table->boolean('is_active')->default(true)->index();
            $table->unsignedInteger('face_reference_count')->default(0);
            $table->string('face_reference_state', 40)->default('unknown')->index();
            $table->dateTime('last_face_sync_at')->nullable();
            $table->dateTime('imported_at')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('violation_employees');
    }
};