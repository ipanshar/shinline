import echo from '@/lib/echo';

export interface DssUnknownVehicleDetectedEvent {
  alarm_code: string;
  alarm_type: string;
  alarm_type_name: string | null;
  source_code: string | null;
  source_name: string | null;
  plate_no: string | null;
  parking_lot_name: string | null;
  point_name: string | null;
  channel_id: string | null;
  channel_name: string | null;
  capture_time: string | null;
  capture_picture: string | null;
  plate_picture: string | null;
  vehicle_capture_id: number | null;
  processed: number;
  duplicates_skipped: number;
  created_at: string;
}

const alarmsChannelName = 'dss.alarms';
const unknownVehicleEventName = '.DssUnknownVehicleDetected';

export function subscribeToDssUnknownVehicleDetected(
  handler: (event: DssUnknownVehicleDetectedEvent) => void,
) {
  const channel = echo.private(alarmsChannelName);
  channel.listen(unknownVehicleEventName, handler);

  return () => {
    channel.stopListening(unknownVehicleEventName);
    echo.leave(`private-${alarmsChannelName}`);
  };
}