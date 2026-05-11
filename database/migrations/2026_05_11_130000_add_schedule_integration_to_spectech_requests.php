<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('spectech_requests', function (Blueprint $table) {
            // Связь с расписанием (если заявка создана через планирование)
            $table->foreignId('schedule_id')->nullable()->constrained('spectech_schedules')->onDelete('set null')->after('status');

            // Снимок времени начала и конца для проверки конфликтов
            $table->datetime('requested_start')->nullable()->after('schedule_id');
            $table->datetime('requested_end')->nullable()->after('requested_start');

            // Флаг: была ли создана эта заявка из планирования
            $table->boolean('from_scheduling')->default(false)->after('requested_end');

            // Информация о конфликтах (если возник при создании)
            $table->json('conflict_info')->nullable()->after('from_scheduling');

            $table->index(['truck_id', 'requested_start', 'requested_end']);
            $table->index('schedule_id');
            $table->index('from_scheduling');
        });
    }

    public function down(): void
    {
        Schema::table('spectech_requests', function (Blueprint $table) {
            $table->dropForeign(['schedule_id']);
            $table->dropIndex(['truck_id', 'requested_start', 'requested_end']);
            $table->dropIndex(['schedule_id']);
            $table->dropIndex(['from_scheduling']);
            $table->dropColumn([
                'schedule_id',
                'requested_start',
                'requested_end',
                'from_scheduling',
                'conflict_info',
            ]);
        });
    }
};


