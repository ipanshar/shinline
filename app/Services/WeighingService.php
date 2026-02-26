<?php

namespace App\Services;

use App\Models\Weighing;
use App\Models\WeighingRequirement;
use App\Models\Visitor;
use App\Models\Truck;
use App\Models\Yard;
use App\Models\EntryPermit;
use App\Models\Task;

class WeighingService
{
    /**
     * Определить требуется ли взвешивание при въезде
     * 
     * Приоритеты:
     * 1. Разрешение с явным указанием (weighing_required = true/false) - высший приоритет
     * 2. Задание с флагом weighing
     * 3. Политика двора (weighing_required)
     * 4. Флаг на конкретном ТС
     * 5. Категория ТС
     * 
     * @param Visitor $visitor
     * @return array|null ['required_type' => 'both', 'reason' => 'yard_policy']
     */
    public function determineWeighingRequirement(Visitor $visitor): ?array
    {
        $yard = $visitor->yard;
        $truck = $visitor->truck;
        $permit = $visitor->getActivePermit();
        $task = $visitor->task;

        // 1. Разрешение имеет высший приоритет (явное указание администратора)
        if ($permit && $permit->weighing_required === true) {
            return [
                'required_type' => 'both',
                'reason' => WeighingRequirement::REASON_PERMIT,
            ];
        }
        
        // 1.1 Если в разрешении явно указано "не требуется" - освобождаем от взвешивания
        if ($permit && $permit->weighing_required === false) {
            return null;
        }

        // 2. Проверяем задание (если есть флаг weighing)
        if ($task && isset($task->weighing) && $task->weighing) {
            return [
                'required_type' => 'both',
                'reason' => WeighingRequirement::REASON_TASK,
            ];
        }

        // 3. Проверяем политику двора
        if ($yard && $yard->weighing_required === true) {
            return [
                'required_type' => 'both',
                'reason' => WeighingRequirement::REASON_YARD_POLICY,
            ];
        }

        // 4. Проверяем флаг на конкретном ТС
        if ($truck && $truck->weighing_required === true) {
            return [
                'required_type' => 'both',
                'reason' => WeighingRequirement::REASON_TRUCK_FLAG,
            ];
        }

        // 5. Проверяем категорию ТС (если флаг на ТС не установлен явно)
        if ($truck && $truck->weighing_required === null) {
            $category = $truck->truckCategory;
            if ($category && $category->weighing_required) {
                return [
                    'required_type' => 'both',
                    'reason' => WeighingRequirement::REASON_TRUCK_CATEGORY,
                ];
            }
        }

        // Взвешивание не требуется
        return null;
    }

    /**
     * Создать требование на взвешивание для посетителя
     */
    public function createRequirement(Visitor $visitor): ?WeighingRequirement
    {
        $requirement = $this->determineWeighingRequirement($visitor);

        if (!$requirement) {
            return null;
        }

        return WeighingRequirement::create([
            'yard_id' => $visitor->yard_id,
            'visitor_id' => $visitor->id,
            'truck_id' => $visitor->truck_id,
            'task_id' => $visitor->task_id,
            'plate_number' => $visitor->plate_number,
            'required_type' => $requirement['required_type'],
            'reason' => $requirement['reason'],
            'status' => WeighingRequirement::STATUS_PENDING,
        ]);
    }

    /**
     * Создать требование вручную (оператором)
     */
    public function createManualRequirement(
        int $yardId,
        int $visitorId,
        string $plateNumber,
        ?int $truckId = null,
        ?int $taskId = null,
        string $requiredType = 'both'
    ): WeighingRequirement {
        return WeighingRequirement::create([
            'yard_id' => $yardId,
            'visitor_id' => $visitorId,
            'truck_id' => $truckId,
            'task_id' => $taskId,
            'plate_number' => $plateNumber,
            'required_type' => $requiredType,
            'reason' => WeighingRequirement::REASON_MANUAL,
            'status' => WeighingRequirement::STATUS_PENDING,
        ]);
    }

