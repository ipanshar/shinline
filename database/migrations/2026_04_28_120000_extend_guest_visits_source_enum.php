<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            // sqlite не поддерживает enum, поле хранится как строка — менять схему не нужно.
            return;
        }

        DB::statement("ALTER TABLE guest_visits MODIFY source ENUM('operator', 'integration', 'import', 'telegram_bot') NOT NULL DEFAULT 'operator'");
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        // Перед сужением enum возвращаем существующие значения 'telegram_bot' к 'operator',
        // чтобы MySQL не упал на несоответствующих строках.
        DB::table('guest_visits')->where('source', 'telegram_bot')->update(['source' => 'operator']);

        DB::statement("ALTER TABLE guest_visits MODIFY source ENUM('operator', 'integration', 'import') NOT NULL DEFAULT 'operator'");
    }
};
