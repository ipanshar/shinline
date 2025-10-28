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
        Schema::create('whats_app_busines_setings', function (Blueprint $table) {
            $table->id();
            $table->string('phone_number_id')->nullable();
            $table->string('waba_id')->nullable();
            $table->string('business_account_id')->nullable();
            $table->string('bearer_token')->nullable();
            $table->string('host')->nullable();
            $table->string('version')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('whats_app_busines_setings');
    }
};
