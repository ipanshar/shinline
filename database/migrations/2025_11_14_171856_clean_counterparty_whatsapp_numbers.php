<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Очищаем все номера WhatsApp от символов + и пробелов
        DB::table('сounterparties')
            ->whereNotNull('whatsapp')
            ->where('whatsapp', '!=', '')
            ->update([
                'whatsapp' => DB::raw("REPLACE(REPLACE(whatsapp, '+', ''), ' ', '')")
            ]);
            
        // // Также очищаем поле phone если оно есть
        // DB::table('сounterparties')
        //     ->whereNotNull('phone')
        //     ->where('phone', '!=', '')
        //     ->update([
        //         'phone' => DB::raw("REPLACE(REPLACE(phone, '+', ''), ' ', '')")
        //     ]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Откат не предусмотрен, так как невозможно восстановить исходный формат номеров
        // В случае необходимости отката, номера можно будет отредактировать вручную
    }
};
