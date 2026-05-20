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
        Schema::table('task_weighings', function (Blueprint $table) {
            $table->unsignedBigInteger('visitor_id')->nullable()->after('task_id');
            $table->foreign('visitor_id')->references('id')->on('visitors')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('task_weighings', function (Blueprint $table) {
            $table->dropForeign(['visitor_id']);
            $table->dropColumn('visitor_id');
        });
    }
};
