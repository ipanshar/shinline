<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dss_telegram_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dss_setings_id')->nullable()->constrained('dss_setings')->nullOnDelete();
            $table->foreignId('telegram_chat_id')->constrained('dss_telegram_chats')->cascadeOnDelete();
            $table->string('event_key');
            $table->boolean('is_enabled')->default(false);
            $table->boolean('send_silently')->default(false);
            $table->unsignedInteger('cooldown_minutes')->default(0);
            $table->dateTime('last_sent_at')->nullable();
            $table->text('last_error')->nullable();
            $table->dateTime('last_error_at')->nullable();
            $table->timestamps();

            $table->unique(['telegram_chat_id', 'event_key'], 'dss_telegram_notifications_chat_event_unique');
            $table->index(['event_key', 'is_enabled']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dss_telegram_notifications');
    }
};