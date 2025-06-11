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
        Schema::create('entry_permits', function (Blueprint $table) {
            $table->id();
            $table->integer('truck_id');
            $table->integer('yard_id');
            $table->integer('user_id')->nullable(); 
            $table->string('task_id')->nullable();
            $table->boolean('one_permission')->default(true);
            $table->dateTime('begin_date')->nullable();
            $table->dateTime('end_date')->nullable();
            $table->integer('status_id'); 
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('entry_permits');
    }
};
