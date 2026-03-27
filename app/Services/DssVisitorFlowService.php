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
        $permit = $truck ? EntryPermit::where('truck_id', $truck->id)
            ->where('yard_id', $zone->yard_id)
            ->where('status_id', '=', $activeStatusId)
            ->where(function ($query) {
                $query->whereNull('end_date')
                    ->orWhere('end_date', '>=', now()->startOfDay());
            })
            ->first() : null;

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

        if ($visitor->task_id && $completedStatus) {
            $task = Task::find($visitor->task_id);
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
                $this->closeVisitorExit($visitor, $device, $captureTime);
            } else {
                $this->createPendingExitReview($device, $zone, $truck, $plateNo, $captureTime, $captureData);
            }

            return;
        }

        if ($device->type !== 'Entry') {
            return;
        }

        if (($confirmation['auto_confirm'] ?? false) === true) {
            $this->structuredLogger->warning('unexpected_auto_confirm_blocked', [
                'plate_number' => $plateNo,
                'truck_id' => $truck?->id,
                'yard_id' => $zone->yard_id,
                'device_id' => $device->id,
            ]);
        }

        $confirmation['status'] = Visitor::CONFIRMATION_PENDING;
        $confirmation['auto_confirm'] = false;
        $autoConfirm = false;

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
            $notificationText = "<b>⚠️ Пропущенный выезд ТС</b>\n\n"
                . '<b>🏷️ ТС:</b> ' . e($plateNo) . "\n"
                . '<b>🏢 Двор:</b> ' . e($yard->name ?? 'Неизвестный') . "\n"
                . '<b>📍 КПП въезда:</b> ' . e($checkpoint->name ?? 'Неизвестный') . "\n"
                . '<b>⏰ Предыдущий въезд:</b> ' . $existingVisitor->entry_date->format('d.m.Y H:i') . "\n"
                . '<b>⏰ Новый въезд:</b> ' . (($captureTime ?? now())->format('d.m.Y H:i')) . "\n"
                . '<b>⏱️ Прошло времени:</b> ' . $minutesSinceEntry . " мин.\n\n"
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

        $this->structuredLogger->info('visitor_created', [
            'visitor_id' => $visitor->id,
            'truck_id' => $truck?->id,
            'yard_id' => $zone->yard_id,
            'device_id' => $device->id,
            'confirmation_status' => $confirmation['status'],
        ]);

        $reason = $confirmation['reason'];

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
            . '<b>📍 КПП:</b> ' . e($checkpointName) . ' - ' . $device->channelName . "\n"
            . '<b>🏢 Двор:</b> ' . e($yard->name ?? 'Неизвестный') . "\n"
            . '<b>🔒 Режим двора:</b> ' . ($isStrictMode ? '🔴 Строгий' : '🟢 Свободный') . "\n"
            . ($confidence !== null ? '<b>🎯 Уверенность:</b> ' . $confidence . "%\n" : '')
            . '<b>❓ Причина:</b> ' . $reason . "\n\n"
            . '<i>Оператору КПП необходимо подтвердить или отклонить въезд</i>'
        );
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

    private function createPendingExitReview(
        Devaice $device,
        Zone $zone,
        ?Truck $truck,
        string $plateNo,
        $captureTime,
        array $captureData = []
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

        if (!$review->note) {
            $review->note = 'Камера выезда зафиксировала ТС, но активный подтверждённый визит не найден.';
        }

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
}