    /**
     * Записать взвешивание
     */
    public function recordWeighing(
        int $yardId,
        string $plateNumber,
        string $weighingType,
        float $weight,
        ?int $visitorId = null,
        ?int $truckId = null,
        ?int $taskId = null,
        ?int $requirementId = null,
        ?int $operatorUserId = null,
        ?string $notes = null
    ): Weighing {
        $weighing = Weighing::create([
            'yard_id' => $yardId,
            'plate_number' => $plateNumber,
            'weighing_type' => $weighingType,
            'weight' => $weight,
            'weighed_at' => now(),
            'visitor_id' => $visitorId,
            'truck_id' => $truckId,
            'task_id' => $taskId,
            'requirement_id' => $requirementId,
            'operator_user_id' => $operatorUserId,
            'notes' => $notes,
        ]);

        // Если есть связанное требование, обновляем его
        if ($requirementId) {
            $requirement = WeighingRequirement::find($requirementId);
            if ($requirement) {
                if ($weighingType === Weighing::TYPE_ENTRY) {
                    $requirement->recordEntryWeighing($weighing);
                } elseif ($weighingType === Weighing::TYPE_EXIT) {
                    $requirement->recordExitWeighing($weighing);
                }
            }
        }

        return $weighing;
    }

    /**
     * Получить ожидающие взвешивания по двору
     */
    public function getPendingByYard(int $yardId): \Illuminate\Database\Eloquent\Collection
    {
        return WeighingRequirement::with(['visitor', 'truck', 'task', 'entryWeighing'])
            ->byYard($yardId)
            ->whereIn('status', [
                WeighingRequirement::STATUS_PENDING,
                WeighingRequirement::STATUS_ENTRY_DONE
            ])
            ->orderBy('created_at', 'asc')
            ->get();
    }

    /**
     * Получить взвешивания за сегодня по двору
     */
    public function getTodayByYard(int $yardId): \Illuminate\Database\Eloquent\Collection
    {
        return Weighing::with(['visitor', 'truck', 'operator'])
            ->byYard($yardId)
            ->today()
            ->orderBy('weighed_at', 'desc')
            ->get();
    }

    /**
     * Получить историю взвешиваний по двору за период
     */
    public function getHistoryByYard(int $yardId, ?string $dateFrom = null, ?string $dateTo = null): \Illuminate\Database\Eloquent\Collection
    {
        $query = Weighing::with(['visitor', 'truck', 'operator'])
            ->byYard($yardId)
            ->orderBy('weighed_at', 'desc');

        if ($dateFrom) {
            $query->whereDate('weighed_at', '>=', $dateFrom);
        }

        if ($dateTo) {
            $query->whereDate('weighed_at', '<=', $dateTo);
        }

        return $query->get();
    }

    /**
     * Получить историю взвешиваний ТС
     */
    public function getTruckHistory(int $truckId, ?string $dateFrom = null, ?string $dateTo = null): \Illuminate\Database\Eloquent\Collection
    {
        $query = Weighing::with(['yard', 'visitor', 'operator'])
            ->byTruck($truckId)
            ->orderBy('weighed_at', 'desc');

        if ($dateFrom) {
            $query->whereDate('weighed_at', '>=', $dateFrom);
        }

        if ($dateTo) {
            $query->whereDate('weighed_at', '<=', $dateTo);
        }

        return $query->get();
    }

    /**
     * Получить статистику взвешиваний по двору за период
     */
    public function getStatistics(int $yardId, string $dateFrom, string $dateTo): array
    {
        $weighings = Weighing::byYard($yardId)
            ->whereDate('weighed_at', '>=', $dateFrom)
            ->whereDate('weighed_at', '<=', $dateTo)
            ->get();

        $entryWeighings = $weighings->where('weighing_type', Weighing::TYPE_ENTRY);
        $exitWeighings = $weighings->where('weighing_type', Weighing::TYPE_EXIT);

        return [
            'total_count' => $weighings->count(),
            'entry_count' => $entryWeighings->count(),
            'exit_count' => $exitWeighings->count(),
            'total_entry_weight' => $entryWeighings->sum('weight'),
            'total_exit_weight' => $exitWeighings->sum('weight'),
            'avg_entry_weight' => $entryWeighings->avg('weight'),
            'avg_exit_weight' => $exitWeighings->avg('weight'),
        ];
    }

    /**
     * Пропустить взвешивание
     */
    public function skipRequirement(int $requirementId, int $userId, string $reason): WeighingRequirement
    {
        $requirement = WeighingRequirement::findOrFail($requirementId);
        $requirement->skip($userId, $reason);
        return $requirement;
    }

    /**
     * Найти или создать требование для visitor при выезде
     */
    public function findOrCreateExitRequirement(Visitor $visitor): ?WeighingRequirement
    {
        // Ищем существующее требование
        $requirement = WeighingRequirement::where('visitor_id', $visitor->id)
            ->whereIn('status', [
                WeighingRequirement::STATUS_PENDING,
                WeighingRequirement::STATUS_ENTRY_DONE
            ])
            ->first();

        return $requirement;
    }
}
