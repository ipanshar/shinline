<?php

namespace App\Services;

use App\Models\Counterparty;
use App\Models\EntryPermit;
use App\Models\Status;
use App\Models\Truck;
use App\Models\TruckBrand;
use App\Models\TruckModel;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class EntryPermitImportService
{
    public function __construct(
        private DssPermitVehicleService $permitVehicleService,
        private EntryPermitReplacementService $permitReplacementService,
    )
    {
    }

    public function import(array $rows, int $yardId, bool $onePermission, ?bool $weighingRequired, ?int $grantedByUserId = null): array
    {
        $activeStatusId = Status::where('key', 'active')->value('id');

        if (!$activeStatusId) {
            throw new RuntimeException('Active status not found');
        }

        $result = [
            'created_trucks' => 0,
            'updated_trucks' => 0,
            'created_counterparties' => 0,
            'linked_counterparties' => 0,
            'created_permits' => 0,
            'replaced_permits' => 0,
            'skipped_permits' => 0,
            'processed_rows' => 0,
            'errors' => [],
        ];

        foreach ($rows as $index => $row) {
            try {
                $createdPermitId = null;
                $replacedPermitIds = [];

                DB::transaction(function () use ($row, $index, $yardId, $onePermission, $weighingRequired, $grantedByUserId, $activeStatusId, &$result, &$createdPermitId, &$replacedPermitIds) {
                    $mapped = $this->mapRow($row);
                    $rowLabel = 'Строка ' . ($index + 1);

                    if (!$mapped['plate_number']) {
                        throw new RuntimeException($rowLabel . ': не найден гос. номер');
                    }

                    if (!$mapped['owner_name']) {
                        throw new RuntimeException($rowLabel . ': не найден владелец');
                    }

                    $counterparty = Counterparty::query()
                        ->whereRaw('LOWER(name) = ?', [mb_strtolower($mapped['owner_name'], 'UTF-8')])
                        ->first();

                    if (!$counterparty) {
                        $counterparty = Counterparty::create([
                            'name' => $mapped['owner_name'],
                            'inn' => $this->generateImportedInn($mapped['owner_name']),
                        ]);
                        $result['created_counterparties']++;
                    }

                    $truck = Truck::query()
                        ->where('plate_number', $mapped['plate_number'])
                        ->first();

                    [$truckBrandId, $truckModelId] = $this->resolveBrandAndModelIds($mapped['vehicle_name']);
                    $truckPayload = array_filter([
                        'plate_number' => $mapped['plate_number'],
                        'name' => $mapped['vehicle_name'] ?: $mapped['plate_number'],
                        'user_id' => $grantedByUserId,
                        'counterparty_id' => $counterparty->id,
                        'truck_brand_id' => $truckBrandId,
                        'truck_model_id' => $truckModelId,
                        'trailer_number' => $mapped['trailer_number'],
                    ], static fn ($value) => $value !== null && $value !== '');

                    if ($truck) {
                        $updateData = $this->mergeTruckPayload($truckPayload, $truck->toArray());
                        if ($truck->counterparty_id !== $counterparty->id) {
                            $result['linked_counterparties']++;
                        }
                        $truck->fill($updateData);
                        $truck->save();
                        $result['updated_trucks']++;
                    } else {
                        $truck = Truck::create($truckPayload);
                        $result['created_trucks']++;
                        $result['linked_counterparties']++;
                    }

                    $replacementResult = $this->permitReplacementService->deactivateExistingActivePermits($truck->id, $yardId);
                    $replacedPermitIds = $replacementResult['permits']->pluck('id')->all();
                    $result['replaced_permits'] += count($replacedPermitIds);

                    $permit = EntryPermit::create([
                        'truck_id' => $truck->id,
                        'yard_id' => $yardId,
                        'granted_by_user_id' => $grantedByUserId,
                        'one_permission' => $onePermission,
                        'weighing_required' => $weighingRequired,
                        'begin_date' => now(),
                        'status_id' => $activeStatusId,
                        'comment' => $this->buildPermitComment($mapped),
                    ]);
                    $createdPermitId = $permit->id;
                    $result['created_permits']++;

                    $result['processed_rows']++;
                });

                if ($createdPermitId) {
                    $permit = EntryPermit::find($createdPermitId);
                    if ($permit) {
                        $this->permitVehicleService->syncPermitVehicleSafely($permit);
                    }
                }
            } catch (\Throwable $exception) {
                $result['errors'][] = $exception->getMessage();
            }
        }

        return $result;
    }

    private function mapRow(array $row): array
    {
        $plateNumber = Truck::normalizePlateNumber($this->findColumnValue($row, [
            'гос', 'гос. номер', 'госномер', 'номер тс', 'номер', 'plate', 'plate number',
        ]));

        $vehicleName = $this->normalizeString($this->findColumnValue($row, [
            'марка', 'марка а/м', 'модель', 'авто', 'транспорт', 'vehicle', 'truck',
        ]));

        $ownerName = $this->normalizeString($this->findColumnValue($row, [
            'собственник', 'владелец', 'контрагент', 'компания', 'owner', 'company',
        ]));

        $trailerNumber = Truck::normalizePlateNumber($this->findColumnValue($row, [
            'прицеп', 'п/прицеп', 'полуприцеп', 'trailer', 'trailer number',
        ]));

        return [
            'plate_number' => $plateNumber,
            'owner_name' => $ownerName,
            'vehicle_name' => $vehicleName,
            'region' => $this->normalizeString($this->findColumnValue($row, ['регион', 'region'])),
            'year' => $this->normalizeString($this->findColumnValue($row, ['год выпуска', 'год', 'year'])),
            'vehicle_type' => $this->normalizeString($this->findColumnValue($row, ['тип тс', 'тип', 'type'])),
            'body_type' => $this->normalizeString($this->findColumnValue($row, ['кузов', 'body'])),
            'note' => $this->normalizeString($this->findColumnValue($row, ['примечание', 'комментарий', 'note', 'comment'])),
            'trailer_number' => $trailerNumber,
        ];
    }

    private function findColumnValue(array $row, array $keywords): ?string
    {
        foreach ($row as $key => $value) {
            if ($value === null || $value === '') {
                continue;
            }

            $normalizedKey = mb_strtolower(trim((string) $key), 'UTF-8');
            foreach ($keywords as $keyword) {
                if (str_contains($normalizedKey, mb_strtolower($keyword, 'UTF-8'))) {
                    return is_scalar($value) ? trim((string) $value) : null;
                }
            }
        }

        return null;
    }

    private function normalizeString(mixed $value): ?string
    {
        if (!is_scalar($value)) {
            return null;
        }

        $normalized = trim((string) $value);

        return $normalized === '' ? null : $normalized;
    }

    private function mergeTruckPayload(array $payload, array $current): array
    {
        $update = [];

        foreach ($payload as $key => $value) {
            if ($value === null || $value === '') {
                continue;
            }

            if (Arr::get($current, $key) !== $value) {
                $update[$key] = $value;
            }
        }

        return $update;
    }

    private function resolveBrandAndModelIds(?string $vehicleName): array
    {
        if (!$vehicleName) {
            return [null, null];
        }

        $parts = preg_split('/\s+/u', trim($vehicleName)) ?: [];
        $brandName = $parts[0] ?? null;

        if (!$brandName) {
            return [null, null];
        }

        $brand = TruckBrand::firstOrCreate([
            'name' => $brandName,
        ]);

        $model = TruckModel::firstOrCreate([
            'name' => $vehicleName,
        ], [
            'truck_brand_id' => $brand->id,
        ]);

        if (!$model->truck_brand_id) {
            $model->truck_brand_id = $brand->id;
            $model->save();
        }

        return [$brand->id, $model->id];
    }

    private function buildPermitComment(array $mapped): ?string
    {
        $parts = array_filter([
            $mapped['region'] ? 'Регион: ' . $mapped['region'] : null,
            $mapped['year'] ? 'Год выпуска: ' . $mapped['year'] : null,
            $mapped['vehicle_type'] ? 'Тип ТС: ' . $mapped['vehicle_type'] : null,
            $mapped['body_type'] ? 'Кузов: ' . $mapped['body_type'] : null,
            $mapped['note'] ? 'Примечание: ' . $mapped['note'] : null,
        ]);

        if ($parts === []) {
            return null;
        }

        return implode('; ', $parts);
    }

    private function generateImportedInn(string $ownerName): string
    {
        return 'IMPORT-' . mb_strtoupper(substr(sha1($ownerName), 0, 20), 'UTF-8');
    }
}