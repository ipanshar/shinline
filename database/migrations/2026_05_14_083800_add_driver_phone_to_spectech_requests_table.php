<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('spectech_requests', function (Blueprint $table) {
            $table->string('driver_phone', 20)->nullable()->after('driver_name');
        });
    }

    public function down(): void
    {
        Schema::table('spectech_requests', function (Blueprint $table) {
            $table->dropColumn('driver_phone');
        });
    }
};
