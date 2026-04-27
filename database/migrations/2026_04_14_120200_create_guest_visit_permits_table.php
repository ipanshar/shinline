<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('guest_visit_permits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('guest_visit_id')->constrained('guest_visits')->cascadeOnDelete();
            $table->foreignId('entry_permit_id')->nullable()->constrained('entry_permits')->cascadeOnDelete();
            $table->enum('permit_subject_type', ['person', 'vehicle']);
            $table->foreignId('guest_visit_vehicle_id')->nullable()->constrained('guest_visit_vehicles')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['guest_visit_id', 'entry_permit_id', 'permit_subject_type'], 'guest_visit_permits_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('guest_visit_permits');
    }
};