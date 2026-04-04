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
        Schema::table('dss_setings', function (Blueprint $table) {
            $table->text('terminal_public_key')->nullable()->after('secret_vector');
            $table->text('terminal_private_key')->nullable()->after('terminal_public_key');
            $table->text('platform_public_key')->nullable()->after('terminal_private_key');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('dss_setings', function (Blueprint $table) {
            $table->dropColumn(['terminal_public_key', 'terminal_private_key', 'platform_public_key']);
        });
    }
};