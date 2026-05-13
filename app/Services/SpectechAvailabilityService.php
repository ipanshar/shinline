<?php

namespace App\Services;

use App\Models\SpectechSchedule;
use App\Models\Truck;
use App\Models\TruckCategory;

class SpectechAvailabilityService
{
    private ?int $spectechCatId = null;

    private function getSpectechCatId(): ?int
    {
        if ($this->spectechCatId === null) {
            $cat = TruckCategory::where('name', 'Спец техника')->first();
            $this->spectechCatId = $cat?->id;
        }
        return $this->spectechCatId;
    }

    /**
     * Проверить, свободна ли техника в периоде
     */
    public function isTruckAvailable(int $truckId, string $start, string $end, ?int $excludeScheduleId = null): bool
    {
        return !SpectechSchedule::isTruckOccupied($truckId, $start, $end, $excludeScheduleId);
    }

    /**
     * Получить информацию о занятости техники
     */
    public function getTruckOccupancyInfo(int $truckId, string $start, string $end, ?int $excludeScheduleId = null): ?array
    {
        $conflicts = SpectechSchedule::where('truck_id', $truckId)
            ->whereIn('status', SpectechSchedule::ACTIVE_STATUSES)
            ->where('scheduled_start', '<', $end)
            ->where('scheduled_end', '>', $start)
            ->when($excludeScheduleId, fn($q) => $q->where('id', '!=', $excludeScheduleId))
            ->orderBy('scheduled_start')
            ->get(['id', 'scheduled_start', 'scheduled_end', 'purpose', 'status'])
            ->map(fn($s) => [
                'id'              => $s->id,
                'scheduled_start' => $s->scheduled_start?->format('d.m.Y H:i'),
                'scheduled_end'   => $s->scheduled_end?->format('d.m.Y H:i'),
                'purpose'         => $s->purpose,
                'status_label'    => SpectechSchedule::STATUS_LABELS[$s->status] ?? $s->status,
            ])
            ->toArray();

        if (empty($conflicts)) {
            return null;
        }

        $freeAt = SpectechSchedule::getNextFreeAt($truckId, $start, $end, $excludeScheduleId);

        return [
            'conflicts' => $conflicts,
            'free_at'   => $freeAt ? (new \DateTime($freeAt))->format('d.m.Y H:i') : 'неизвестно',
        ];
    }

    /**
     * Найти свободную машину того же типа (по названию)
     * Возвращает первую свободную машину, если есть
     */
    public function findFreeAlternativeTruck(int $truckId, string $start, string $end, ?int $excludeScheduleId = null): ?Truck
    {
        $truck = Truck::find($truckId);
        if (!$truck) {
            return null;
        }

        $typeKey = $this->extractEquipmentTypeKey($truck->name ?? '');
        if (!$typeKey) {
            return null;
        }

        $spectechCatId = $this->getSpectechCatId();

        // Находим все машины того же типа
        $allTrucks = Truck::query()
            ->when($spectechCatId, fn($q) => $q->where('truck_category_id', $spectechCatId))
            ->get(['id', 'name', 'plate_number'])
            ->filter(fn($t) => $this->extractEquipmentTypeKey($t->name ?? '') === $typeKey)
            ->values();

        // Ищем первую свободную
        foreach ($allTrucks as $t) {
            if (!SpectechSchedule::isTruckOccupied($t->id, $start, $end, $excludeScheduleId)) {
                return $t;
            }
        }

        return null;
    }

    /**
     * Получить список всех конфликтов для машин данного типа
     */
    public function getTypeConflictInfo(int $truckId, string $start, string $end, ?int $excludeScheduleId = null): array
    {
        $truck = Truck::find($truckId);
        if (!$truck) {
            return [];
        }

        $typeKey = $this->extractEquipmentTypeKey($truck->name ?? '');
        if (!$typeKey) {
            return [];
        }

        $spectechCatId = $this->getSpectechCatId();

        // Находим все машины того же типа
        $allTrucks = Truck::query()
            ->when($spectechCatId, fn($q) => $q->where('truck_category_id', $spectechCatId))
            ->get(['id', 'name', 'plate_number'])
            ->filter(fn($t) => $this->extractEquipmentTypeKey($t->name ?? '') === $typeKey)
            ->values();

        $conflictInfo = [];

        foreach ($allTrucks as $t) {
            $busy = SpectechSchedule::isTruckOccupied($t->id, $start, $end, $excludeScheduleId);

            if ($busy) {
                $freeAt = SpectechSchedule::getNextFreeAt($t->id, $start, $end, $excludeScheduleId);
                $conflicts = SpectechSchedule::where('truck_id', $t->id)
                    ->whereIn('status', SpectechSchedule::ACTIVE_STATUSES)
                    ->where('scheduled_start', '<', $end)
                    ->where('scheduled_end', '>', $start)
                    ->when($excludeScheduleId, fn($q) => $q->where('id', '!=', $excludeScheduleId))
                    ->orderBy('scheduled_start')
                    ->get(['scheduled_start', 'scheduled_end', 'purpose'])
                    ->map(fn($s) => [
                        'from'    => $s->scheduled_start?->format('d.m.Y H:i'),
                        'to'      => $s->scheduled_end?->format('d.m.Y H:i'),
                        'purpose' => $s->purpose,
                    ])
                    ->toArray();

                $conflictInfo[] = [
                    'truck_id'     => $t->id,
                    'truck_name'   => $t->name,
                    'plate_number' => $t->plate_number,
                    'free_at'      => $freeAt ? (new \DateTime($freeAt))->format('d.m.Y H:i') : 'неизвестно',
                    'conflicts'    => $conflicts,
                ];
            }
        }

        return $conflictInfo;
    }

    /**
     * Извлечь ключ типа из имени (убрать цифры и знаки в конце)
     * "Камаз 1" → "Камаз"
     * "Автокран 25т №2" → "Автокран 25т"
     */
    private function extractEquipmentTypeKey(string $name): string
    {
        $cleaned = preg_replace('/[\s]+[№#]?\d+\s*$/', '', trim($name));
        return trim($cleaned ?: $name);
    }
}
