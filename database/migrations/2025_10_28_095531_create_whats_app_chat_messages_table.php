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
        Schema::create('whats_app_chat_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('chat_list_id')->constrained('whats_app_chat_lists')->onDelete('cascade');
            $table->text('message')->nullable();
            $table->string('message_id')->nullable();// ID сообщения в WhatsApp
            $table->boolean('type')->nullable();// 0 - входящее, 1 - исходящее
            $table->integer('user_id')->nullable();// ID сотрудника в системе
            
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('whats_app_chat_messages');
    }
};
