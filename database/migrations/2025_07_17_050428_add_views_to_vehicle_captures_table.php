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
        Schema::table('vehicle_captures', function (Blueprint $table) {
             $table->boolean('views')->default(true);
             $table->boolean('imageDownload')->default(false);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('vehicle_captures', function (Blueprint $table) {
            $table->dropColumn('views');
            $table->dropColumn('imageDownload');
        });
    }
};
