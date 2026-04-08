import { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Camera, Clock3, LogIn, LogOut, Radio, ShieldAlert, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  bindDssAlarmConnectionDebug,
  subscribeToDssUnknownVehicleDetected,
  type DssChannelSubscriptionState,
  type DssUnknownVehicleDetectedEvent,
} from '@/lib/dss-alarms';

const MAX_EVENTS = 20;

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatRelativeSeconds = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const minutes = Math.floor(diffSec / 60);
  const seconds = diffSec % 60;
  return minutes > 0 ? `${minutes}м ${seconds}с назад` : `${seconds}с назад`;
};

const getSubscriptionBadgeClass = (state: DssChannelSubscriptionState) => {
  if (state === 'subscribed') return 'bg-emerald-100 text-emerald-700';
  if (state === 'error') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
};

const getSubscriptionLabel = (state: DssChannelSubscriptionState) => {
  if (state === 'subscribed') return 'Private channel активен';
  if (state === 'subscribing') return 'Подписка выполняется';
  if (state === 'error') return 'Ошибка авторизации канала';
  return 'Подписка не начата';
};

const getSubscriptionErrorMessage = (error: unknown) => {
  if (!error) return 'Подписка на приватный канал DSS не выполнена.';
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    if (typeof record.message === 'string') return record.message;
    if (typeof record.error === 'string') return record.error;
    if (typeof record.type === 'string') return `Ошибка: ${record.type}`;
  }
  return 'Нет доступа к приватному каналу DSS. Проверьте авторизацию пользователя и permission integrations.dss.';
};

const getEventDirection = (event: DssUnknownVehicleDetectedEvent): 'entry' | 'exit' | 'unknown' => {
  const captureDirection = (event.capture_direction || '').toLowerCase();
  if (captureDirection.includes('entry') || captureDirection.includes('in') || captureDirection.includes('entrance')) return 'entry';
  if (captureDirection.includes('exit') || captureDirection.includes('out')) return 'exit';

  const deviceType = (event.device_type || '').toLowerCase();
  if (deviceType.includes('entry')) return 'entry';
  if (deviceType.includes('exit')) return 'exit';

  return 'unknown';
};

