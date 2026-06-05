<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class GreenlogMoveCompanyScope extends Command
{
    protected $signature = 'greenlog:move-company-scope
        {from : Current company_key}
        {to : Target company_key}
        {--dry-run : Show affected row counts without updating data}';

    protected $description = 'Move GreenLog data from one company_key scope to another.';

    private const TABLES = [
        'greenlog_locations',
        'greenlog_plants',
        'greenlog_plant_photos',
        'greenlog_expenses',
        'greenlog_care_tasks',
        'greenlog_plant_species',
    ];

    public function handle(): int
    {
        $from = (string) $this->argument('from');
        $to = (string) $this->argument('to');
        $isDryRun = (bool) $this->option('dry-run');

        if ($from === $to) {
            $this->error('Source and target company_key must be different.');

            return self::FAILURE;
        }

        $rows = $this->collectRows($from);

        $this->info($isDryRun
            ? "Dry run: GreenLog records that would move from [{$from}] to [{$to}]."
            : "Moving GreenLog records from [{$from}] to [{$to}]."
        );

        $this->table(['Table', 'Records', 'Action'], $rows);

        if ($isDryRun) {
            $this->comment('No data was changed. Run the same command without --dry-run to apply.');

            return self::SUCCESS;
        }

        DB::transaction(function () use ($from, $to): void {
            foreach (self::TABLES as $table) {
                if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'company_key')) {
                    continue;
                }

                DB::table($table)
                    ->where('company_key', $from)
                    ->update(['company_key' => $to]);
            }
        });

        $this->info('GreenLog company scope move completed.');
        $this->table(['Table', 'Records left in source', 'Records in target'], $this->collectAfterRows($from, $to));

        return self::SUCCESS;
    }

    private function collectRows(string $from): array
    {
        return array_map(function (string $table) use ($from): array {
            if (! Schema::hasTable($table)) {
                return [$table, 0, 'skipped: table missing'];
            }

            if (! Schema::hasColumn($table, 'company_key')) {
                return [$table, 0, 'skipped: company_key missing'];
            }

            return [
                $table,
                DB::table($table)->where('company_key', $from)->count(),
                'will update',
            ];
        }, self::TABLES);
    }

    private function collectAfterRows(string $from, string $to): array
    {
        return array_map(function (string $table) use ($from, $to): array {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'company_key')) {
                return [$table, '-', '-'];
            }

            return [
                $table,
                DB::table($table)->where('company_key', $from)->count(),
                DB::table($table)->where('company_key', $to)->count(),
            ];
        }, self::TABLES);
    }
}
