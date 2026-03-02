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
        Schema::table('zones', function (Blueprint $table) {
            // Центр зоны (для отображения маркера)
            $table->decimal('center_lat', 10, 7)->nullable()->after('yard_id');
            $table->decimal('center_lng', 10, 7)->nullable()->after('center_lat');
            // Полигон границ зоны в формате JSON: [[lat1, lng1], [lat2, lng2], ...]
            $table->json('polygon')->nullable()->after('center_lng');
            // Цвет зоны для отображения на карте
            $table->string('color', 7)->default('#3388ff')->after('polygon');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('zones', function (Blueprint $table) {
            $table->dropColumn(['center_lat', 'center_lng', 'polygon', 'color']);
        });
    }
};
