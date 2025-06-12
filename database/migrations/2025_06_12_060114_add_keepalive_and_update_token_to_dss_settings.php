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
        Schema::table('dss_settings', function (Blueprint $table) {
            $table->dateTime('keepalive')->nullable();
            $table->dateTime('update_token')->nullable();
            $table->integer('update_token_count')->default(0);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('dss_settings', function (Blueprint $table) {
            $table->dropColumn('keepalive');
            $table->dropColumn('update_token');
            $table->dropColumn('update_token_count');
        });
    }
};
