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
        Schema::create('dss_apis', function (Blueprint $table) {
            $table->id();
            $table->string('api_name')->nullable();
            $table->string('method')->nullable();
            $table->string('request_url')->nullable();
            $table->integer('dss_setings_id')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('dss_apis');
    }
};
