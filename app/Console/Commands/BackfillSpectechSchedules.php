<?php

namespace App\Console\Commands;

use App\Models\SpectechRequest;
use App\Models\SpectechSchedule;
use App\Models\Truck;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class BackfillSpectechSchedules extends Command
{
    protected $signature = 'spectech:backfill-schedules {--dry-run : Only show what will be changed}';

    protected $description = 'Backfill spectech_schedules for existing spectech_requests without schedule_id';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $query = SpectechRequest::query()->whereNull('schedule_id')->orderBy('id');
        $total = (clone $query)->count();

        if ($total === 0) {
            $this->info('No requests without schedule_id found. Nothing to backfill.');
            return self::SUCCESS;
        }

        $this->info('Found ' . $total . ' request(s) without schedule_id.');
        if ($dryRun) {
            $this->line('Dry-run mode: no DB changes will be written.');
        }

        $created = 0;
        $skipped = 0;

        $query->chunkById(100, function ($requests) use (&$created, &$skipped, $dryRun) {
            foreach ($requests as $request) {
                $truck = Truck::find($request->truck_id);
                if (!$truck) {
                    $skipped++;
                    $this->warn("Request #{$request->id}: truck_id={$request->truck_id} not found, skipped.");
                    continue;
                }

                $start = $request->requested_start
                    ? Carbon::parse($request->requested_start)
                    : ($request->start_date ? Carbon::parse($request->start_date)->startOfDay() : Carbon::parse($request->created_at));

                $end = $request->requested_end
                    ? Carbon::parse($request->requested_end)
                    : ($request->end_date ? Carbon::parse($request->end_date)->endOfDay() : (clone $start)->addHours(8));

                if ($end->lte($start)) {
                    $end = (clone $start)->addHours(1);
                }

                $typeKey = $this->extractEquipmentTypeKey($truck->name ?? 'Спецтехника');
                $scheduleStatus = $this->mapRequestStatusToScheduleStatus((string) $request->status);

                $purpose = trim((string) ($request->comment ?? ''));
                if ($purpose === '') {
                    $purpose = 'Заявка #' . $request->id;
                }

                if ($dryRun) {
                    $created++;
                    $this->line("[DRY] Request #{$request->id} -> schedule ({$start->toIso8601String()} - {$end->toIso8601String()})");
                    continue;
                }

                DB::transaction(function () use ($request, $truck, $typeKey, $scheduleStatus, $start, $end, $purpose) {
                    $schedule = SpectechSchedule::create([
                        'user_id'              => $request->user_id,
                        'truck_id'             => $truck->id,
                        'equipment_type_key'   => $typeKey,
                        'equipment_type_label' => $typeKey,
                        'assigned_truck_name'  => $truck->name . ($truck->plate_number ? " ({$truck->plate_number})" : ''),
                        'scheduled_start'      => $start,
                        'scheduled_end'        => $end,
                        'purpose'              => $purpose,
                        'address'              => $request->address,
                        'notes'                => $request->comment,
                        'status'               => $scheduleStatus,
                    ]);

                    $request->schedule_id = $schedule->id;
                    $request->requested_start = $request->requested_start ?? $start;
                    $request->requested_end = $request->requested_end ?? $end;
                    $request->save();
                });

                $created++;
                $this->line("Request #{$request->id}: schedule created and linked.");
            }
        });

        $this->newLine();
        $this->info('Done.');
        $this->line('Created/linked: ' . $created);
        $this->line('Skipped: ' . $skipped);

        return self::SUCCESS;
    }

    private function extractEquipmentTypeKey(string $name): string
    {
        $cleaned = preg_replace('/[\s]+[№#]?\d+\s*$/', '', trim($name));
        return trim($cleaned ?: $name);
    }

    private function mapRequestStatusToScheduleStatus(string $requestStatus): string
    {
        return match ($requestStatus) {
            'new' => SpectechSchedule::STATUS_PENDING,
            'departure', 'on_location', 'work_started' => SpectechSchedule::STATUS_IN_PROGRESS,
            'completed', 'returned' => SpectechSchedule::STATUS_DONE,
            default => SpectechSchedule::STATUS_PENDING,
        };
    }
}

