<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('telegram_bot_chats', function (Blueprint $table) {
            $table->string('approval_status', 32)->default('none')->after('user_id')->index();
            $table->string('display_full_name')->nullable()->after('approval_status');
            $table->string('display_phone', 64)->nullable()->after('display_full_name');
            $table->foreignId('approved_user_id')->nullable()->after('display_phone')->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->after('approved_user_id')->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after('approved_by');
            $table->string('rejection_reason')->nullable()->after('approved_at');
        });
    }

    public function down(): void
    {
        Schema::table('telegram_bot_chats', function (Blueprint $table) {
            $table->dropForeign(['approved_user_id']);
            $table->dropForeign(['approved_by']);
            $table->dropColumn([
                'approval_status',
                'display_full_name',
                'display_phone',
                'approved_user_id',
                'approved_by',
                'approved_at',
                'rejection_reason',
            ]);
        });
    }
};