export default function DssCheckpointDesk() {
  const [connectionState, setConnectionState] = useState<string>('initialized');
  const [subscriptionState, setSubscriptionState] = useState<DssChannelSubscriptionState>('idle');
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [lastSignalAt, setLastSignalAt] = useState<string | null>(null);
  const [events, setEvents] = useState<DssUnknownVehicleDetectedEvent[]>([]);
  const [selectedCheckpointKey, setSelectedCheckpointKey] = useState<string>('all');
  const [imagePreview, setImagePreview] = useState<{ open: boolean; src: string; title: string }>({ open: false, src: '', title: '' });

  useEffect(() => {
    const unbindConnection = bindDssAlarmConnectionDebug((state) => setConnectionState(state));
    const unsubscribe = subscribeToDssUnknownVehicleDetected(
      (event) => {
        setLastSignalAt(new Date().toISOString());
        setEvents((current) => {
          const next = [event, ...current.filter((item) => item.alarm_code !== event.alarm_code)];
          return next.slice(0, MAX_EVENTS);
        });
      },
      {
        onSubscribing: () => {
          setSubscriptionState('subscribing');
          setSubscriptionError(null);
        },
        onSubscribed: () => {
          setSubscriptionState('subscribed');
          setSubscriptionError(null);
        },
        onError: (error) => {
          setSubscriptionState('error');
          setSubscriptionError(getSubscriptionErrorMessage(error));
        },
      },
    );

    return () => {
      unbindConnection();
      unsubscribe();
    };
  }, []);

  const checkpointOptions = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();

    for (const event of events) {
      const key = event.checkpoint_id != null ? String(event.checkpoint_id) : `unknown:${event.point_name || event.channel_name || event.device_name || 'no-checkpoint'}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: event.checkpoint_name || event.point_name || event.channel_name || event.device_name || 'Без привязки к КПП',
        });
      }
    }

    return Array.from(map.values());
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (selectedCheckpointKey === 'all') return events;

    return events.filter((event) => {
      const eventKey = event.checkpoint_id != null ? String(event.checkpoint_id) : `unknown:${event.point_name || event.channel_name || event.device_name || 'no-checkpoint'}`;
      return eventKey === selectedCheckpointKey;
    });
  }, [events, selectedCheckpointKey]);

  const entryEvents = useMemo(() => filteredEvents.filter((event) => getEventDirection(event) === 'entry'), [filteredEvents]);
  const exitEvents = useMemo(() => filteredEvents.filter((event) => getEventDirection(event) === 'exit'), [filteredEvents]);
  const latestEntryEvent = useMemo(() => entryEvents[0] ?? null, [entryEvents]);
  const latestExitEvent = useMemo(() => exitEvents[0] ?? null, [exitEvents]);
  const openImagePreview = (src: string, title: string) => setImagePreview({ open: true, src, title });
  const closeImagePreview = () => setImagePreview({ open: false, src: '', title: '' });

  const renderEventCard = (event: DssUnknownVehicleDetectedEvent | null, emptyText: string, accent: 'entry' | 'exit') => {
    if (!event) {
      return (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid gap-4 p-4 xl:grid-cols-[240px_minmax(0,1fr)]">
          <div className="group relative overflow-hidden rounded-lg border bg-muted/30">
            {event.capture_picture ? (
              <button type="button" onClick={() => openImagePreview(event.capture_picture!, `ТС ${event.plate_no || event.alarm_code}`)} className="block h-full w-full cursor-zoom-in">
                <img src={event.capture_picture} alt={event.plate_no || event.alarm_code} className="h-56 w-full object-cover transition-transform duration-300 group-hover:scale-110" />
              </button>
            ) : (
              <div className="flex h-56 items-center justify-center text-muted-foreground">
                <Camera className="h-8 w-8" />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-2xl font-bold tracking-wide">{event.plate_no || 'Без номера'}</span>
              <Badge className={accent === 'entry' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}>
                {accent === 'entry' ? 'Въезд' : 'Выезд'}
              </Badge>
              <Badge variant="outline">capture #{event.vehicle_capture_id ?? '—'}</Badge>
            </div>

            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
              <div>
                <span className="font-medium text-foreground">КПП:</span> {event.checkpoint_name || 'Без привязки'}
              </div>
              <div>
                <span className="font-medium text-foreground">Источник:</span> {event.source_name || event.source_code || '—'}
              </div>
              <div>
                <span className="font-medium text-foreground">Точка:</span> {event.point_name || event.channel_name || event.device_name || '—'}
              </div>
              <div>
                <span className="font-medium text-foreground">Время фиксации:</span> {formatDateTime(event.capture_time || event.created_at)}
              </div>
              <div>
                <span className="font-medium text-foreground">Поступило:</span> {formatRelativeSeconds(event.created_at)}
              </div>
              <div>
                <span className="font-medium text-foreground">alarmCode:</span> {event.alarm_code || '—'}
              </div>
            </div>

            {event.plate_picture && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Фото номера</div>
                <button type="button" onClick={() => openImagePreview(event.plate_picture!, `Номер ${event.plate_no || event.alarm_code}`)} className="group relative block overflow-hidden rounded-lg border bg-muted/30 text-left">
                  <img src={event.plate_picture} alt={event.plate_no || event.alarm_code} className="h-28 w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Card className="gap-0 py-0">
        <CardContent className="px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium">Live-поток ТС из DSS-событий</div>
              <div className="text-sm text-muted-foreground">
              Экран не подгружает очередь и не делает snapshot-запросы. Показываются только машины, которые реально пришли в websocket-событии.
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-muted-foreground">КПП</label>
              <select
                value={selectedCheckpointKey}
                onChange={(event) => setSelectedCheckpointKey(event.target.value)}
                className="h-10 min-w-56 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">Все КПП</option>
                {checkpointOptions.map((checkpoint) => (
                  <option key={checkpoint.key} value={checkpoint.key}>
                    {checkpoint.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {subscriptionState === 'error' && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Нет доступа к приватному каналу DSS</div>
            <div>{subscriptionError}</div>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="rounded-xl border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            <Wifi className="h-4 w-4" />
            WebSocket
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${connectionState === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
            {connectionState === 'connected' ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {connectionState}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            <ShieldCheck className="h-4 w-4" />
            Канал DSS
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${getSubscriptionBadgeClass(subscriptionState)}`}>
            {subscriptionState === 'subscribed' ? <ShieldCheck className="h-4 w-4" /> : subscriptionState === 'error' ? <ShieldAlert className="h-4 w-4" /> : <Radio className="h-4 w-4" />}
            {getSubscriptionLabel(subscriptionState)}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            <Radio className="h-4 w-4" />
            Последний сигнал DSS
          </div>
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatDateTime(lastSignalAt)}</div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            <Clock3 className="h-4 w-4" />
            Событий в ленте
          </div>
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{filteredEvents.length}</div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            <ArrowRightLeft className="h-4 w-4" />
            Въезд / Выезд
          </div>
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{entryEvents.length} / {exitEvents.length}</div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-4 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-lg">
              <LogIn className="h-5 w-5 text-emerald-600" />
              Въезд
            </CardTitle>
            <CardDescription>Последнее входящее событие по выбранному КПП.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 py-4 sm:px-6">
            {renderEventCard(latestEntryEvent, 'По выбранному КПП входящих событий пока не было.', 'entry')}
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-4 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-lg">
              <LogOut className="h-5 w-5 text-orange-600" />
              Выезд
            </CardTitle>
            <CardDescription>Последнее исходящее событие по выбранному КПП.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 py-4 sm:px-6">
            {renderEventCard(latestExitEvent, 'По выбранному КПП исходящих событий пока не было.', 'exit')}
          </CardContent>
        </Card>
      </div>

      <Dialog open={imagePreview.open} onOpenChange={(open) => !open && closeImagePreview()}>
        <DialogContent className="h-[96vh] w-[98vw] max-w-[98vw] border-0 bg-black/95 p-2 text-white [&>button]:text-white [&>button]:opacity-90 [&>button]:ring-white/30 [&>button]:hover:bg-white/10 [&>button]:hover:text-white sm:h-[98vh] sm:w-[98vw] sm:max-w-[98vw] sm:p-4" onClick={closeImagePreview}>
          <DialogHeader className="sr-only">
            <DialogTitle>{imagePreview.title}</DialogTitle>
          </DialogHeader>
          {imagePreview.src && (
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-lg" onClick={(event) => event.stopPropagation()}>
              <img src={imagePreview.src} alt={imagePreview.title} className="max-h-[92vh] w-auto max-w-full rounded-lg object-contain sm:max-h-[94vh]" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
