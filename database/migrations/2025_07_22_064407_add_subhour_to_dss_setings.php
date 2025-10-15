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
           $table->integer('subhour')->default(24)->after('token')->comment('Количество часов для удаления данных  DSS');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('dss_setings', function (Blueprint $table) {
            $table->dropColumn('subhour');
        });
    }
};
