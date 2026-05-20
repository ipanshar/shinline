<?php

namespace App\Services;

use App\Models\SpectechRequest;
use App\Models\SpectechSchedule;
use App\Models\Truck;
use App\Models\TruckCategory;
use Illuminate\Support\Carbon;

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
        return ! SpectechSchedule::isTruckOccupied($truckId, $start, $end, $excludeScheduleId);
    }

    /**
     * Получить информацию о занятости техники
     */
    public function getTruckOccupancyInfo(int $truckId, string $start, string $end, ?int $excludeScheduleId = null): ?array
    {
        $start = $this->normalizeDateTime($start);
        $end = $this->normalizeDateTime($end);

        $conflicts = $this->getTruckConflictSchedules($truckId, $start, $end, $excludeScheduleId);

        if (empty($conflicts)) {
            return null;
        }

        $freeAt = SpectechSchedule::getNextFreeAt($truckId, $start, $end, $excludeScheduleId);

        return [
            'conflicts' => $conflicts,
            'free_at' => $freeAt ? (new \DateTime($freeAt))->format('d.m.Y H:i') : 'неизвестно',
        ];
    }

    /**
     * Найти свободную машину того же типа (по названию)
     * Возвращает первую свободную машину, если есть
     */
    public function findFreeAlternativeTruck(int $truckId, string $start, string $end, ?int $excludeScheduleId = null): ?Truck
    {
        $truck = Truck::find($truckId);
        if (! $truck) {
            return null;
        }

        $typeKey = $this->extractEquipmentTypeKey($truck->name ?? '');
        if (! $typeKey) {
            return null;
        }

        $spectechCatId = $this->getSpectechCatId();

        // Находим все машины того же типа
        $allTrucks = Truck::query()
            ->when($spectechCatId, fn ($q) => $q->where('truck_category_id', $spectechCatId))
            ->get(['id', 'name', 'plate_number'])
            ->filter(fn ($t) => $this->extractEquipmentTypeKey($t->name ?? '') === $typeKey)
            ->values();

        // Ищем первую свободную
        foreach ($allTrucks as $t) {
            if (! SpectechSchedule::isTruckOccupied($t->id, $start, $end, $excludeScheduleId)) {
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
        $start = $this->normalizeDateTime($start);
        $end = $this->normalizeDateTime($end);

        $truck = Truck::find($truckId);
        if (! $truck) {
            return [];
        }

        $typeKey = $this->extractEquipmentTypeKey($truck->name ?? '');
        if (! $typeKey) {
            return [];
        }

        $spectechCatId = $this->getSpectechCatId();

        // Находим все машины того же типа
        $allTrucks = Truck::query()
            ->when($spectechCatId, fn ($q) => $q->where('truck_category_id', $spectechCatId))
            ->get(['id', 'name', 'plate_number'])
            ->filter(fn ($t) => $this->extractEquipmentTypeKey($t->name ?? '') === $typeKey)
            ->values();

        $conflictInfo = [];

        foreach ($allTrucks as $t) {
            $busy = SpectechSchedule::isTruckOccupied($t->id, $start, $end, $excludeScheduleId);

            if ($busy) {
                $freeAt = SpectechSchedule::getNextFreeAt($t->id, $start, $end, $excludeScheduleId);
                $conflicts = $this->getTruckConflictSchedules($t->id, $start, $end, $excludeScheduleId);

                $conflictInfo[] = [
                    'truck_id' => $t->id,
                    'truck_name' => $t->name,
                    'plate_number' => $t->plate_number,
                    'free_at' => $freeAt ? (new \DateTime($freeAt))->format('d.m.Y H:i') : 'неизвестно',
                    'conflicts' => $conflicts,
                ];
            }
        }

        return $conflictInfo;
    }

    public function getRequestConflictInfo(SpectechRequest $request): array
    {
        $storedConflictInfo = $request->conflict_info ?? [];

        if (! $this->shouldRefreshStoredConflictInfo($storedConflictInfo)) {
            return $storedConflictInfo;
        }

        if (! $request->truck_id || ! $request->requested_start || ! $request->requested_end) {
            return $storedConflictInfo;
        }

        $liveConflictInfo = $this->getTypeConflictInfo(
            (int) $request->truck_id,
            $request->requested_start->toIso8601String(),
            $request->requested_end->toIso8601String(),
            $request->schedule_id ? (int) $request->schedule_id : null,
        );

        $liveConflictInfo = $this->excludeRequestFromConflictInfo($liveConflictInfo, (int) $request->id);

        return ! empty($liveConflictInfo) ? $liveConflictInfo : $storedConflictInfo;
    }

    public function getTruckConflictSchedules(int $truckId, string $start, string $end, ?int $excludeScheduleId = null): array
    {
        $start = $this->normalizeDateTime($start);
        $end = $this->normalizeDateTime($end);

        return SpectechSchedule::query()
            ->with(['spectechRequest.user', 'user'])
            ->where('truck_id', $truckId)
            ->whereIn('status', SpectechSchedule::ACTIVE_STATUSES)
            ->where('scheduled_start', '<', $end)
            ->where('scheduled_end', '>', $start)
            ->when($excludeScheduleId, fn ($query) => $query->where('id', '!=', $excludeScheduleId))
            ->orderBy('scheduled_start')
            ->get()
            ->map(fn (SpectechSchedule $schedule) => $this->formatScheduleConflict($schedule))
            ->toArray();
    }

    private function formatScheduleConflict(SpectechSchedule $schedule): array
    {
        $request = $schedule->spectechRequest;
        $initiatorName = $request?->initiator_name
            ?: $request?->user?->name
            ?: $schedule->user?->name
            ?: '—';
        $initiatorPhone = $request?->initiator_phone
            ?: $request?->user?->phone
            ?: $schedule->user?->phone;

        $locationParts = array_filter([
            $request?->terminal,
            $request?->zone,
            $request?->gate,
        ], fn ($value) => filled($value));

        return [
            'id' => $schedule->id,
            'schedule_id' => $schedule->id,
            'request_id' => $request?->id,
            'from' => $schedule->scheduled_start?->format('d.m.Y H:i'),
            'to' => $schedule->scheduled_end?->format('d.m.Y H:i'),
            'scheduled_start' => $schedule->scheduled_start?->format('d.m.Y H:i'),
            'scheduled_end' => $schedule->scheduled_end?->format('d.m.Y H:i'),
            'purpose' => $schedule->purpose,
            'status_label' => SpectechSchedule::STATUS_LABELS[$schedule->status] ?? $schedule->status,
            'initiator_name' => $initiatorName,
            'initiator_phone' => $initiatorPhone,
            'location' => implode(' / ', $locationParts),
            'address' => $request?->address ?: $schedule->address,
        ];
    }

    private function shouldRefreshStoredConflictInfo(array $conflictInfo): bool
    {
        if (empty($conflictInfo)) {
            return false;
        }

        foreach ($conflictInfo as $truckConflict) {
            if (! is_array($truckConflict)) {
                return true;
            }

            $conflicts = $truckConflict['conflicts'] ?? [];
            if (! is_array($conflicts) || empty($conflicts)) {
                return true;
            }

            foreach ($conflicts as $conflict) {
                if (! is_array($conflict)) {
                    return true;
                }

                $hasIdentifier = ! empty($conflict['request_id']) || ! empty($conflict['schedule_id']);
                $hasInitiatorFields = array_key_exists('initiator_name', $conflict)
                    && array_key_exists('initiator_phone', $conflict);

                if (! $hasIdentifier || ! $hasInitiatorFields) {
                    return true;
                }
            }
        }

        return false;
    }

    private function excludeRequestFromConflictInfo(array $conflictInfo, int $requestId): array
    {
        return array_values(array_filter(array_map(function (array $truckConflict) use ($requestId) {
            $truckConflict['conflicts'] = array_values(array_filter(
                $truckConflict['conflicts'] ?? [],
                fn ($conflict) => ! is_array($conflict) || (int) ($conflict['request_id'] ?? 0) !== $requestId,
            ));

            return empty($truckConflict['conflicts']) ? null : $truckConflict;
        }, $conflictInfo)));
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

    private function normalizeDateTime(string $value): string
    {
        return Carbon::parse($value)->toDateTimeString();
    }
}
