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
        Schema::table('task_loadings', function (Blueprint $table) {
            $table->string('barcode')->nullable();
            $table->string('document')->nullable();
            $table->string('comment')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('task_loadings', function (Blueprint $table) {
            $table->dropColumn(['barcode', 'document', 'comment']);
        });
    }
};
