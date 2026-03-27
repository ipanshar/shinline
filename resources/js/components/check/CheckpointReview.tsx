import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  RefreshCw,
  Scale,
  ShieldCheck,
  Truck,
  XCircle,
  Package,
  KeyRound,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

type Checkpoint = {
  id: number;
  name: string;
  yard_id: number;
  yard_name?: string;
};

type CheckpointQueueItem = {
  visitor_id: number;
  plate_number: string;
  original_plate_number?: string | null;
  entry_date: string;
  recognition_confidence?: number | null;
  yard_id: number;
  yard_name?: string | null;
  yard_strict_mode: boolean;
  checkpoint_id: number;
  device_name?: string | null;
  matched_truck_id?: number | null;
  matched_plate_number?: string | null;
  task_id?: number | null;
  task_name?: string | null;
  has_permit: boolean;
  permit_type?: 'one_time' | 'permanent' | null;
  has_loading_task: boolean;
  loading_points_count: number;
  has_weighing_task: boolean;
  weighing_reason?: string | null;
  pending_reason?: string | null;
  pending_reason_text?: string | null;
  capture_id?: number | null;
  capture_time?: string | null;
  capture_picture_url?: string | null;
  capture_plate_picture_url?: string | null;
};

const getConfidenceBadgeClass = (confidence?: number | null) => {
  if (confidence == null) return 'bg-gray-100 text-gray-700';
  if (confidence >= 90) return 'bg-emerald-100 text-emerald-700';
  if (confidence >= 75) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
};

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

  if (minutes > 0) {
    return `${minutes}м ${seconds}с назад`;
  }

  return `${seconds}с назад`;
};

