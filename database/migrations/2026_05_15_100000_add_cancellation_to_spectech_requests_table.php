<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('spectech_requests', function (Blueprint $table) {
            $table->string('cancellation_reason')->nullable()->after('conflict_info');
            $table->enum('cancelled_by', ['customer', 'operator'])->nullable()->after('cancellation_reason');
        });
    }

    public function down(): void
    {
        Schema::table('spectech_requests', function (Blueprint $table) {
            $table->dropColumn(['cancellation_reason', 'cancelled_by']);
        });
    }
};
