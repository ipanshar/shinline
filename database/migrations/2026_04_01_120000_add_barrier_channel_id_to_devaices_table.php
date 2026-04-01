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
        Schema::table('devaices', function (Blueprint $table) {
            $table->string('barrier_channel_id')->nullable()->after('zone_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('devaices', function (Blueprint $table) {
            $table->dropColumn('barrier_channel_id');
        });
    }
};