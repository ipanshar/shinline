<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('spectech_requests', function (Blueprint $table) {
            $table->string('initiator_name', 160)->nullable()->after('user_id');
            $table->string('initiator_phone', 32)->nullable()->after('initiator_name');
        });
    }

    public function down(): void
    {
        Schema::table('spectech_requests', function (Blueprint $table) {
            $table->dropColumn(['initiator_name', 'initiator_phone']);
        });
    }
};
