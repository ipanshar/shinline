<?php

namespace App\Services;

use App\Models\Checkpoint;
use App\Models\CheckpointExitReview;
use App\Models\Devaice;
use App\Models\EntryPermit;
use App\Models\Status;
use App\Models\Task;
use App\Models\Truck;
use App\Models\VehicleCapture;
use App\Models\Visitor;
use App\Models\Yard;
use App\Models\Zone;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class DssVisitorFlowService
{
    public function __construct(
        private DssNotificationService $notificationService,
        private DssVisitorConfirmationService $confirmationService,
        private DssZoneHistoryService $zoneHistoryService,
        private DssStatusCacheService $statusCache,
        private DssStructuredLogger $structuredLogger,
        private WeighingService $weighingService,
        private DssPermitVehicleService $permitVehicleService,
    )
    {
    }

    public function handleCapture(Devaice $device, ?Truck $truck, array $captureData): void
    {
        if (!$device->zone_id) {
            return;
        }

        $zone = Zone::find($device->zone_id);
        if (!$zone) {
            return;
        }

        $activeStatusId = $this->statusCache->getId('active') ?? 0;
        $permit = $truck ? $this->findActivePermit($truck->id, $zone->yard_id, $activeStatusId) : null;

        $task = $permit ? Task::find($permit->task_id) : null;
        $captureTime = now();

        if (!empty($captureData['captureTime'])) {
            $captureTime = \Carbon\Carbon::createFromTimestamp($captureData['captureTime'])
                ->setTimezone(config('app.timezone'));
        }

        if ($device->checkpoint_id > 0) {
            $this->createOrUpdateVisitor($device, $truck, $zone, $permit, $task, $captureTime, $captureData);
        }
    }

    public function closeVisitorExit(Visitor $visitor, ?Devaice $device = null, $exitTime = null, bool $missedExit = false): void
    {
        $leftTerritoryStatus = $this->statusCache->get('left_territory');
        $inactiveStatus = $this->statusCache->get('not_active');
        $completedStatus = $this->statusCache->get('completed') ?: $leftTerritoryStatus;

        if (!$leftTerritoryStatus) {
            return;
        }

        $visitor->exit_device_id = $device?->id;
        $visitor->exit_date = $exitTime ?? now();
        $visitor->status_id = $leftTerritoryStatus->id;

        if ($missedExit) {
            $visitor->comment = ($visitor->comment ? $visitor->comment . "\n" : '')
                . '[AUTO] Выезд не зафиксирован камерой. Закрыт автоматически при повторном въезде ' . now()->format('d.m.Y H:i');
        }

        $visitor->save();

        if ($visitor->truck_id) {
            $this->zoneHistoryService->exitTerritory(
                $visitor->truck_id,
                $exitTime ?? now(),
                $missedExit,
            );
        }

        if ($completedStatus) {
            $task = $this->resolveTaskForVisitor($visitor);
            if ($task) {
                $task->status_id = $completedStatus->id;
                $task->end_date = $exitTime ?? now();
                $task->save();
            }
        }

        if ($visitor->entry_permit_id && $inactiveStatus) {
            $permit = EntryPermit::find($visitor->entry_permit_id);
            if ($permit && $permit->one_permission) {
                $permit->status_id = $inactiveStatus->id;
                $permit->end_date = $exitTime ?? now();
                $permit->save();

                $this->permitVehicleService->revokePermitVehicleSafely($permit->fresh());
            }
        }

        if ($visitor->truck_id && $inactiveStatus) {
            $activeStatusId = $this->statusCache->getId('active') ?? 0;
            $oneTimePermits = EntryPermit::where('truck_id', $visitor->truck_id)
                ->where('yard_id', $visitor->yard_id)
                ->where('one_permission', true)
                ->where('status_id', $activeStatusId)
                ->get();

            foreach ($oneTimePermits as $oneTimePermit) {
                $oneTimePermit->status_id = $inactiveStatus->id;
                $oneTimePermit->end_date = $exitTime ?? now();
                $oneTimePermit->save();

                if ((int) $oneTimePermit->id !== (int) $visitor->entry_permit_id) {
                    $this->permitVehicleService->revokePermitVehicleSafely($oneTimePermit->fresh());
                }
            }
        }
    }

    private function createOrUpdateVisitor(
        Devaice $device,
        ?Truck $truck,
        Zone $zone,
        ?EntryPermit $permit = null,
        ?Task $task = null,
        $captureTime = null,
        array $captureData = []
    ): void {
        $statusRow = $this->statusCache->get('on_territory');
        if (!$statusRow) {
            return;
        }

        $permitText = $permit ? ($permit->one_permission ? 'Одноразовое' : 'Многоразовое') : 'Нет разрешения';
        $plateNo = $captureData['plateNo'] ?? ($truck ? $truck->plate_number : 'UNKNOWN');
        $confidence = $captureData['confidence'] ?? null;
        $truckWasFound = $captureData['truck_was_found'] ?? ($truck !== null);

        $yard = Yard::find($zone->yard_id);
        $confirmation = $this->confirmationService->resolve($yard, $truck, $permit);
        $isStrictMode = $confirmation['strict_mode'];
        $permitText = $this->formatPermitNotificationText($permit);

        if ($device->type === 'Exit') {
            $visitorQuery = Visitor::query()
                ->where('yard_id', $zone->yard_id)
                ->whereNull('exit_device_id')
                ->whereNull('exit_date')
                ->where('confirmation_status', Visitor::CONFIRMATION_CONFIRMED);

            if ($truck) {
                $visitorQuery->where('truck_id', $truck->id);
            } else {
                $visitorQuery->where('plate_number', $plateNo);
            }

            $visitor = $visitorQuery->orderBy('id', 'desc')->first();
            if ($visitor) {
                $blockingRequirement = $this->weighingService->getBlockingExitRequirementForVisitor($visitor);

                if ($blockingRequirement) {
                    $this->createPendingExitReview(
                        $device,
                        $zone,
                        $truck,
                        $plateNo,
                        $captureTime,
                        $captureData,
                        'Камера выезда зафиксировала ТС, но для визита не завершено обязательное выездное взвешивание.'
                    );

                    return;
                }

                $this->closeVisitorExit($visitor, $device, $captureTime);
                $this->createConfirmedExitReview($visitor, $device, $zone, $plateNo, $captureTime, $captureData);
            } else {
                $this->createPendingExitReview($device, $zone, $truck, $plateNo, $captureTime, $captureData);
            }

            return;
        }

        if ($device->type !== 'Entry') {
            return;
        }

        $autoConfirm = (bool) ($confirmation['auto_confirm'] ?? false);

        $recentPendingVisitor = $this->findRecentPendingVisitor($device, $zone->yard_id, $truck, $plateNo, $captureTime);
        if ($recentPendingVisitor) {
            if ($confidence !== null && ($recentPendingVisitor->recognition_confidence === null || $confidence > $recentPendingVisitor->recognition_confidence)) {
                $recentPendingVisitor->recognition_confidence = $confidence;
                $recentPendingVisitor->save();
            }

            return;
        }

        $existingVisitor = $truck ? Visitor::where('yard_id', $zone->yard_id)
            ->where('truck_id', $truck->id)
            ->whereNull('exit_date')
            ->where('confirmation_status', Visitor::CONFIRMATION_CONFIRMED)
            ->first() : null;

        if ($existingVisitor) {
            $entryTime = $existingVisitor->entry_date;
            $currentTime = $captureTime ?? now();
            $minutesSinceEntry = $entryTime->diffInMinutes($currentTime);
            $minIntervalMinutes = 10;

            if ($minutesSinceEntry < $minIntervalMinutes) {
                Log::debug('DSS: Повторная фиксация ТС камерой (игнорируем)', [
                    'plate_number' => $plateNo,
                    'truck_id' => $truck->id,
                    'minutes_since_entry' => $minutesSinceEntry,
                    'min_interval' => $minIntervalMinutes,
                ]);

                return;
            }

            Log::warning('DSS: Повторный въезд ТС - выезд не был зафиксирован камерой', [
                'plate_number' => $plateNo,
                'truck_id' => $truck->id,
                'yard_id' => $zone->yard_id,
                'previous_entry_date' => $existingVisitor->entry_date,
                'new_entry_time' => $captureTime,
                'minutes_since_entry' => $minutesSinceEntry,
                'device_id' => $device->id,
                'device_name' => $device->channelName ?? 'Unknown',
            ]);

            $this->structuredLogger->warning('missed_exit_detected', [
                'plate_number' => $plateNo,
                'truck_id' => $truck->id,
                'yard_id' => $zone->yard_id,
                'device_id' => $device->id,
                'minutes_since_entry' => $minutesSinceEntry,
            ]);

            $this->closeVisitorExit($existingVisitor, null, $captureTime, true);

            $checkpoint = Checkpoint::find($device->checkpoint_id);
            $elapsedTimeText = $this->formatDurationHumanReadable($existingVisitor->entry_date, $captureTime ?? now());
            $notificationText = "<b>⚠️ Пропущенный выезд ТС</b>\n\n"
                . '<b>🏷️ ТС:</b> ' . e($plateNo) . "\n"
                . '<b>🎫 Разрешение:</b> ' . $permitText . "\n"
                . '<b>🏢 Двор:</b> ' . e($yard->name ?? 'Неизвестный') . "\n"
                . '<b>📍 КПП въезда:</b> ' . e($checkpoint->name ?? 'Неизвестный') . "\n"
                . '<b>⏰ Предыдущий въезд:</b> ' . $existingVisitor->entry_date->format('d.m.Y H:i') . "\n"
                . '<b>⏰ Новый въезд:</b> ' . (($captureTime ?? now())->format('d.m.Y H:i')) . "\n"
                . '<b>⏱️ Прошло времени:</b> ' . $elapsedTimeText . "\n\n"
                . '<i>Камера выезда не зафиксировала выезд. Предыдущий визит автоматически закрыт.</i>';

            $this->notificationService->send($notificationText);
        }

        $visitor = Visitor::create([
            'yard_id' => $zone->yard_id,
            'truck_id' => $truck?->id,
            'plate_number' => $plateNo,
            'original_plate_number' => $plateNo,
            'task_id' => $task?->id,
            'entrance_device_id' => $device->id,
            'entry_permit_id' => $permit?->id,
            'entry_date' => $captureTime ?? now(),
            'status_id' => $statusRow->id,
            'confirmation_status' => $confirmation['status'],
            'confirmed_at' => $autoConfirm ? now() : null,
            'recognition_confidence' => $confidence,
            'truck_category_id' => $truck?->truck_category_id,
            'truck_brand_id' => $truck?->truck_brand_id,
        ]);

        if ($autoConfirm) {
            $visitor->load(['yard', 'truck', 'task']);
            $this->processConfirmedVisitorEntry($visitor, $task, $zone->yard_id);
            $this->weighingService->createRequirement($visitor);
        }

        $this->structuredLogger->info('visitor_created', [
            'visitor_id' => $visitor->id,
            'truck_id' => $truck?->id,
            'yard_id' => $zone->yard_id,
            'device_id' => $device->id,
            'confirmation_status' => $confirmation['status'],
        ]);

        $reason = $confirmation['reason'];

        if (!$autoConfirm) {
            $this->structuredLogger->warning('visitor_pending', [
                'visitor_id' => $visitor->id,
                'truck_id' => $truck?->id,
                'yard_id' => $zone->yard_id,
                'device_id' => $device->id,
                'reason' => $reason,
            ]);

            $checkpointName = Checkpoint::where('id', $device->checkpoint_id)->value('name');
            $this->notificationService->send(
                '<b>⚠️ Требуется подтверждение въезда</b>' . "\n\n"
                . '<b>🏷️ Распознанный номер:</b> ' . e($plateNo) . "\n"
                . '<b>🎫 Разрешение:</b> ' . $permitText . "\n"
                . '<b>📍 КПП:</b> ' . e($checkpointName) . ' - ' . $device->channelName . "\n"
                . '<b>🏢 Двор:</b> ' . e($yard->name ?? 'Неизвестный') . "\n"
                . '<b>🔒 Режим двора:</b> ' . ($isStrictMode ? '🔴 Строгий' : '🟢 Свободный') . "\n"
                . ($confidence !== null ? '<b>🎯 Уверенность:</b> ' . $confidence . "%\n" : '')
                . '<b>❓ Причина:</b> ' . $reason . "\n\n"
                . '<i>Оператору КПП необходимо подтвердить или отклонить въезд</i>'
            );
        }
    }

    private function formatPermitNotificationText(?EntryPermit $permit): string
    {
        if (!$permit) {
            return 'Нет активного разрешения';
        }

        return $permit->one_permission ? 'Есть активное разовое разрешение' : 'Есть активное постоянное разрешение';
    }

    private function findRecentPendingVisitor(
        Devaice $device,
        int $yardId,
        ?Truck $truck,
        string $plateNo,
        $captureTime = null
    ): ?Visitor {
        $captureMoment = $captureTime ?? now();
        $normalizedPlate = $this->normalizePlate($plateNo);

        $query = Visitor::query()
            ->where('yard_id', $yardId)
            ->where('entrance_device_id', $device->id)
            ->where('confirmation_status', Visitor::CONFIRMATION_PENDING)
            ->whereNull('exit_date')
            ->where('entry_date', '>=', $captureMoment->copy()->subMinutes(2));

        if ($truck) {
            $query->where('truck_id', $truck->id);
        } else {
            $query->whereRaw(
                "REPLACE(REPLACE(LOWER(plate_number), ' ', ''), '-', '') = ?",
                [$normalizedPlate]
            );
        }

        return $query->orderByDesc('id')->first();
    }

    private function normalizePlate(string $plateNumber): string
    {
        return strtolower(str_replace([' ', '-'], '', $plateNumber));
    }

    private function findActivePermit(int $truckId, int $yardId, int $activeStatusId): ?EntryPermit
    {
        return EntryPermit::query()
            ->where('truck_id', $truckId)
            ->where('yard_id', $yardId)
            ->where('status_id', $activeStatusId)
            ->where(function ($query) {
                $query->whereNull('end_date')
                    ->orWhere('end_date', '>=', now()->startOfDay());
            })
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->first();
    }

    private function processConfirmedVisitorEntry(Visitor $visitor, ?Task $task, int $yardId): void
    {
        $task ??= $this->resolveTaskForVisitor($visitor);
        $statusOnTerritory = $this->statusCache->get('on_territory');

        if (!$task || !$statusOnTerritory) {
            return;
        }

        $task->begin_date = $visitor->entry_date ?? now();
        $task->yard_id = $yardId;
        $task->status_id = $statusOnTerritory->id;
        $task->save();
    }

    private function resolveTaskForVisitor(Visitor $visitor): ?Task
    {
        if ($visitor->task_id) {
            return Task::find($visitor->task_id);
        }

        if ($visitor->entry_permit_id) {
            $permit = EntryPermit::find($visitor->entry_permit_id);
            if ($permit?->task_id) {
                return Task::find($permit->task_id);
            }
        }

        return null;
    }

    private function formatDurationHumanReadable($from, $to): string
    {
        $fromTime = $from instanceof \Carbon\CarbonInterface ? $from->copy() : \Carbon\Carbon::parse($from);
        $toTime = $to instanceof \Carbon\CarbonInterface ? $to->copy() : \Carbon\Carbon::parse($to);

        $totalSeconds = abs($fromTime->diffInSeconds($toTime));

        if ($totalSeconds < 60) {
            return $this->formatDurationPart($totalSeconds, 'секунда', 'секунды', 'секунд');
        }

        $units = [
            ['seconds' => 31536000, 'forms' => ['год', 'года', 'лет']],
            ['seconds' => 2592000, 'forms' => ['месяц', 'месяца', 'месяцев']],
            ['seconds' => 86400, 'forms' => ['день', 'дня', 'дней']],
            ['seconds' => 3600, 'forms' => ['час', 'часа', 'часов']],
            ['seconds' => 60, 'forms' => ['минута', 'минуты', 'минут']],
            ['seconds' => 1, 'forms' => ['секунда', 'секунды', 'секунд']],
        ];

        $parts = [];

        foreach ($units as $unit) {
            if ($totalSeconds < $unit['seconds']) {
                continue;
            }

            $value = intdiv($totalSeconds, $unit['seconds']);
            $totalSeconds %= $unit['seconds'];

            $parts[] = $this->formatDurationPart($value, ...$unit['forms']);

            if (count($parts) >= 3) {
                break;
            }
        }

        return implode(' ', $parts);
    }

    private function formatDurationPart(int $value, string $one, string $few, string $many): string
    {
        $mod100 = $value % 100;
        $mod10 = $value % 10;

        if ($mod100 >= 11 && $mod100 <= 14) {
            $word = $many;
        } elseif ($mod10 === 1) {
            $word = $one;
        } elseif ($mod10 >= 2 && $mod10 <= 4) {
            $word = $few;
        } else {
            $word = $many;
        }

        return $value . ' ' . $word;
    }

    private function createPendingExitReview(
        Devaice $device,
        Zone $zone,
        ?Truck $truck,
        string $plateNo,
        $captureTime,
        array $captureData = [],
        ?string $note = null
    ): void {
        if (!$device->checkpoint_id) {
            return;
        }

        $normalizedPlate = $this->normalizePlate($plateNo);
        $review = CheckpointExitReview::query()
            ->where('checkpoint_id', $device->checkpoint_id)
            ->where('status', 'pending')
            ->where('normalized_plate', $normalizedPlate)
            ->where('capture_time', '>=', ($captureTime ?? now())->copy()->subMinutes(2))
            ->orderByDesc('id')
            ->first();

        if (!$review) {
            $review = new CheckpointExitReview();
        }

        $review->vehicle_capture_id = $captureData['vehicle_capture_id'] ?? $review->vehicle_capture_id;
        $review->device_id = $device->id;
        $review->checkpoint_id = $device->checkpoint_id;
        $review->yard_id = $zone->yard_id;
        $review->truck_id = $truck?->id;
        $review->plate_number = $plateNo;
        $review->normalized_plate = $normalizedPlate;
        $review->recognition_confidence = $captureData['confidence'] ?? $review->recognition_confidence;
        $review->capture_time = $captureTime ?? now();
        $review->status = 'pending';

        $review->note = $note ?: $review->note ?: 'Камера выезда зафиксировала ТС, но активный подтверждённый визит не найден.';

        $review->save();

        $this->structuredLogger->warning('exit_review_created', [
            'checkpoint_id' => $device->checkpoint_id,
            'device_id' => $device->id,
            'yard_id' => $zone->yard_id,
            'plate_number' => $plateNo,
            'truck_id' => $truck?->id,
            'capture_time' => $captureTime?->toDateTimeString(),
            'vehicle_capture_id' => $captureData['vehicle_capture_id'] ?? null,
        ]);
    }

    private function createConfirmedExitReview(
        Visitor $visitor,
        Devaice $device,
        Zone $zone,
        string $plateNo,
        $captureTime,
        array $captureData = []
    ): void {
        if (!$device->checkpoint_id) {
            return;
        }

        $normalizedPlate = $this->normalizePlate($plateNo);
        $review = new CheckpointExitReview();
        $review->vehicle_capture_id = $captureData['vehicle_capture_id'] ?? null;
        $review->device_id = $device->id;
        $review->checkpoint_id = $device->checkpoint_id;
        $review->yard_id = $zone->yard_id;
        $review->truck_id = $visitor->truck_id;
        $review->plate_number = $plateNo;
        $review->normalized_plate = $normalizedPlate;
        $review->recognition_confidence = $captureData['confidence'] ?? null;
        $review->capture_time = $captureTime ?? now();
        $review->status = 'confirmed';
        $review->note = 'Выезд подтверждён автоматически: активный визит найден и закрыт без участия оператора.';
        $review->resolved_at = $captureTime ?? now();
        $review->resolved_visitor_id = $visitor->id;
        $review->save();
    }
}