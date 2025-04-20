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
        Schema::create('visitors', function (Blueprint $table) {
            $table->id();
            $table->string('name')->nullable();
            $table->string('plate_number')->uniqid();
            $table->string('phone')->nullable();
            $table->string('viche_color')->nullable();
            $table->integer('truck_category_id')->nullable();
            $table->integer('truck_brand_id')->nullable();
            $table->string('company')->nullable();
            $table->dateTime('exit_date')->nullable();
            $table->dateTime('entry_date')->nullable();
            $table->integer('user_id')->nullable();
            $table->integer('status_id')->nullable();
            $table->integer('yard_id')->nullable();
            $table->integer('truck_id')->nullable();
            $table->integer('task_id')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('visitors');
    }
};
