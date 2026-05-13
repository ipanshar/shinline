<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('utilization_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('truck_id')->constrained()->cascadeOnDelete();
            $table->string('driver_name', 160);
            $table->dateTime('requested_start');
            $table->dateTime('requested_end');
            $table->string('terminal', 10);
            $table->string('zone', 100);
            $table->string('gate', 50)->nullable();
            $table->string('address', 500);
            $table->text('comment')->nullable();
            $table->enum('status', ['new', 'reviewing', 'approved', 'in_progress', 'completed', 'rejected'])->default('new');
            $table->json('photos')->nullable();
            $table->json('timeline')->nullable();
            $table->string('source', 40)->default('telegram_miniapp');
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['status', 'requested_start']);
            $table->index('source');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('utilization_requests');
    }
};
