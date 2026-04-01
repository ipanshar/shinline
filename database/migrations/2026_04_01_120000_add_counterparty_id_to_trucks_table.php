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
        Schema::table('trucks', function (Blueprint $table) {
            if (!Schema::hasColumn('trucks', 'counterparty_id')) {
                $table->unsignedBigInteger('counterparty_id')->nullable()->after('user_id');
                $table->index('counterparty_id');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('trucks', function (Blueprint $table) {
            if (Schema::hasColumn('trucks', 'counterparty_id')) {
                $table->dropIndex(['counterparty_id']);
                $table->dropColumn('counterparty_id');
            }
        });
    }
};