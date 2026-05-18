<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (! $this->usesMysql()) {
            return;
        }

        DB::statement(
            "ALTER TABLE spectech_requests MODIFY status ENUM('new','departure','on_location','work_started','completed','returned','cancelled') NOT NULL DEFAULT 'new'"
        );
    }

    public function down(): void
    {
        if (! $this->usesMysql()) {
            return;
        }

        DB::table('spectech_requests')
            ->where('status', 'cancelled')
            ->update(['status' => 'new']);

        DB::statement(
            "ALTER TABLE spectech_requests MODIFY status ENUM('new','departure','on_location','work_started','completed','returned') NOT NULL DEFAULT 'new'"
        );
    }

    private function usesMysql(): bool
    {
        return in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true);
    }
};
