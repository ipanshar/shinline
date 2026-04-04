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
            $table->string('secret_key', 64)->nullable()->after('credential');
            $table->string('secret_vector', 32)->nullable()->after('secret_key');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('dss_setings', function (Blueprint $table) {
            $table->dropColumn(['secret_key', 'secret_vector']);
        });
    }
};