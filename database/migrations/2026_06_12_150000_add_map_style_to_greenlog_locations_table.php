<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('greenlog_locations', function (Blueprint $table) {
            if (! Schema::hasColumn('greenlog_locations', 'map_style')) {
                $table->json('map_style')->nullable()->after('map_shape');
            }
        });
    }

    public function down(): void
    {
        Schema::table('greenlog_locations', function (Blueprint $table) {
            if (Schema::hasColumn('greenlog_locations', 'map_style')) {
                $table->dropColumn('map_style');
            }
        });
    }
};
