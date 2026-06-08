<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('greenlog_plants', function (Blueprint $table) {
            $table->string('plant_type')->nullable()->after('responsible_person');
            $table->decimal('height_value', 8, 2)->nullable()->after('plant_type');
            $table->string('height_unit', 20)->nullable()->default('м')->after('height_value');
            $table->decimal('trunk_diameter_value', 8, 2)->nullable()->after('height_unit');
            $table->string('trunk_diameter_unit', 20)->nullable()->default('см')->after('trunk_diameter_value');
            $table->string('condition_text', 255)->nullable()->after('trunk_diameter_unit');
            $table->string('gps_coordinates', 255)->nullable()->after('condition_text');
            $table->date('last_inspection_date')->nullable()->after('gps_coordinates');
        });
    }

    public function down(): void
    {
        Schema::table('greenlog_plants', function (Blueprint $table) {
            $table->dropColumn([
                'plant_type',
                'height_value',
                'height_unit',
                'trunk_diameter_value',
                'trunk_diameter_unit',
                'condition_text',
                'gps_coordinates',
                'last_inspection_date',
            ]);
        });
    }
};
