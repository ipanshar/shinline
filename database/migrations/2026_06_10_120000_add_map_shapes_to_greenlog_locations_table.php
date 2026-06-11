<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('greenlog_locations', function (Blueprint $table) {
            if (! Schema::hasColumn('greenlog_locations', 'map_shape')) {
                $table->string('map_shape')->nullable()->default('point')->after('marker_size');
            }

            if (! Schema::hasColumn('greenlog_locations', 'map_width')) {
                $table->decimal('map_width', 8, 2)->nullable()->after('map_shape');
            }

            if (! Schema::hasColumn('greenlog_locations', 'map_height')) {
                $table->decimal('map_height', 8, 2)->nullable()->after('map_width');
            }

            if (! Schema::hasColumn('greenlog_locations', 'map_polygon')) {
                $table->json('map_polygon')->nullable()->after('map_height');
            }
        });
    }

    public function down(): void
    {
        Schema::table('greenlog_locations', function (Blueprint $table) {
            $columns = [];

            foreach (['map_shape', 'map_width', 'map_height', 'map_polygon'] as $column) {
                if (Schema::hasColumn('greenlog_locations', $column)) {
                    $columns[] = $column;
                }
            }

            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
