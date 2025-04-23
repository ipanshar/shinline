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
        Schema::create('task_weighings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained('tasks')->onDelete('cascade');
            $table->integer('sort_order')->nullable();
            $table->double('weight')->nullable();
            $table->string('description')->nullable();
            $table->foreignId('statuse_weighing_id')->nullable();
            $table->integer('user_id')->nullable();
            $table->foreignId('yard_id')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('task_weighings');
    }
};
