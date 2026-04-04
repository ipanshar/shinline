<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dss_setings', function (Blueprint $table) {
            $table->string('user_id')->nullable()->after('password');
            $table->string('user_group_id')->nullable()->after('user_id');
        });
    }

    public function down(): void
    {
        Schema::table('dss_setings', function (Blueprint $table) {
            $table->dropColumn(['user_id', 'user_group_id']);
        });
    }
};