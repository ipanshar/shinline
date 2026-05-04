<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exit_permits', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('yard_id');
            $table->unsignedBigInteger('truck_id')->nullable();
            $table->unsignedBigInteger('visitor_id');
            $table->string('plate_number', 50);
            $table->string('status', 20)->default('active');
            $table->dateTime('valid_from')->nullable();
            $table->dateTime('valid_until')->nullable();
            $table->unsignedBigInteger('requested_by_user_id')->nullable();
            $table->unsignedBigInteger('requested_by_telegram_chat_id')->nullable();
            $table->dateTime('used_at')->nullable();
            $table->unsignedBigInteger('used_by_user_id')->nullable();
            $table->unsignedBigInteger('used_checkpoint_exit_review_id')->nullable();
            $table->dateTime('canceled_at')->nullable();
            $table->unsignedBigInteger('canceled_by_user_id')->nullable();
            $table->text('comment')->nullable();
            $table->timestamps();

            $table->index(['visitor_id', 'status'], 'exit_permits_visitor_status_idx');
            $table->index(['yard_id', 'truck_id', 'status'], 'exit_permits_yard_truck_status_idx');
            $table->index(['status', 'valid_until'], 'exit_permits_status_valid_until_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exit_permits');
    }
};
