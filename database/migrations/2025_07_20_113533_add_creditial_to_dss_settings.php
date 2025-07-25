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
            $table->string('credential')->nullable()->after('token')->comment('Credential for accessing DSS API');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('dss_setings', function (Blueprint $table) {
            $table->dropColumn('credential');
        });
    }
};
