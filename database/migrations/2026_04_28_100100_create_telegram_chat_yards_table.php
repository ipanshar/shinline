<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('telegram_chat_yards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('telegram_bot_chat_id')->constrained('telegram_bot_chats')->cascadeOnDelete();
            $table->foreignId('yard_id')->constrained('yards')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['telegram_bot_chat_id', 'yard_id'], 'tg_chat_yard_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('telegram_chat_yards');
    }
};
