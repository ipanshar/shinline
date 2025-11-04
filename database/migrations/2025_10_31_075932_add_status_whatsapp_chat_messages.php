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
        Schema::table('whats_app_chat_messages', function (Blueprint $table) {
            $table->string('status')->default('processing')->after('type');// статус сообщения
            $table->string('error_code')->nullable()->after('status');// код ошибки
            $table->text('error_message')->nullable()->after('error_code');// текст ошибки
            $table->boolean('has_response')->default(false)->after('error_message');// есть ли ответ на сообщение
            $table->string('response_to_message_id')->nullable()->after('has_response');// ID сообщения, на которое это является ответом
            $table->string('direction')->default('outgoing')->after('message_id'); // 'incoming' или 'outgoing'
            // Добавляем индексы для оптимизации
            $table->index('message_id');
            $table->index('status');
            $table->index('response_to_message_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('whats_app_chat_messages', function (Blueprint $table) {
            // Удаляем индексы
            $table->dropIndex(['message_id']);
            $table->dropIndex(['status']);
            $table->dropIndex(['response_to_message_id']);
            
            // Удаляем столбцы
            $table->dropColumn([
                'status',
                'error_code',
                'error_message',
                'has_response',
                'response_to_message_id'
            ]);
        });
    }
};
