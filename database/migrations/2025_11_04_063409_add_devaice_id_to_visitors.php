<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('visitors', function (Blueprint $table) {
            $table->integer('entrance_device_id')->nullable()->after('id');
            $table->integer('exit_device_id')->nullable()->after('entrance_device_id');
            $table->integer('entry_permit_id')->nullable()->after('exit_device_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('visitors', function (Blueprint $table) {
            $table->dropColumn('entrance_device_id');
            $table->dropColumn('exit_device_id');
            $table->dropColumn('entry_permit_id');
        });
    }
};
