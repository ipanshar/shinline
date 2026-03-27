<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('checkpoint_exit_reviews', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('vehicle_capture_id')->nullable();
            $table->unsignedBigInteger('device_id');
            $table->unsignedBigInteger('checkpoint_id');
            $table->unsignedBigInteger('yard_id');
            $table->unsignedBigInteger('truck_id')->nullable();
            $table->string('plate_number', 50);
            $table->string('normalized_plate', 50);
            $table->decimal('recognition_confidence', 5, 2)->nullable();
            $table->timestamp('capture_time')->nullable();
            $table->string('status', 20)->default('pending');
            $table->text('note')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->unsignedBigInteger('resolved_by_user_id')->nullable();
            $table->unsignedBigInteger('resolved_visitor_id')->nullable();
            $table->timestamps();

            $table->index(['checkpoint_id', 'status', 'capture_time'], 'checkpoint_exit_reviews_queue_idx');
            $table->index(['normalized_plate', 'status'], 'checkpoint_exit_reviews_plate_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('checkpoint_exit_reviews');
    }
};
