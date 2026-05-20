<?php

namespace App\Console\Commands;

use App\Models\Status;
use App\Models\Truck;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class CleanupGarbageTrucks extends Command
{
    protected $signature = 'truck:cleanup-garbage
                            {--dry-run : Show matching trucks without deleting them}
                            {--force : Run without confirmation}
                            {--limit= : Maximum number of trucks to delete}
                            {--chunk=500 : Number of trucks to delete per transaction}
                            {--anpr-only : Delete only trucks marked as ANPR-created}';

    protected $description = 'Delete garbage trucks without active permits, tasks, or drivers';

    private array $protectedReferenceTables = [
        'spectech_requests',
        'spectech_schedules',
        'utilization_requests',
        'weighings',
        'weighing_requirements',
        'guest_visit_vehicles',
        'exit_permits',
    ];

    private array $nullableTruckReferenceTables = [
        'vehicle_captures',
        'visitors',
        'checkpoint_exit_reviews',
    ];

    public function handle(): int
    {
        $activeStatusId = Status::query()->where('key', 'active')->value('id');

        if (!$activeStatusId) {
            $this->error("Status with key 'active' was not found. Cleanup stopped.");

            return self::FAILURE;
        }

        $chunkSize = max(1, (int) $this->option('chunk'));
        $limit = $this->normalizeLimit($this->option('limit'));
        $dryRun = (bool) $this->option('dry-run');

        $candidateQuery = $this->garbageTruckQuery((int) $activeStatusId);
        $totalCandidates = (clone $candidateQuery)->count();
        $targetTotal = $limit === null ? $totalCandidates : min($totalCandidates, $limit);

        $this->info("Garbage truck candidates found: {$totalCandidates}");

        if ($limit !== null) {
            $this->info("Limit applied: {$limit}. Trucks targeted this run: {$targetTotal}");
        }

        $this->showPreview((clone $candidateQuery)->orderBy('trucks.id')->limit(20)->get());

        if ($targetTotal === 0) {
            $this->info('Nothing to delete.');

            return self::SUCCESS;
        }

        if ($dryRun) {
            $this->warn('Dry-run mode: no database changes were made.');

            return self::SUCCESS;
        }

        if (!$this->option('force') && !$this->confirm("Delete {$targetTotal} garbage trucks from database?")) {
            $this->warn('Cleanup canceled.');

            return self::SUCCESS;
        }

        $summary = [
            'trucks_deleted' => 0,
            'inactive_permits_deleted' => 0,
            'parking_permits_deleted' => 0,
            'guest_permit_links_deleted' => 0,
            'truck_zone_history_deleted' => 0,
            'truck_user_links_deleted' => 0,
            'references_nulled' => 0,
            'visitor_permit_links_nulled' => 0,
            'chunks' => 0,
        ];

        try {
            if ($limit !== null) {
                $truckIds = (clone $candidateQuery)
                    ->orderBy('trucks.id')
                    ->limit($limit)
                    ->pluck('trucks.id')
                    ->all();

                $this->deleteTruckIds($truckIds, (int) $activeStatusId, $summary);
            } else {
                (clone $candidateQuery)
                    ->select('trucks.id')
                    ->orderBy('trucks.id')
                    ->chunkById($chunkSize, function ($trucks) use ($activeStatusId, &$summary) {
                        $this->deleteTruckIds($trucks->pluck('id')->all(), (int) $activeStatusId, $summary);
                    }, 'trucks.id', 'id');
            }
        } catch (\Throwable $e) {
            Log::error('truck:cleanup-garbage failed', [
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            $this->error('Cleanup failed: ' . $e->getMessage());

            return self::FAILURE;
        }

        $this->table(
            [
                'trucks_deleted',
                'inactive_permits_deleted',
                'parking_permits_deleted',
                'guest_permit_links_deleted',
                'truck_zone_history_deleted',
                'truck_user_links_deleted',
                'references_nulled',
                'visitor_permit_links_nulled',
                'chunks',
            ],
            [[
                $summary['trucks_deleted'],
                $summary['inactive_permits_deleted'],
                $summary['parking_permits_deleted'],
                $summary['guest_permit_links_deleted'],
                $summary['truck_zone_history_deleted'],
                $summary['truck_user_links_deleted'],
                $summary['references_nulled'],
                $summary['visitor_permit_links_nulled'],
                $summary['chunks'],
            ]]
        );

        $this->info('Garbage truck cleanup completed.');

        return self::SUCCESS;
    }

    private function garbageTruckQuery(int $activeStatusId)
    {
        $query = Truck::query()
            ->select('trucks.*')
            ->where(function ($query) {
                $query->whereNull('trucks.user_id')
                    ->orWhere('trucks.user_id', 0);
            });

        if ((bool) $this->option('anpr-only') && Schema::hasColumn('trucks', 'anpr_source')) {
            $query->where('trucks.anpr_source', true);
        }

        $this->whereNoTruckRows($query, 'tasks');
        $this->whereNoTruckRows($query, 'truck_user');

        $this->whereNoTruckRows($query, 'entry_permits', function ($subQuery) use ($activeStatusId) {
            $subQuery
                ->where('entry_permits.status_id', $activeStatusId)
                ->where(function ($dateQuery) {
                    $dateQuery->whereNull('entry_permits.end_date')
                        ->orWhere('entry_permits.end_date', '>=', now()->startOfDay());
                });
        });

        $this->whereNoTruckRows($query, 'entry_permits', function ($subQuery) {
            $subQuery
                ->whereNotNull('entry_permits.user_id')
                ->where('entry_permits.user_id', '!=', 0);
        });

        $this->whereNoTruckRows($query, 'entry_permits', function ($subQuery) {
            $subQuery
                ->whereNotNull('entry_permits.task_id')
                ->where('entry_permits.task_id', '!=', '');
        });

        $this->whereNoTruckRows($query, 'visitors', function ($subQuery) {
            $subQuery
                ->whereNotNull('visitors.user_id')
                ->where('visitors.user_id', '!=', 0);
        });

        foreach ($this->protectedReferenceTables as $table) {
            $this->whereNoTruckRows($query, $table);
        }

        $this->whereNoGuestPermitLinks($query);

        return $query;
    }

    private function whereNoTruckRows($query, string $table, ?callable $callback = null): void
    {
        if (!$this->hasTruckIdColumn($table)) {
            return;
        }

        $query->whereNotExists(function ($subQuery) use ($table, $callback) {
            $subQuery
                ->selectRaw('1')
                ->from($table)
                ->whereColumn("{$table}.truck_id", 'trucks.id');

            if ($callback !== null) {
                $callback($subQuery);
            }
        });
    }

    private function whereNoGuestPermitLinks($query): void
    {
        if (!Schema::hasTable('guest_visit_permits') || !$this->hasTruckIdColumn('entry_permits')) {
            return;
        }

        $query->whereNotExists(function ($subQuery) {
            $subQuery
                ->selectRaw('1')
                ->from('guest_visit_permits')
                ->join('entry_permits', 'entry_permits.id', '=', 'guest_visit_permits.entry_permit_id')
                ->whereColumn('entry_permits.truck_id', 'trucks.id');
        });
    }

    private function deleteTruckIds(array $truckIds, int $activeStatusId, array &$summary): void
    {
        $truckIds = array_values(array_unique(array_map('intval', $truckIds)));

        if ($truckIds === []) {
            return;
        }

        DB::transaction(function () use ($truckIds, $activeStatusId, &$summary) {
            $safeTruckIds = $this->garbageTruckQuery($activeStatusId)
                ->whereIn('trucks.id', $truckIds)
                ->pluck('trucks.id')
                ->all();

            if ($safeTruckIds === []) {
                return;
            }

            $permitIds = DB::table('entry_permits')
                ->whereIn('truck_id', $safeTruckIds)
                ->pluck('id')
                ->all();

            foreach ($this->nullableTruckReferenceTables as $table) {
                if (!$this->hasTruckIdColumn($table)) {
                    continue;
                }

                $summary['references_nulled'] += DB::table($table)
                    ->whereIn('truck_id', $safeTruckIds)
                    ->update(['truck_id' => null]);
            }

            if ($permitIds !== [] && Schema::hasTable('visitors') && Schema::hasColumn('visitors', 'entry_permit_id')) {
                $summary['visitor_permit_links_nulled'] += DB::table('visitors')
                    ->whereIn('entry_permit_id', $permitIds)
                    ->update(['entry_permit_id' => null]);
            }

            if ($permitIds !== [] && Schema::hasTable('dss_parking_permits')) {
                $summary['parking_permits_deleted'] += DB::table('dss_parking_permits')
                    ->whereIn('entry_permit_id', $permitIds)
                    ->delete();
            }

            if ($permitIds !== [] && Schema::hasTable('guest_visit_permits')) {
                $summary['guest_permit_links_deleted'] += DB::table('guest_visit_permits')
                    ->whereIn('entry_permit_id', $permitIds)
                    ->delete();
            }

            if (Schema::hasTable('entry_permits')) {
                $summary['inactive_permits_deleted'] += DB::table('entry_permits')
                    ->whereIn('truck_id', $safeTruckIds)
                    ->delete();
            }

            if ($this->hasTruckIdColumn('truck_zone_history')) {
                $summary['truck_zone_history_deleted'] += DB::table('truck_zone_history')
                    ->whereIn('truck_id', $safeTruckIds)
                    ->delete();
            }

            if ($this->hasTruckIdColumn('truck_user')) {
                $summary['truck_user_links_deleted'] += DB::table('truck_user')
                    ->whereIn('truck_id', $safeTruckIds)
                    ->delete();
            }

            $summary['trucks_deleted'] += Truck::query()
                ->whereIn('id', $safeTruckIds)
                ->delete();

            $summary['chunks']++;
        });
    }

    private function showPreview($trucks): void
    {
        if ($trucks->isEmpty()) {
            return;
        }

        $this->table(
            ['id', 'plate_number', 'name', 'anpr_source', 'last_seen_at'],
            $trucks->map(function (Truck $truck) {
                return [
                    $truck->id,
                    $truck->plate_number ?? '-',
                    $truck->name ?? '-',
                    (int) ($truck->anpr_source ?? 0),
                    $truck->last_seen_at ?? '-',
                ];
            })->all()
        );
    }

    private function normalizeLimit(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        $limit = (int) $value;

        return $limit > 0 ? $limit : null;
    }

    private function hasTruckIdColumn(string $table): bool
    {
        return Schema::hasTable($table) && Schema::hasColumn($table, 'truck_id');
    }
}
