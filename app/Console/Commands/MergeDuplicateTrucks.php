<?php

namespace App\Console\Commands;

use App\Models\Truck;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class MergeDuplicateTrucks extends Command
{
    protected $signature = 'truck:merge-duplicates
                            {--plate= : Нормализованный номер для обработки только одной группы}
                            {--dry-run : Только показать, что будет объединено, без сохранения}
                            {--force : Не запрашивать подтверждение перед слиянием}';

    protected $description = 'Ищет и объединяет дубликаты ТС по нормализованному номеру (без пробелов и дефисов)';

    private array $referenceTables = [
        'entry_permits',
        'tasks',
        'visitors',
        'vehicle_captures',
        'truck_zone_history',
        'weighings',
        'weighing_requirements',
        'checkpoint_exit_reviews',
    ];

    private ?array $existingReferenceTables = null;

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $plateFilter = Truck::normalizePlateNumber($this->option('plate'));

        $duplicateGroups = $this->getDuplicateGroups($plateFilter);

        if ($duplicateGroups->isEmpty()) {
            $this->info('Дубликаты ТС не найдены.');
            return self::SUCCESS;
        }

        $this->info('Найдено групп дублей: ' . $duplicateGroups->count());

        if ($dryRun) {
            $this->warn('DRY-RUN режим: изменения в БД вноситься не будут.');
        }

        $previewRows = [];
        foreach ($duplicateGroups as $group) {
            $previewRows[] = [
                $group['normalized_plate'],
                count($group['truck_ids']),
                implode(', ', $group['truck_ids']),
            ];
        }

        $this->table(['Номер', 'Кол-во дублей', 'ID ТС'], $previewRows);

        if (!$dryRun && !$this->option('force') && !$this->confirm('Продолжить слияние дублей?')) {
            $this->warn('Операция отменена пользователем.');
            return self::INVALID;
        }

        $processedGroups = 0;
        $mergedTrucks = 0;

        foreach ($duplicateGroups as $group) {
            $trucks = Truck::query()
                ->whereIn('id', $group['truck_ids'])
                ->get();

            if ($trucks->count() < 2) {
                continue;
            }

            $primaryTruck = $this->choosePrimaryTruck($trucks);
            $duplicateTrucks = $trucks
                ->filter(fn (Truck $truck) => $truck->id !== $primaryTruck->id)
                ->values();

            $this->line('');
            $this->info("Номер {$group['normalized_plate']}: основной ТС #{$primaryTruck->id}, дублей: {$duplicateTrucks->count()}");

            $stats = $dryRun
                ? $this->simulateMerge($primaryTruck, $duplicateTrucks)
                : $this->mergeGroup($primaryTruck, $duplicateTrucks, $group['normalized_plate']);

            foreach ($stats['messages'] as $message) {
                $this->line(' - ' . $message);
            }

            $processedGroups++;
            $mergedTrucks += $duplicateTrucks->count();
        }

        $this->newLine();
        $this->info('Готово. Обработано групп: ' . $processedGroups . ', дублей ТС: ' . $mergedTrucks . '.');

        return self::SUCCESS;
    }

    private function getDuplicateGroups(?string $plateFilter = null): Collection
    {
        $query = DB::table('trucks')
            ->selectRaw("REPLACE(REPLACE(UPPER(plate_number), ' ', ''), '-', '') as normalized_plate")
            ->selectRaw('COUNT(*) as duplicates_count')
            ->selectRaw('GROUP_CONCAT(id ORDER BY id ASC) as truck_ids')
            ->whereNotNull('plate_number')
            ->whereRaw("TRIM(plate_number) <> ''")
            ->groupBy('normalized_plate')
            ->havingRaw('COUNT(*) > 1');

        if ($plateFilter) {
            $query->having('normalized_plate', '=', $plateFilter);
        }

        return collect($query->get())->map(function ($row) {
            return [
                'normalized_plate' => $row->normalized_plate,
                'truck_ids' => array_map('intval', explode(',', (string) $row->truck_ids)),
            ];
        });
    }

    private function choosePrimaryTruck(Collection $trucks): Truck
    {
        return $trucks
            ->sortByDesc(function (Truck $truck) {
                return ($this->getReferenceCount($truck->id) * 100) + $this->getCompletenessScore($truck);
            })
            ->sortBy('id')
            ->last();
    }

    private function getCompletenessScore(Truck $truck): int
    {
        $fields = [
            'vin',
            'color',
            'truck_model_id',
            'truck_category_id',
            'truck_brand_id',
            'trailer_model_id',
            'trailer_type_id',
            'trailer_number',
            'name',
            'own',
            'vip_level',
        ];

        $score = 0;
        foreach ($fields as $field) {
            $value = $truck->{$field};
            if ($value !== null && $value !== '') {
                $score++;
            }
        }

        return $score;
    }

    private function getReferenceCount(int $truckId): int
    {
        $count = Schema::hasTable('truck_user')
            ? DB::table('truck_user')->where('truck_id', $truckId)->count()
            : 0;

        foreach ($this->getExistingReferenceTables() as $table) {
            $count += DB::table($table)->where('truck_id', $truckId)->count();
        }

        return $count;
    }

    private function simulateMerge(Truck $primaryTruck, Collection $duplicateTrucks): array
    {
        $messages = [];
        $fillData = $this->collectBestTruckData($primaryTruck, $duplicateTrucks);

        if (!empty($fillData)) {
            $messages[] = 'будут дополнены поля основного ТС: ' . implode(', ', array_keys($fillData));
        }

        foreach ($duplicateTrucks as $duplicateTruck) {
            $messages[] = "ТС #{$duplicateTruck->id} будет переназначен на #{$primaryTruck->id} в связанных таблицах и удалён";
        }

        return ['messages' => $messages];
    }

    private function mergeGroup(Truck $primaryTruck, Collection $duplicateTrucks, string $normalizedPlate): array
    {
        return DB::transaction(function () use ($primaryTruck, $duplicateTrucks, $normalizedPlate) {
            $messages = [];
            $fillData = $this->collectBestTruckData($primaryTruck, $duplicateTrucks);

            if (!empty($fillData)) {
                $primaryTruck->fill($fillData);
                $primaryTruck->plate_number = $normalizedPlate;
                $primaryTruck->save();
                $messages[] = 'обновлён основной ТС #' . $primaryTruck->id . ' полями: ' . implode(', ', array_keys($fillData));
            } else {
                $primaryTruck->plate_number = $normalizedPlate;
                if ($primaryTruck->isDirty()) {
                    $primaryTruck->save();
                    $messages[] = 'нормализован номер у основного ТС #' . $primaryTruck->id;
                }
            }

            foreach ($duplicateTrucks as $duplicateTruck) {
                $this->mergeTruckUsers($primaryTruck->id, $duplicateTruck->id);

                foreach ($this->getExistingReferenceTables() as $table) {
                    DB::table($table)
                        ->where('truck_id', $duplicateTruck->id)
                        ->update(['truck_id' => $primaryTruck->id]);
                }

                $duplicateTruck->delete();
                $messages[] = "дубль ТС #{$duplicateTruck->id} объединён с #{$primaryTruck->id}";
            }

            return ['messages' => $messages];
        });
    }

    private function collectBestTruckData(Truck $primaryTruck, Collection $duplicateTrucks): array
    {
        $fillableFromDuplicates = [
            'vin',
            'color',
            'truck_model_id',
            'truck_category_id',
            'truck_brand_id',
            'trailer_model_id',
            'trailer_type_id',
            'trailer_number',
            'name',
            'own',
            'vip_level',
        ];

        $data = [];

        foreach ($fillableFromDuplicates as $field) {
            $primaryValue = $primaryTruck->{$field};
            if ($primaryValue !== null && $primaryValue !== '') {
                continue;
            }

            foreach ($duplicateTrucks as $duplicateTruck) {
                $duplicateValue = $duplicateTruck->{$field};
                if ($duplicateValue !== null && $duplicateValue !== '') {
                    $data[$field] = $duplicateValue;
                    break;
                }
            }
        }

        return $data;
    }

    private function mergeTruckUsers(int $primaryTruckId, int $duplicateTruckId): void
    {
        if (!Schema::hasTable('truck_user')) {
            return;
        }

        $rows = DB::table('truck_user')
            ->where('truck_id', $duplicateTruckId)
            ->get();

        foreach ($rows as $row) {
            $exists = DB::table('truck_user')
                ->where('truck_id', $primaryTruckId)
                ->where('user_id', $row->user_id)
                ->exists();

            if (!$exists) {
                DB::table('truck_user')->insert([
                    'truck_id' => $primaryTruckId,
                    'user_id' => $row->user_id,
                    'assigned_date' => $row->assigned_date,
                ]);
            }
        }

        DB::table('truck_user')
            ->where('truck_id', $duplicateTruckId)
            ->delete();
    }

    private function getExistingReferenceTables(): array
    {
        if ($this->existingReferenceTables !== null) {
            return $this->existingReferenceTables;
        }

        $missingTables = [];
        $existingTables = [];

        foreach ($this->referenceTables as $table) {
            if (Schema::hasTable($table)) {
                $existingTables[] = $table;
            } else {
                $missingTables[] = $table;
            }
        }

        if (!empty($missingTables)) {
            $this->warn('Пропущены отсутствующие таблицы: ' . implode(', ', $missingTables));
        }

        $this->existingReferenceTables = $existingTables;

        return $this->existingReferenceTables;
    }
}
