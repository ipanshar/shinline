<?php

namespace App\Services;

use App\Models\Truck;
use App\Models\TruckCategory;
use Illuminate\Support\Carbon;

/**
 * Синхронизирует данные транспортного средства, распознанного ANPR-камерой,
 * с таблицей trucks: обновляет существующую запись или создаёт новую.
 *
 * Логика поиска:
 *  1. Если есть номер (plateNo) — ищем по plate_number (без учёта регистра/пробелов).
 *  2. Если номера нет — ищем по имени (vehicleBrandName + vehicleModelName)
 *     внутри категории «Спец техника», чтобы не смешивать с однотёзками.
 */
class AnprTruckSyncService
{
    /** Кешированный id категории «Спец техника», чтобы не запрашивать БД каждый раз. */
    private ?int $spectechCategoryId = null;

    /**
     * Обработать один элемент из ANPR pageData.
     *
     * @param array $item  Нормализованный элемент: plateNo, channelName, captureTime,
     *                     vehicleBrandName, vehicleModelName, vehicleColorName,
     *                     confidence, plateScore
     */
    public function syncFromCaptureItem(array $item): void
    {
        try {
            $plateNo      = trim((string) ($item['plateNo'] ?? ''));
            $channelName  = (string) ($item['channelName'] ?? '');
            $captureTime  = (int) ($item['captureTime'] ?? 0);
            $brandName    = (string) ($item['vehicleBrandName'] ?? '');
            $modelName    = (string) ($item['vehicleModelName'] ?? '');
            $colorName    = (string) ($item['vehicleColorName'] ?? '');
            $confidence   = isset($item['confidence'])  ? (float) $item['confidence']  : null;
            $plateScore   = isset($item['plateScore'])  ? (float) $item['plateScore']  : null;

            if ($captureTime <= 0) {
                return;
            }

            $lastSeenAt = Carbon::createFromTimestamp($captureTime);

            $truck = $this->findTruck($plateNo, $brandName, $modelName);

            if ($truck) {
                // Обновляем ANPR-поля существующей записи
                $updates = [
                    'last_seen_at'    => $lastSeenAt,
                    'last_seen_gate'  => $channelName,
                    'anpr_source'     => true,
                ];

                if ($colorName !== '') {
                    $updates['color'] = $colorName;
                }
                if ($confidence !== null) {
                    $updates['anpr_confidence'] = $confidence;
                }
                if ($plateScore !== null) {
                    $updates['plate_score'] = $plateScore;
                }

                $truck->update($updates);
            } else {
                // Создаём новую запись
                $name = trim("$brandName $modelName") ?: ($plateNo ?: 'Неизвестно');

                Truck::create([
                    'name'             => $name,
                    'plate_number'     => $plateNo !== '' ? $plateNo : null,
                    'color'            => $colorName !== '' ? $colorName : null,
                    'own'              => 'собственный',
                    'truck_category_id'=> $this->getSpectechCategoryId(),
                    'anpr_source'      => true,
                    'last_seen_at'     => $lastSeenAt,
                    'last_seen_gate'   => $channelName,
                    'anpr_confidence'  => $confidence,
                    'plate_score'      => $plateScore,
                ]);
            }
        } catch (\Throwable $e) {
            // Не ломаем основной pipeline захвата
            \Illuminate\Support\Facades\Log::warning('AnprTruckSyncService: ошибка синхронизации', [
                'error' => $e->getMessage(),
                'item'  => $item,
            ]);
        }
    }

    /**
     * Ищет Truck:
     *  - Сначала по номеру (если номер есть).
     *  - Затем по имени внутри категории «Спец техника» (если номера нет).
     */
    private function findTruck(string $plateNo, string $brandName, string $modelName): ?Truck
    {
        if ($plateNo !== '') {
            $normalized = mb_strtolower(str_replace([' ', '-'], '', $plateNo));

            return Truck::whereRaw(
                "REPLACE(REPLACE(LOWER(COALESCE(plate_number,'')), ' ', ''), '-', '') = ?",
                [$normalized]
            )->first();
        }

        // Без номера — ищем по имени внутри категории спецтехники
        $name = trim("$brandName $modelName");
        if ($name === '') {
            return null;
        }

        return Truck::where('name', $name)
            ->where('truck_category_id', $this->getSpectechCategoryId())
            ->first();
    }

    /**
     * Возвращает id категории «Спец техника», создавая её при необходимости.
     */
    private function getSpectechCategoryId(): int
    {
        if ($this->spectechCategoryId === null) {
            $category = TruckCategory::firstOrCreate(
                ['name' => 'Спец техника'],
                ['ru_name' => 'Спец техника']
            );
            $this->spectechCategoryId = $category->id;
        }

        return $this->spectechCategoryId;
    }
}

