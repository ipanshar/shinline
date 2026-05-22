<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('spectech_requests', function (Blueprint $table) {
            $table->timestamp('operator_updated_at')->nullable()->after('cancelled_by');
            $table->foreignId('operator_updated_by_user_id')
                ->nullable()
                ->after('operator_updated_at')
                ->constrained('users')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('spectech_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('operator_updated_by_user_id');
            $table->dropColumn('operator_updated_at');
        });
    }
};
