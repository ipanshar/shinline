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
  capture_direction: string | null;
  checkpoint_id: number | null;
  checkpoint_name: string | null;
  device_name: string | null;
  device_type: string | null;
  processed: number;
  duplicates_skipped: number;
  created_at: string;
}

export type DssChannelSubscriptionState = 'idle' | 'subscribing' | 'subscribed' | 'error';

const alarmsChannelName = 'dss.alarms';
const unknownVehicleEventName = '.DssUnknownVehicleDetected';

export function subscribeToDssUnknownVehicleDetected(
  handler: (event: DssUnknownVehicleDetectedEvent) => void,
  options?: {
    onSubscribing?: () => void;
    onSubscribed?: () => void;
    onError?: (error: unknown) => void;
  },
) {
  const channel = echo.private(alarmsChannelName) as any;
  options?.onSubscribing?.();
  channel.listen(unknownVehicleEventName, handler);

  if (typeof channel.subscribed === 'function') {
    channel.subscribed(() => {
      options?.onSubscribed?.();
    });
  }

  if (typeof channel.error === 'function') {
    channel.error((error: unknown) => {
      options?.onError?.(error);
    });
  }

  const pusherChannel = channel.subscription;
  const subscriptionErrorHandler = (error: unknown) => {
    options?.onError?.(error);
  };

  if (pusherChannel && typeof pusherChannel.bind === 'function') {
    pusherChannel.bind('pusher:subscription_succeeded', options?.onSubscribed);
    pusherChannel.bind('pusher:subscription_error', subscriptionErrorHandler);
  }

  return () => {
    if (pusherChannel && typeof pusherChannel.unbind === 'function') {
      pusherChannel.unbind('pusher:subscription_succeeded', options?.onSubscribed);
      pusherChannel.unbind('pusher:subscription_error', subscriptionErrorHandler);
    }

    channel.stopListening(unknownVehicleEventName);
    echo.leave(`private-${alarmsChannelName}`);
  };
}

export function bindDssAlarmConnectionDebug(callback: (state: string) => void) {
  const connector = (echo as any).connector;
  const pusher = connector?.pusher;
  const connection = pusher?.connection;

  if (!connection || typeof connection.bind !== 'function') {
    callback('unavailable');
    return () => {};
  }

  const states = [
    'initialized',
    'connecting',
    'connected',
    'unavailable',
    'failed',
    'disconnected',
  ];

  const unbinders = states.map((state) => {
    const handler = () => callback(state);
    connection.bind(state, handler);

    return () => connection.unbind(state, handler);
  });

  callback(connection.state || 'initialized');

  return () => {
    unbinders.forEach((unbind) => unbind());
  };
}