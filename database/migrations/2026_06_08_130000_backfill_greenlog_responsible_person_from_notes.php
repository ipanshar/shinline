<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('greenlog_plants')
            ->whereNull('responsible_person')
            ->where('notes', 'like', 'Ответственный:%')
            ->orderBy('id')
            ->chunkById(500, function ($plants): void {
                foreach ($plants as $plant) {
                    $responsible = trim(preg_replace('/^Ответственный:\s*/u', '', (string) $plant->notes) ?? '');

                    if ($responsible === '') {
                        continue;
                    }

                    DB::table('greenlog_plants')
                        ->where('id', $plant->id)
                        ->update(['responsible_person' => mb_substr($responsible, 0, 255)]);
                }
            });
    }

    public function down(): void
    {
        //
    }
};