const CheckpointReview: React.FC = () => {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<number | null>(null);
  const [queue, setQueue] = useState<CheckpointQueueItem[]>([]);
  const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [processingVisitorId, setProcessingVisitorId] = useState<number | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const selectedCheckpoint = useMemo(
    () => checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) ?? null,
    [checkpoints, selectedCheckpointId],
  );

  const loadCheckpoints = useCallback(async () => {
    setLoadingCheckpoints(true);
    try {
      const response = await axios.post('/entrance-permit/getallcheckpoints', {}, {
        headers: getAuthHeaders(),
      });

      const items: Checkpoint[] = response.data?.data ?? [];
      setCheckpoints(items);

      if (!selectedCheckpointId && items.length > 0) {
        setSelectedCheckpointId(items[0].id);
      }
    } catch (error) {
      console.error('Ошибка загрузки КПП:', error);
      toast.error('Не удалось загрузить список КПП');
    } finally {
      setLoadingCheckpoints(false);
    }
  }, [selectedCheckpointId]);

  const loadQueue = useCallback(async () => {
    if (!selectedCheckpointId) {
      setQueue([]);
      return;
    }

    setLoadingQueue(true);
    try {
      const response = await axios.post('/security/checkpoint-review-queue', {
        checkpoint_id: selectedCheckpointId,
        limit: 20,
      }, {
        headers: getAuthHeaders(),
      });

      setQueue(response.data?.data ?? []);
      setLastUpdatedAt(new Date());
    } catch (error) {
      console.error('Ошибка загрузки очереди КПП:', error);
    } finally {
      setLoadingQueue(false);
    }
  }, [selectedCheckpointId]);

  useEffect(() => {
    loadCheckpoints();
  }, [loadCheckpoints]);

  useEffect(() => {
    if (!selectedCheckpointId) return;

    loadQueue();
    const interval = window.setInterval(loadQueue, 3000);

    return () => window.clearInterval(interval);
  }, [selectedCheckpointId, loadQueue]);

  const handleConfirm = async (item: CheckpointQueueItem) => {
    const userId = Number(localStorage.getItem('user_id') || '1');
    setProcessingVisitorId(item.visitor_id);

    try {
      const response = await axios.post('/security/confirmvisitor', {
        visitor_id: item.visitor_id,
        operator_user_id: userId,
        truck_id: item.matched_truck_id ?? undefined,
        task_id: item.task_id ?? undefined,
        corrected_plate_number: item.matched_plate_number || item.plate_number,
      }, {
        headers: getAuthHeaders(),
      });

      if (response.data?.status) {
        toast.success('Въезд подтверждён');
        await loadQueue();
      }
    } catch (error: any) {
      console.error('Ошибка подтверждения въезда:', error);
      toast.error(error.response?.data?.message || 'Не удалось подтвердить въезд');
    } finally {
      setProcessingVisitorId(null);
    }
  };

  const handleReject = async (item: CheckpointQueueItem) => {
    const userId = Number(localStorage.getItem('user_id') || '1');
    setProcessingVisitorId(item.visitor_id);

    try {
      const response = await axios.post('/security/rejectvisitor', {
        visitor_id: item.visitor_id,
        operator_user_id: userId,
        reason: 'Отклонено оператором КПП',
      }, {
        headers: getAuthHeaders(),
      });

      if (response.data?.status) {
        toast.success('Въезд отклонён');
        await loadQueue();
      }
    } catch (error: any) {
      console.error('Ошибка отклонения въезда:', error);
      toast.error(error.response?.data?.message || 'Не удалось отклонить въезд');
    } finally {
      setProcessingVisitorId(null);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
                Проверка на КПП
              </CardTitle>
              <CardDescription>
                Рабочее место охранника: последние 20 распознанных ТС по выбранному КПП с обновлением каждые 2 секунды.
              </CardDescription>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={selectedCheckpointId ?? ''}
                onChange={(event) => setSelectedCheckpointId(Number(event.target.value) || null)}
                className="h-10 min-w-72 rounded-md border border-input bg-background px-3 text-sm"
                disabled={loadingCheckpoints}
              >
                <option value="">Выберите КПП</option>
                {checkpoints.map((checkpoint) => (
                  <option key={checkpoint.id} value={checkpoint.id}>
                    {checkpoint.name}{checkpoint.yard_name ? ` — ${checkpoint.yard_name}` : ''}
                  </option>
                ))}
              </select>

              <Button variant="outline" onClick={loadQueue} disabled={!selectedCheckpointId || loadingQueue}>
                <RefreshCw className={`h-4 w-4 ${loadingQueue ? 'animate-spin' : ''}`} />
                Обновить
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-4 py-4 sm:px-6">
          <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {selectedCheckpoint ? `${selectedCheckpoint.name}${selectedCheckpoint.yard_name ? ` • ${selectedCheckpoint.yard_name}` : ''}` : 'КПП не выбрано'}
            </span>
            <span className="flex items-center gap-1">
              <Clock3 className="h-4 w-4" />
              Обновлено: {lastUpdatedAt ? formatDateTime(lastUpdatedAt.toISOString()) : '—'}
            </span>
            <Badge variant="outline">В очереди: {queue.length}</Badge>
          </div>

          {!selectedCheckpointId ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Выберите КПП, чтобы загрузить очередь распознанных ТС.
            </div>
          ) : loadingQueue && queue.length === 0 ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем распознанные ТС...
            </div>
          ) : queue.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Для выбранного КПП новых распознанных ТС нет.
            </div>
          ) : (
            <div className="space-y-3">
              {queue.map((item) => {
                const isProcessing = processingVisitorId === item.visitor_id;

                return (
                  <div key={item.visitor_id} className="overflow-hidden rounded-xl border bg-card">
                    <div className="grid gap-4 p-4 xl:grid-cols-[220px_minmax(0,1fr)_auto]">
                      <div className="overflow-hidden rounded-lg border bg-muted/30">
                        {item.capture_picture_url ? (
                          <img
                            src={item.capture_picture_url}
                            alt={`ТС ${item.plate_number}`}
                            className="h-40 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-40 items-center justify-center text-muted-foreground">
                            <Camera className="h-8 w-8" />
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-2xl font-bold tracking-wide">{item.plate_number}</span>
                          {item.original_plate_number && item.original_plate_number !== item.plate_number && (
                            <Badge variant="outline">OCR: {item.original_plate_number}</Badge>
                          )}
                          <Badge className={getConfidenceBadgeClass(item.recognition_confidence)}>
                            {item.recognition_confidence != null ? `${item.recognition_confidence}%` : 'Уверенность n/a'}
                          </Badge>
                        </div>

                        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
                          <div className="flex items-center gap-2">
                            <Clock3 className="h-4 w-4" />
                            <span>{formatDateTime(item.capture_time || item.entry_date)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Camera className="h-4 w-4" />
                            <span>{item.device_name || 'Камера не указана'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            <span>{item.yard_name || 'Двор не указан'}</span>
                          </div>
                        </div>

                        <div className="text-sm text-muted-foreground">
                          Последняя фиксация: <span className="font-medium text-foreground">{formatRelativeSeconds(item.capture_time || item.entry_date)}</span>
                        </div>

                        {item.pending_reason_text && (
                          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{item.pending_reason_text}</span>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <Badge variant={item.has_permit ? 'default' : 'outline'}>
                            <KeyRound className="h-3 w-3" />
                            {item.has_permit ? `Разрешение ${item.permit_type === 'one_time' ? 'разовое' : 'есть'}` : 'Без разрешения'}
                          </Badge>
                          <Badge variant={item.has_loading_task ? 'default' : 'outline'}>
                            <Package className="h-3 w-3" />
                            {item.has_loading_task ? `Погрузка: ${item.loading_points_count}` : 'Погрузки нет'}
                          </Badge>
                          <Badge variant={item.has_weighing_task ? 'default' : 'outline'}>
                            <Scale className="h-3 w-3" />
                            {item.has_weighing_task ? 'Нужно взвешивание' : 'Без взвешивания'}
                          </Badge>
                          <Badge variant={item.matched_truck_id ? 'secondary' : 'outline'}>
                            <Truck className="h-3 w-3" />
                            {item.matched_plate_number || 'ТС не сопоставлено'}
                          </Badge>
                        </div>

                        {(item.task_name || item.weighing_reason) && (
                          <div className="grid gap-2 text-sm sm:grid-cols-2">
                            <div>
                              <span className="text-muted-foreground">Задание:</span>{' '}
                              <span className="font-medium">{item.task_name || 'Не найдено'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Основание взвешивания:</span>{' '}
                              <span className="font-medium">{item.weighing_reason || '—'}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col justify-between gap-3 xl:min-w-40">
                        <div className="text-right text-xs text-muted-foreground">
                          Visitor #{item.visitor_id}
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button onClick={() => handleConfirm(item)} disabled={isProcessing} className="w-full">
                            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Впустить
                          </Button>
                          <Button variant="destructive" onClick={() => handleReject(item)} disabled={isProcessing} className="w-full">
                            <XCircle className="h-4 w-4" />
                            Отклонить
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CheckpointReview;
