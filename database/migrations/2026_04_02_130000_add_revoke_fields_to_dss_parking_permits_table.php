<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dss_parking_permits', function (Blueprint $table) {
            $table->string('remote_vehicle_id')->nullable()->after('plate_number');
            $table->timestamp('revoked_at')->nullable()->after('synced_at');
        });
    }

    public function down(): void
    {
        Schema::table('dss_parking_permits', function (Blueprint $table) {
            $table->dropColumn(['remote_vehicle_id', 'revoked_at']);
        });
    }
};