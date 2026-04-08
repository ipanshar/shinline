import { useEffect, useMemo, useState } from 'react';
import { Camera, Clock3, Radio, ShieldAlert, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
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

export default function DssCheckpointDesk() {
  const [connectionState, setConnectionState] = useState<string>('initialized');
  const [subscriptionState, setSubscriptionState] = useState<DssChannelSubscriptionState>('idle');
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [lastSignalAt, setLastSignalAt] = useState<string | null>(null);
  const [events, setEvents] = useState<DssUnknownVehicleDetectedEvent[]>([]);
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

  const latestEvent = useMemo(() => events[0] ?? null, [events]);
  const openImagePreview = (src: string, title: string) => setImagePreview({ open: true, src, title });
  const closeImagePreview = () => setImagePreview({ open: false, src: '', title: '' });

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Card className="gap-0 py-0">
        <CardContent className="px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-2">
            <div className="text-sm font-medium">Live-поток ТС из DSS-событий</div>
            <div className="text-sm text-muted-foreground">
              Экран не подгружает очередь и не делает snapshot-запросы. Показываются только машины, которые реально пришли в websocket-событии.
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

      <div className="grid gap-4 xl:grid-cols-4">
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
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{events.length}</div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-4 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Radio className="h-5 w-5 text-blue-600" />
              Последнее ТС из события
            </CardTitle>
            <CardDescription>На экране только фактические срабатывания websocket DSS, без фоновой подгрузки данных.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 py-4 sm:px-6">
            {!latestEvent ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                События ещё не приходили. Оставьте вкладку открытой и дождитесь alarmType 10708.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-card">
                <div className="grid gap-4 p-4 xl:grid-cols-[240px_minmax(0,1fr)]">
                  <div className="group relative overflow-hidden rounded-lg border bg-muted/30">
                    {latestEvent.capture_picture ? (
                      <button type="button" onClick={() => openImagePreview(latestEvent.capture_picture!, `ТС ${latestEvent.plate_no || latestEvent.alarm_code}`)} className="block h-full w-full cursor-zoom-in">
                        <img src={latestEvent.capture_picture} alt={latestEvent.plate_no || latestEvent.alarm_code} className="h-56 w-full object-cover transition-transform duration-300 group-hover:scale-110" />
                      </button>
                    ) : (
                      <div className="flex h-56 items-center justify-center text-muted-foreground">
                        <Camera className="h-8 w-8" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-2xl font-bold tracking-wide">{latestEvent.plate_no || 'Без номера'}</span>
                      <Badge className="bg-blue-100 text-blue-700">{latestEvent.alarm_type_name || `Тип ${latestEvent.alarm_type}`}</Badge>
                      <Badge variant="outline">capture #{latestEvent.vehicle_capture_id ?? '—'}</Badge>
                    </div>

                    <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                      <div>
                        <span className="font-medium text-foreground">Источник:</span> {latestEvent.source_name || latestEvent.source_code || '—'}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Точка:</span> {latestEvent.point_name || latestEvent.channel_name || '—'}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Время фиксации:</span> {formatDateTime(latestEvent.capture_time || latestEvent.created_at)}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">Поступило:</span> {formatRelativeSeconds(latestEvent.created_at)}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">alarmCode:</span> {latestEvent.alarm_code || '—'}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">parkingLot:</span> {latestEvent.parking_lot_name || '—'}
                      </div>
                    </div>

                    {latestEvent.plate_picture && (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Фото номера</div>
                        <button type="button" onClick={() => openImagePreview(latestEvent.plate_picture!, `Номер ${latestEvent.plate_no || latestEvent.alarm_code}`)} className="group relative block overflow-hidden rounded-lg border bg-muted/30 text-left">
                          <img src={latestEvent.plate_picture} alt={latestEvent.plate_no || latestEvent.alarm_code} className="h-28 w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-4 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock3 className="h-5 w-5 text-orange-600" />
              Последние события
            </CardTitle>
            <CardDescription>Храним только локальную ленту из websocket, максимум {MAX_EVENTS} записей.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 py-4 sm:px-6">
            {events.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Лента пока пустая.
              </div>
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <button key={event.alarm_code || event.created_at} type="button" onClick={() => event.capture_picture && openImagePreview(event.capture_picture, event.plate_no || event.alarm_code)} className="w-full rounded-lg border p-3 text-left transition hover:bg-muted/40">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold">{event.plate_no || 'Без номера'}</span>
                      <Badge variant="outline">{event.point_name || event.channel_name || 'Без точки'}</Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {formatDateTime(event.capture_time || event.created_at)}
                    </div>
                  </button>
                ))}
              </div>
            )}
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
