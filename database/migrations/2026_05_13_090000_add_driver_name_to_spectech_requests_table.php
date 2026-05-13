<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('spectech_requests', function (Blueprint $table) {
            $table->string('driver_name', 160)->nullable()->after('truck_id');
        });
    }

    public function down(): void
    {
        Schema::table('spectech_requests', function (Blueprint $table) {
            $table->dropColumn('driver_name');
        });
    }
};