<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('greenlog_locations', 'marker_size')) {
            Schema::table('greenlog_locations', function (Blueprint $table) {
                $table->integer('marker_size')->nullable()->default(10)->after('map_image_path');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('greenlog_locations', 'marker_size')) {
            Schema::table('greenlog_locations', function (Blueprint $table) {
                $table->dropColumn('marker_size');
            });
        }
    }
};
