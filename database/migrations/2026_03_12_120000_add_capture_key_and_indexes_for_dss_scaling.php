<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vehicle_captures', function (Blueprint $table) {
            $table->string('capture_direction')->nullable()->after('plateNo');
            $table->string('capture_key')->nullable()->after('capture_direction');
            $table->timestamp('processed_at')->nullable()->after('local_capturePicture');
            $table->unique('capture_key');
            $table->index(['devaice_id', 'captureTime']);
        });

        Schema::table('truck_zone_history', function (Blueprint $table) {
            $table->index(['truck_id', 'exit_time', 'entry_time'], 'truck_zone_history_active_lookup_idx');
            $table->index(['exit_time', 'created_at'], 'truck_zone_history_retention_idx');
        });
    }

    public function down(): void
    {
        Schema::table('truck_zone_history', function (Blueprint $table) {
            $table->dropIndex('truck_zone_history_active_lookup_idx');
            $table->dropIndex('truck_zone_history_retention_idx');
        });

        Schema::table('vehicle_captures', function (Blueprint $table) {
            $table->dropUnique(['capture_key']);
            $table->dropIndex(['devaice_id', 'captureTime']);
            $table->dropColumn(['capture_direction', 'capture_key', 'processed_at']);
        });
    }
};