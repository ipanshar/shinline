<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('entry_permits', 'exit_permit_required')) {
            return;
        }

        DB::table('entry_permits')
            ->where('exit_permit_required', false)
            ->update(['exit_permit_required' => true]);

        $driver = DB::connection()->getDriverName();

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE entry_permits MODIFY exit_permit_required TINYINT(1) NOT NULL DEFAULT 1');
        } elseif ($driver === 'pgsql') {
            DB::statement('ALTER TABLE entry_permits ALTER COLUMN exit_permit_required SET DEFAULT true');
        }
    }

    public function down(): void
    {
        if (!Schema::hasColumn('entry_permits', 'exit_permit_required')) {
            return;
        }

        $driver = DB::connection()->getDriverName();

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
            DB::statement('ALTER TABLE entry_permits MODIFY exit_permit_required TINYINT(1) NOT NULL DEFAULT 0');
        } elseif ($driver === 'pgsql') {
            DB::statement('ALTER TABLE entry_permits ALTER COLUMN exit_permit_required SET DEFAULT false');
        }
    }
};
