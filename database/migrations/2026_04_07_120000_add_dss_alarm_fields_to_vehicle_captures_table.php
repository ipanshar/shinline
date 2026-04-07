<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vehicle_captures', function (Blueprint $table) {
            $table->string('dss_alarm_code')->nullable()->after('processed_at');
            $table->string('dss_alarm_type')->nullable()->after('dss_alarm_code');
            $table->string('dss_alarm_source_code')->nullable()->after('dss_alarm_type');
            $table->string('dss_alarm_source_name')->nullable()->after('dss_alarm_source_code');
            $table->json('dss_alarm_payload')->nullable()->after('dss_alarm_source_name');
            $table->json('dss_alarm_detail_payload')->nullable()->after('dss_alarm_payload');

            $table->index('dss_alarm_code');
        });
    }

    public function down(): void
    {
        Schema::table('vehicle_captures', function (Blueprint $table) {
            $table->dropIndex(['dss_alarm_code']);
            $table->dropColumn([
                'dss_alarm_code',
                'dss_alarm_type',
                'dss_alarm_source_code',
                'dss_alarm_source_name',
                'dss_alarm_payload',
                'dss_alarm_detail_payload',
            ]);
        });
    }
};