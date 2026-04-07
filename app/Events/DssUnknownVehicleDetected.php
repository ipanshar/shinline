<?php

namespace App\Events;

use App\Models\VehicleCapture;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class DssUnknownVehicleDetected implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public array $alarmPayload,
        public array $alarmDetail,
        public ?VehicleCapture $vehicleCapture,
        public array $processingResult = [],
    ) {
    }

    public function broadcastAs(): string
    {
        return (string) config('dss.broadcast.events.unknown_vehicle_detected', 'DssUnknownVehicleDetected');
    }

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel((string) config('dss.broadcast.channels.alarms', 'dss.alarms')),
            new Channel((string) config('dss.broadcast.channels.alarms_debug', 'dss.alarms.debug')),
        ];
    }

    public function broadcastWith(): array
    {
        return [
            'alarm_code' => (string) ($this->alarmDetail['alarmCode'] ?? $this->alarmPayload['alarmCode'] ?? ''),
            'alarm_type' => (string) ($this->alarmDetail['alarmType'] ?? $this->alarmPayload['alarmType'] ?? ''),
            'alarm_type_name' => $this->alarmPayload['alarmTypeName'] ?? null,
            'source_code' => $this->alarmPayload['sourceCode'] ?? null,
            'source_name' => $this->alarmPayload['sourceName'] ?? null,
            'plate_no' => $this->alarmDetail['plateNo'] ?? null,
            'parking_lot_name' => $this->alarmDetail['parkingLotName'] ?? null,
            'point_name' => $this->alarmDetail['pointName'] ?? null,
            'channel_id' => $this->alarmDetail['channelId'] ?? null,
            'channel_name' => $this->alarmDetail['channelName'] ?? null,
            'capture_time' => $this->vehicleCapture?->captureTime,
            'capture_picture' => $this->vehicleCapture?->capturePicture,
            'plate_picture' => $this->vehicleCapture?->plateNoPicture,
            'vehicle_capture_id' => $this->vehicleCapture?->id,
            'processed' => (int) ($this->processingResult['processed'] ?? 0),
            'duplicates_skipped' => (int) ($this->processingResult['duplicates_skipped'] ?? 0),
            'created_at' => now()->toIso8601String(),
        ];
    }
}