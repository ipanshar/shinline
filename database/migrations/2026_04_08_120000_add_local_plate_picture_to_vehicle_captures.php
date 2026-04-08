<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vehicle_captures', function (Blueprint $table) {
            $table->string('local_plateNoPicture')->nullable()->after('local_capturePicture');
        });
    }

    public function down(): void
    {
        Schema::table('vehicle_captures', function (Blueprint $table) {
            $table->dropColumn('local_plateNoPicture');
        });
    }
};