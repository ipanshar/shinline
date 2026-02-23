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
        Schema::table('yards', function (Blueprint $table) {
            // Строгий режим: если true - запрещён въезд без разрешения
            $table->boolean('strict_mode')->default(false)->after('name');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('yards', function (Blueprint $table) {
            $table->dropColumn('strict_mode');
        });
    }
};
