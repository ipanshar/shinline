<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dss_telegram_chats', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dss_setings_id')->nullable()->constrained('dss_setings')->nullOnDelete();
            $table->string('name');
            $table->string('chat_id');
            $table->text('description')->nullable();
            $table->unsignedBigInteger('message_thread_id')->nullable();
            $table->boolean('is_enabled')->default(true);
            $table->boolean('send_silently_default')->default(false);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['dss_setings_id', 'is_enabled']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dss_telegram_chats');
    }
};