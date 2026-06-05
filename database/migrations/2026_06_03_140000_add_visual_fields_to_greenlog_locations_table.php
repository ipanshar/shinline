<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('greenlog_locations', function (Blueprint $table) {
            $table->decimal('position_x', 8, 2)->nullable()->after('description');
            $table->decimal('position_y', 8, 2)->nullable()->after('position_x');
            $table->string('type', 40)->nullable()->after('position_y')->index();
            $table->string('map_image_path')->nullable()->after('type');
        });
    }

    public function down(): void
    {
        Schema::table('greenlog_locations', function (Blueprint $table) {
            $table->dropColumn([
                'position_x',
                'position_y',
                'type',
                'map_image_path',
            ]);
        });
    }
};
