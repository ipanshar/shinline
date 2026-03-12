<?php

namespace App\Services;

use App\Models\Checkpoint;
use App\Models\Devaice;
use App\Models\EntryPermit;
use App\Models\Status;
use App\Models\Task;
use App\Models\Truck;
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

        $activeStatus = Status::where('key', 'active')->first();
        $permit = $truck ? EntryPermit::where('truck_id', $truck->id)
            ->where('yard_id', $zone->yard_id)
            ->where('status_id', '=', $activeStatus?->id ?? 0)
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
        $leftTerritoryStatus = Status::where('key', 'left_territory')->first();
        $inactiveStatus = Status::where('key', 'not_active')->first();
        $completedStatus = Status::where('key', 'completed')->first() ?: $leftTerritoryStatus;

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
            $activeStatus = Status::where('key', 'active')->first();
            $oneTimePermits = EntryPermit::where('truck_id', $visitor->truck_id)
                ->where('yard_id', $visitor->yard_id)
                ->where('one_permission', true)
                ->where('status_id', $activeStatus?->id ?? 0)
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
        $statusRow = Status::where('key', 'on_territory')->first();
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
            }

            return;
        }

        if ($device->type !== 'Entry') {
            return;
        }

        $autoConfirm = $confirmation['auto_confirm'];

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

        if ($autoConfirm) {
            if ($task) {
                $task->status_id = $statusRow->id;
                $task->begin_date = now();
                $task->yard_id = $zone->yard_id;
                $task->save();
            }

            $warehouse = $task ? DB::table('task_loadings')
                ->leftJoin('warehouses', 'task_loadings.warehouse_id', '=', 'warehouses.id')
                ->where('task_loadings.task_id', $task->id)
                ->where('warehouses.yard_id', $zone->yard_id)
                ->select('warehouses.name as name')
                ->get() : collect();

            if ($task && $truck) {
                $checkpointName = Checkpoint::where('id', $device->checkpoint_id)->value('name');
                $notificationText = '<b>🚛 Въезд на территорию ' . e($yard->name ?? 'Неизвестный двор') . "</b>\n\n"
                    . '<b>🏷️ ТС:</b> ' . e($truck->plate_number) . "\n"
                    . '<b>📦 Задание:</b> ' . e($task->name) . "\n"
                    . '<b>📝 Описание:</b> ' . e($task->description) . "\n"
                    . '<b>👤 Водитель:</b> ' . ($task->user_id
                        ? e(DB::table('users')->where('id', $task->user_id)->value('name'))
                        . ' (' . e(DB::table('users')->where('id', $task->user_id)->value('phone')) . ')'
                        : 'Не указан') . "\n"
                    . '<b>✍️ Автор:</b> ' . e($task->avtor) . "\n"
                    . '<b>🏬 Склады:</b> ' . e($warehouse->pluck('name')->implode(', ')) . "\n"
                    . '<b>🛂 Разрешение:</b> <i>' . e($permitText) . '</i>' . "\n"
                    . '<b>🔒 Режим двора:</b> ' . ($isStrictMode ? '🔴 Строгий' : '🟢 Свободный') . "\n"
                    . '<b>📍 КПП:</b> ' . e($checkpointName) . ' - ' . $device->channelName;

                $this->notificationService->send($notificationText);
            }

            return;
        }

        $reason = $confirmation['reason'];

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
}