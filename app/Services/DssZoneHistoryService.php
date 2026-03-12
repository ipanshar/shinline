<?php

namespace App\Services;

use App\Models\Devaice;
use App\Models\Task;
use App\Models\Truck;
use App\Models\TruckZoneHistory;
use Carbon\CarbonInterface;

class DssZoneHistoryService
{
    public const ACTION_ENTER = 'enter';
    public const ACTION_STAY = 'stay';
    public const ACTION_TRANSITION = 'transition';
    public const ACTION_EXIT = 'exit';
    public const ACTION_MISSED_EXIT = 'missed_exit';

    public function __construct(private DssStructuredLogger $structuredLogger)
    {
    }

    public function enterZone(Truck $truck, Devaice $device, ?Task $task, CarbonInterface $capturedAt): array
    {
        if (!$device->zone_id) {
            return ['success' => false, 'action' => null, 'record' => null];
        }

        $activeRecord = TruckZoneHistory::active()
            ->forTruck($truck->id)
            ->latest('entry_time')
            ->first();

        if (!$activeRecord) {
            $record = $this->createActiveRecord($truck, $device, $task, $capturedAt);
            $this->structuredLogger->info('zone_transition', [
                'action' => self::ACTION_ENTER,
                'truck_id' => $truck->id,
                'zone_id' => $device->zone_id,
                'device_id' => $device->id,
                'task_id' => $task?->id,
            ]);

            return [
                'success' => true,
                'action' => self::ACTION_ENTER,
                'record' => $record,
            ];
        }

        if ((int) $activeRecord->zone_id === (int) $device->zone_id) {
            $updates = [];
            if ((int) $activeRecord->device_id !== (int) $device->id) {
                $updates['device_id'] = $device->id;
            }
            if ($task && (int) $activeRecord->task_id !== (int) $task->id) {
                $updates['task_id'] = $task->id;
            }

            if ($updates) {
                $activeRecord->update($updates);
                $activeRecord->refresh();
            }

            return [
                'success' => true,
                'action' => self::ACTION_STAY,
                'record' => $activeRecord,
            ];
        }

        $this->closeRecord($activeRecord, $capturedAt);
        $record = $this->createActiveRecord($truck, $device, $task, $capturedAt);
        $this->structuredLogger->info('zone_transition', [
            'action' => self::ACTION_TRANSITION,
            'truck_id' => $truck->id,
            'from_zone_id' => $activeRecord->zone_id,
            'to_zone_id' => $device->zone_id,
            'device_id' => $device->id,
            'task_id' => $task?->id,
        ]);

        return [
            'success' => true,
            'action' => self::ACTION_TRANSITION,
            'closed_record' => $activeRecord->fresh(),
            'record' => $record,
        ];
    }

    public function exitTerritory(int $truckId, CarbonInterface $capturedAt, bool $missedExit = false): array
    {
        $activeRecord = TruckZoneHistory::active()
            ->forTruck($truckId)
            ->latest('entry_time')
            ->first();

        if (!$activeRecord) {
            return ['success' => false, 'action' => null, 'record' => null];
        }

        $this->closeRecord($activeRecord, $capturedAt);

        $this->structuredLogger->warning(
            $missedExit ? 'missed_exit_detected' : 'zone_transition',
            [
                'action' => $missedExit ? self::ACTION_MISSED_EXIT : self::ACTION_EXIT,
                'truck_id' => $truckId,
                'zone_id' => $activeRecord->zone_id,
                'device_id' => $activeRecord->device_id,
            ]
        );

        return [
            'success' => true,
            'action' => $missedExit ? self::ACTION_MISSED_EXIT : self::ACTION_EXIT,
            'record' => $activeRecord->fresh(),
        ];
    }

    public function getCurrentZoneForTruck(int $truckId): ?TruckZoneHistory
    {
        return TruckZoneHistory::active()
            ->forTruck($truckId)
            ->with(['zone', 'device'])
            ->latest('entry_time')
            ->first();
    }

    private function createActiveRecord(Truck $truck, Devaice $device, ?Task $task, CarbonInterface $capturedAt): TruckZoneHistory
    {
        return TruckZoneHistory::create([
            'truck_id' => $truck->id,
            'device_id' => $device->id,
            'zone_id' => $device->zone_id,
            'task_id' => $task?->id,
            'entry_time' => $capturedAt,
            'exit_time' => null,
        ]);
    }

    private function closeRecord(TruckZoneHistory $record, CarbonInterface $capturedAt): void
    {
        if ($record->exit_time) {
            return;
        }

        $exitAt = $capturedAt->lessThan($record->entry_time)
            ? $record->entry_time
            : $capturedAt;

        $record->update([
            'exit_time' => $exitAt,
        ]);
    }
}