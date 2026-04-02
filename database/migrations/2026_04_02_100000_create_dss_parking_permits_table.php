<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('dss_parking_permits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('entry_permit_id')->constrained('entry_permits')->onDelete('cascade');
            $table->foreignId('truck_id')->nullable()->constrained('trucks')->nullOnDelete();
            $table->foreignId('yard_id')->nullable()->constrained('yards')->nullOnDelete();
            $table->string('plate_number')->nullable();
            $table->string('status')->default('pending');
            $table->string('person_id')->nullable();
            $table->json('parking_lot_ids')->nullable();
            $table->json('entrance_group_ids')->nullable();
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();

            $table->unique('entry_permit_id');
            $table->index(['status', 'synced_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('dss_parking_permits');
    }
};