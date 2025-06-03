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
        Schema::create('dss_setings', function (Blueprint $table) {
            $table->id();
            $table->string('base_url')->nullable();
            $table->string('user_name')->nullable();
            $table->string('password')->nullable();
            $table->string('token')->nullable();
            $table->string('client_type')->nullable();
            $table->dateTime('begin_session')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('dss_setings');
    }
};
