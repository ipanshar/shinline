import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Clock3, Radio, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { subscribeToDssUnknownVehicleDetected, type DssUnknownVehicleDetectedEvent } from '@/lib/dss-alarms';

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export default function DssAlarmDebug() {
  const [events, setEvents] = useState<DssUnknownVehicleDetectedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastReceivedAt, setLastReceivedAt] = useState<string | null>(null);

  useEffect(() => {
    setConnected(true);

    const unsubscribe = subscribeToDssUnknownVehicleDetected((event) => {
      setConnected(true);
      setLastReceivedAt(new Date().toISOString());
      setEvents((current) => [event, ...current].slice(0, 50));
    });

    return () => {
      setConnected(false);
      unsubscribe();
    };
  }, []);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            <Wifi className="h-4 w-4" />
            Статус подписки
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${connected ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
            {connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {connected ? 'Слушатель запущен' : 'Нет подключения'}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            <Activity className="h-4 w-4" />
            Получено событий
          </div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{events.length}</div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            <Clock3 className="h-4 w-4" />
            Последнее событие
          </div>
          <div className="text-sm text-gray-900 dark:text-gray-100">{formatDateTime(lastReceivedAt)}</div>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between border-b px-4 py-3 dark:border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">События DSS 10708</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Временная вкладка для проверки websocket-уведомлений unknown vehicle.</p>
          </div>
          <button
            type="button"
            onClick={() => setEvents([])}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <RefreshCw className="h-4 w-4" />
            Очистить
          </button>
        </div>

        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-gray-500 dark:text-gray-400">
            <AlertTriangle className="h-8 w-8" />
            <div>
              <div className="font-medium">Событий пока нет</div>
              <div className="text-sm">Оставьте вкладку открытой и спровоцируйте alarmType 10708 в DSS.</div>
            </div>
          </div>
        ) : (
          <div className="divide-y dark:divide-gray-700">
            {events.map((event, index) => (
              <div key={`${event.alarm_code}-${event.created_at}-${index}`} className="space-y-3 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                    <Radio className="h-3.5 w-3.5" />
                    {event.alarm_type_name || 'Unknown Vehicle'}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                    {event.plate_no || 'Без номера'}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(event.created_at)}</span>
                </div>

                <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">alarmCode</div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{event.alarm_code || '—'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Источник</div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{event.source_name || event.channel_name || '—'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Камера</div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{event.point_name || event.channel_id || '—'}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Capture ID</div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">{event.vehicle_capture_id ?? '—'}</div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Машина</div>
                    {event.capture_picture ? (
                      <img
                        src={event.capture_picture}
                        alt={event.plate_no || 'vehicle'}
                        className="max-h-64 w-full rounded-lg border object-contain dark:border-gray-700"
                      />
                    ) : (
                      <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-gray-400 dark:border-gray-700">
                        Нет изображения машины
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Номер</div>
                    {event.plate_picture ? (
                      <img
                        src={event.plate_picture}
                        alt={event.plate_no || 'plate'}
                        className="max-h-64 w-full rounded-lg border object-contain dark:border-gray-700"
                      />
                    ) : (
                      <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-gray-400 dark:border-gray-700">
                        Нет изображения номера
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}