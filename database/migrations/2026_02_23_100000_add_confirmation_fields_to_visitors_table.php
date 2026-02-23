<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     * Добавляет поля для подтверждения посетителей оператором КПП
     */
    public function up(): void
    {
        Schema::table('visitors', function (Blueprint $table) {
            // Статус подтверждения: pending (ожидает), confirmed (подтверждён), rejected (отклонён)
            $table->enum('confirmation_status', ['pending', 'confirmed', 'rejected'])
                ->default('confirmed')
                ->after('status_id')
                ->comment('Статус подтверждения оператором');
            
            // Оригинальный номер от камеры (до корректировки)
            $table->string('original_plate_number', 50)
                ->nullable()
                ->after('plate_number')
                ->comment('Оригинальный номер распознанный камерой');
            
            // ID оператора, подтвердившего въезд
            $table->unsignedBigInteger('confirmed_by_user_id')
                ->nullable()
                ->after('confirmation_status')
                ->comment('ID оператора, подтвердившего въезд');
            
            // Время подтверждения
            $table->dateTime('confirmed_at')
                ->nullable()
                ->after('confirmed_by_user_id')
                ->comment('Время подтверждения');
            
            // Уровень уверенности распознавания (0-100%)
            $table->tinyInteger('recognition_confidence')
                ->nullable()
                ->after('confirmed_at')
                ->comment('Уровень уверенности распознавания камеры (0-100)');

            // Индексы
            $table->index('confirmation_status', 'idx_confirmation_status');
            $table->index(['yard_id', 'confirmation_status'], 'idx_yard_confirmation');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('visitors', function (Blueprint $table) {
            $table->dropIndex('idx_confirmation_status');
            $table->dropIndex('idx_yard_confirmation');
            
            $table->dropColumn([
                'confirmation_status',
                'original_plate_number', 
                'confirmed_by_user_id',
                'confirmed_at',
                'recognition_confidence'
            ]);
        });
    }
};
