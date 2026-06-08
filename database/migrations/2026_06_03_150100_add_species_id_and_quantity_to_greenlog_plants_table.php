<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('greenlog_plants', function (Blueprint $table) {
            $table->foreignId('species_id')
                ->nullable()
                ->after('location_id')
                ->constrained('greenlog_plant_species')
                ->nullOnDelete();
            $table->integer('quantity')->default(1)->after('species_id');
        });
    }

    public function down(): void
    {
        Schema::table('greenlog_plants', function (Blueprint $table) {
            $table->dropConstrainedForeignId('species_id');
            $table->dropColumn('quantity');
        });
    }
};

