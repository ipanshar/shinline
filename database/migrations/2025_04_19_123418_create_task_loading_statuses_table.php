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
        Schema::create('task_loading_statuses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_loading_id')->constrained('task_loadings')->onDelete('cascade');
            $table->integer('staus_id')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('task_loading_statuses');
    }
};
