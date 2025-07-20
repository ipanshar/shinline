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
        Schema::table('devaices', function (Blueprint $table) {
            $table->integer('checkpoint_id')->nullable();
            $table->string('type')->default('Exit');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('devaices', function (Blueprint $table) {
            $table->dropColumn('checkpoint_id');
            $table->dropColumn('type');
        });
    }
};
