import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import CheckpointExitReview from '@/components/check/CheckpointExitReview';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  LogOut,
  Plus,
  RefreshCw,
  Scale,
  ShieldCheck,
  Search,
  Truck,
  XCircle,
  Package,
  KeyRound,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

type SimilarPlate = {
  truck_id: number;
  plate_number: string;
  truck_model_name?: string;
  has_permit: boolean;
  permit_id?: number;
  task_id?: number;
  task_name?: string;
  similarity_percent: number;
};

type ExpectedTask = {
  id: number;
  name: string;
  description?: string;
  plan_date?: string;
  truck_id?: number;
  plate_number?: string;
  driver_name?: string;
  driver_phone?: string;
};

type ManualTruckSearchResult = {
  id: number;
  plate_number: string;
  truck_model_name?: string;
  truck_brand_name?: string;
  truck_category_name?: string;
  has_permit?: boolean;
  permit_type?: 'one_time' | 'permanent' | null;
  task_name?: string;
  driver_name?: string;
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
  const [reviewMode, setReviewMode] = useState<'entry' | 'exit'>('entry');
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<number | null>(null);
  const [exitQueueCount, setExitQueueCount] = useState(0);
  const [showExitSuggestion, setShowExitSuggestion] = useState(false);
  const [queue, setQueue] = useState<CheckpointQueueItem[]>([]);
  const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [processingVisitorId, setProcessingVisitorId] = useState<number | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    item: CheckpointQueueItem | null;
    correctedPlate: string;
    selectedTruckId: number | null;
    selectedTaskId: number | null;
  }>({
    open: false,
    item: null,
    correctedPlate: '',
    selectedTruckId: null,
    selectedTaskId: null,
  });
  const [searchResults, setSearchResults] = useState<SimilarPlate[]>([]);
  const [expectedTasks, setExpectedTasks] = useState<ExpectedTask[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingExpectedTasks, setLoadingExpectedTasks] = useState(false);
  const [imagePreview, setImagePreview] = useState<{
    open: boolean;
    src: string;
    title: string;
  }>({
    open: false,
    src: '',
    title: '',
  });
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualPlateNumber, setManualPlateNumber] = useState('');
  const [creatingManualVisitor, setCreatingManualVisitor] = useState(false);
  const [manualTruckResults, setManualTruckResults] = useState<ManualTruckSearchResult[]>([]);
  const [manualTruckSearchLoading, setManualTruckSearchLoading] = useState(false);

  const selectedCheckpoint = useMemo(
    () => checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) ?? null,
    [checkpoints, selectedCheckpointId],
  );

  const selectedManualTruck = useMemo(
    () => manualTruckResults.find((truck) => truck.plate_number.toUpperCase() === manualPlateNumber.trim().toUpperCase()) ?? null,
    [manualPlateNumber, manualTruckResults],
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

  const loadExitQueueCount = useCallback(async () => {
    if (!selectedCheckpointId) {
      setExitQueueCount(0);
      return;
    }

    try {
      const response = await axios.post('/security/checkpoint-exit-review-queue', {
        checkpoint_id: selectedCheckpointId,
        limit: 1,
      }, {
        headers: getAuthHeaders(),
      });

      setExitQueueCount(Number(response.data?.total_count ?? response.data?.count ?? 0));
    } catch (error) {
      console.error('Ошибка загрузки счётчика спорных выездов:', error);
    }
  }, [selectedCheckpointId]);

  useEffect(() => {
    loadCheckpoints();
  }, [loadCheckpoints]);

  useEffect(() => {
    if (!selectedCheckpointId) return;

    loadQueue();
    const interval = window.setInterval(loadQueue, 2000);

    return () => window.clearInterval(interval);
  }, [selectedCheckpointId, loadQueue]);

  useEffect(() => {
    if (!selectedCheckpointId) {
      setExitQueueCount(0);
      return;
    }

    loadExitQueueCount();
    const interval = window.setInterval(loadExitQueueCount, 5000);

    return () => window.clearInterval(interval);
  }, [selectedCheckpointId, loadExitQueueCount]);

  useEffect(() => {
    if (reviewMode === 'exit') {
      setShowExitSuggestion(false);
      return;
    }

    setShowExitSuggestion(exitQueueCount > 0 && queue.length === 0);
  }, [exitQueueCount, queue.length, reviewMode]);

  const loadExpectedTasks = useCallback(async (yardId: number) => {
    setLoadingExpectedTasks(true);
    try {
      const response = await axios.post('/security/getexpectedvehicles', {
        yard_id: yardId,
      }, {
        headers: getAuthHeaders(),
      });

      if (response.data?.status) {
        setExpectedTasks(response.data.data ?? []);
      }
    } catch (error) {
      console.error('Ошибка загрузки ожидаемых заданий:', error);
      setExpectedTasks([]);
    } finally {
      setLoadingExpectedTasks(false);
    }
  }, []);

  const searchSimilarPlates = useCallback(async (plate: string, yardId: number) => {
    if (plate.trim().length < 3) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await axios.post('/security/searchsimilarplates', {
        plate_number: plate,
        yard_id: yardId,
      }, {
        headers: getAuthHeaders(),
      });

      if (response.data?.status) {
        setSearchResults(response.data.data ?? []);
      }
    } catch (error) {
      console.error('Ошибка поиска похожих номеров:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const item = confirmDialog.item;
    if (!confirmDialog.open || !item) {
      return;
    }

    loadExpectedTasks(item.yard_id);
  }, [confirmDialog.open, confirmDialog.item, loadExpectedTasks]);

  useEffect(() => {
    const item = confirmDialog.item;
    if (!confirmDialog.open || !item) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      searchSimilarPlates(confirmDialog.correctedPlate, item.yard_id);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [confirmDialog.correctedPlate, confirmDialog.item, confirmDialog.open, searchSimilarPlates]);

  const openConfirmDialog = (item: CheckpointQueueItem) => {
    setConfirmDialog({
      open: true,
      item,
      correctedPlate: item.matched_plate_number || item.plate_number,
      selectedTruckId: item.matched_truck_id ?? null,
      selectedTaskId: item.task_id ?? null,
    });
    setSearchResults([]);
    setExpectedTasks([]);
  };

  const closeConfirmDialog = () => {
    setConfirmDialog({
      open: false,
      item: null,
      correctedPlate: '',
      selectedTruckId: null,
      selectedTaskId: null,
    });
    setSearchResults([]);
    setExpectedTasks([]);
  };

  const openImagePreview = (src: string, title: string) => {
    setImagePreview({
      open: true,
      src,
      title,
    });
  };

  const closeImagePreview = () => {
    setImagePreview({
      open: false,
      src: '',
      title: '',
    });
  };

  const openManualDialog = () => {
    setManualPlateNumber('');
    setManualTruckResults([]);
    setManualDialogOpen(true);
  };

  useEffect(() => {
    if (!manualDialogOpen || !selectedCheckpoint?.yard_id) {
      return;
    }

    if (manualPlateNumber.trim().length < 2) {
      setManualTruckResults([]);
      setManualTruckSearchLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setManualTruckSearchLoading(true);
      try {
        const response = await axios.post('/security/searchtruck', {
          plate_number: manualPlateNumber.trim(),
          yard_id: selectedCheckpoint.yard_id,
        }, {
          headers: getAuthHeaders(),
        });

        if (response.data?.status) {
          setManualTruckResults((response.data.data ?? []).slice(0, 8));
        } else {
          setManualTruckResults([]);
        }
      } catch (error) {
        console.error('Ошибка поиска существующих ТС:', error);
        setManualTruckResults([]);
      } finally {
        setManualTruckSearchLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [manualDialogOpen, manualPlateNumber, selectedCheckpoint]);

  const handleManualCreate = async () => {
    if (!selectedCheckpointId || !manualPlateNumber.trim()) {
      toast.error('Введите номер ТС для ручного добавления');
      return;
    }

    setCreatingManualVisitor(true);
    try {
      const response = await axios.post('/security/checkpoint-review-manual-add', {
        checkpoint_id: selectedCheckpointId,
        plate_number: manualPlateNumber.trim().toUpperCase(),
      }, {
        headers: getAuthHeaders(),
      });

      if (response.data?.status) {
        const queueDataResponse = await axios.post('/security/checkpoint-review-queue', {
          checkpoint_id: selectedCheckpointId,
          limit: 20,
        }, {
          headers: getAuthHeaders(),
        });

        const items: CheckpointQueueItem[] = queueDataResponse.data?.data ?? [];
        setQueue(items);
        setLastUpdatedAt(new Date());
        setManualDialogOpen(false);
        setManualPlateNumber('');
        setManualTruckResults([]);

        const visitorId = response.data?.data?.visitor_id;
        const createdItem = items.find((item) => item.visitor_id === visitorId);

        if (createdItem) {
          openConfirmDialog(createdItem);
        }

        toast.success(response.data?.data?.already_exists ? 'Найдена существующая запись для подтверждения' : 'Посетитель добавлен вручную');
      }
    } catch (error: any) {
      console.error('Ошибка ручного добавления посетителя:', error);
      toast.error(error.response?.data?.message || 'Не удалось добавить посетителя вручную');
    } finally {
      setCreatingManualVisitor(false);
    }
  };

  const handleConfirm = async () => {
    const item = confirmDialog.item;
    if (!item) {
      return;
    }

    const userId = Number(localStorage.getItem('user_id') || '1');
    setProcessingVisitorId(item.visitor_id);

    const selectedTruck = searchResults.find((truck) => truck.truck_id === confirmDialog.selectedTruckId);
    const hasPermit = selectedTruck ? selectedTruck.has_permit : item.has_permit;

    if (item.yard_strict_mode && !hasPermit) {
      toast.error('🚫 Въезд запрещён: строгий режим активен, требуется разрешение на въезд');
      setProcessingVisitorId(null);
      return;
    }

    try {
      const response = await axios.post('/security/confirmvisitor', {
        visitor_id: item.visitor_id,
        operator_user_id: userId,
        truck_id: confirmDialog.selectedTruckId ?? undefined,
        task_id: confirmDialog.selectedTaskId ?? undefined,
        corrected_plate_number: confirmDialog.correctedPlate || item.plate_number,
      }, {
        headers: getAuthHeaders(),
      });

      if (response.data?.status) {
        toast.success('Въезд подтверждён');
        closeConfirmDialog();
        await loadQueue();
        await loadExitQueueCount();
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
        await loadExitQueueCount();
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
        <CardContent className="px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-medium">Единое рабочее место КПП</div>
              <div className="text-sm text-muted-foreground">
                Охрана управляет въездом и выездами.
              </div>
            </div>

            <div className="inline-flex w-full flex-wrap rounded-lg border bg-muted/30 p-1 lg:w-auto">
              <button
                type="button"
                onClick={() => setReviewMode('entry')}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors lg:flex-none ${reviewMode === 'entry'
                  ? 'bg-background text-blue-600 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                Въезд
              </button>
              <button
                type="button"
                onClick={() => setReviewMode('exit')}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors lg:flex-none ${reviewMode === 'exit'
                  ? 'bg-background text-orange-600 shadow-sm'
                  : exitQueueCount > 0
                    ? 'text-orange-700 ring-1 ring-orange-300 hover:text-orange-800'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LogOut className="h-4 w-4" />
                Выезд
                {exitQueueCount > 0 && (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 py-0.5 text-xs font-semibold leading-none text-white">
                    {exitQueueCount > 99 ? '99+' : exitQueueCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {reviewMode === 'entry' && showExitSuggestion && (
        <Card className="border-orange-200 bg-orange-50/80 py-0">
          <CardContent className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <div className="text-sm font-medium text-orange-900">
                Есть спорные выезды на этом КПП: {exitQueueCount}
              </div>
              <div className="text-sm text-orange-800/80">
                Очередь въезда обработана — можно сразу перейти к подтверждению выезда.
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="border-orange-300 bg-white text-orange-700 hover:bg-orange-100 hover:text-orange-800"
              onClick={() => setReviewMode('exit')}
            >
              <LogOut className="h-4 w-4" />
              Открыть выезд
            </Button>
          </CardContent>
        </Card>
      )}

      {reviewMode === 'exit' ? (
        <CheckpointExitReview
          selectedCheckpointId={selectedCheckpointId}
          onSelectedCheckpointIdChange={setSelectedCheckpointId}
        />
      ) : (
        <>
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
              <Button variant="secondary" onClick={openManualDialog} disabled={!selectedCheckpointId}>
                <Plus className="h-4 w-4" />
                Ручное добавление
              </Button>

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
                      <div className="group relative overflow-hidden rounded-lg border bg-muted/30">
                        {item.capture_picture_url ? (
                          <button
                            type="button"
                            onClick={() => openImagePreview(item.capture_picture_url!, `ТС ${item.plate_number}`)}
                            className="block h-full w-full cursor-zoom-in"
                          >
                            <img
                              src={item.capture_picture_url}
                              alt={`ТС ${item.plate_number}`}
                              className="h-40 w-full object-cover transition-transform duration-300 group-hover:scale-110"
                            />
                            <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                              <span className="p-3 text-xs font-medium text-white">Нажмите для увеличения</span>
                            </div>
                          </button>
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
                          <Button onClick={() => openConfirmDialog(item)} disabled={isProcessing} className="w-full">
                            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Разрешить въезд
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

      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && closeConfirmDialog()}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Подтверждение въезда на КПП</DialogTitle>
            <DialogDescription>
              Охранник может скорректировать номер, выбрать ТС и привязать задание перед подтверждением въезда.
            </DialogDescription>
          </DialogHeader>

          {confirmDialog.item && (
            <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="group relative overflow-hidden rounded-lg border bg-muted/20">
                  {confirmDialog.item.capture_picture_url ? (
                    <button
                      type="button"
                      onClick={() => openImagePreview(confirmDialog.item!.capture_picture_url!, `Фото ${confirmDialog.item!.plate_number}`)}
                      className="block h-full w-full cursor-zoom-in"
                    >
                      <img
                        src={confirmDialog.item.capture_picture_url}
                        alt={`Фото ${confirmDialog.item.plate_number}`}
                        className="h-52 w-full object-cover transition-transform duration-300 group-hover:scale-110"
                      />
                      <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <span className="p-3 text-xs font-medium text-white">Нажмите для увеличения</span>
                      </div>
                    </button>
                  ) : (
                    <div className="flex h-52 items-center justify-center text-muted-foreground">
                      <Camera className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <div className="rounded-lg border p-3 text-sm">
                  <div><span className="text-muted-foreground">Распознанный номер:</span> <span className="font-mono font-semibold">{confirmDialog.item.plate_number}</span></div>
                  <div><span className="text-muted-foreground">КПП:</span> {selectedCheckpoint?.name || '—'}</div>
                  <div><span className="text-muted-foreground">Камера:</span> {confirmDialog.item.device_name || '—'}</div>
                  <div><span className="text-muted-foreground">Причина:</span> {confirmDialog.item.pending_reason_text || 'Требуется проверка'}</div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Скорректированный номер</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={confirmDialog.correctedPlate}
                      onChange={(event) => setConfirmDialog((prev) => ({ ...prev, correctedPlate: event.target.value.toUpperCase() }))}
                      className="pl-9 font-mono"
                      placeholder="Введите номер ТС"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Подходящие ТС</label>
                    {searching && <span className="text-xs text-muted-foreground">Поиск...</span>}
                  </div>

                  <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border p-2">
                    {searchResults.length === 0 ? (
                      <div className="px-2 py-3 text-sm text-muted-foreground">Совпадения не найдены. Можно подтвердить только с ручной коррекцией номера.</div>
                    ) : searchResults.map((truck) => {
                      const selected = confirmDialog.selectedTruckId === truck.truck_id;
                      return (
                        <button
                          key={truck.truck_id}
                          type="button"
                          onClick={() => setConfirmDialog((prev) => ({
                            ...prev,
                            selectedTruckId: truck.truck_id,
                            selectedTaskId: prev.selectedTaskId ?? truck.task_id ?? null,
                            correctedPlate: truck.plate_number,
                          }))}
                          className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${selected ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-muted/50'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-semibold">{truck.plate_number}</span>
                            <Badge variant={truck.has_permit ? 'default' : 'outline'}>
                              {truck.has_permit ? 'Есть разрешение' : 'Без разрешения'}
                            </Badge>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Совпадение: {truck.similarity_percent}%{truck.task_name ? ` • ${truck.task_name}` : ''}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Ожидаемые задания</label>
                    {loadingExpectedTasks && <span className="text-xs text-muted-foreground">Загрузка...</span>}
                  </div>

                  <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-2">
                    {expectedTasks.length === 0 ? (
                      <div className="px-2 py-3 text-sm text-muted-foreground">На выбранный двор ожидаемых заданий не найдено.</div>
                    ) : expectedTasks.map((task) => {
                      const selected = confirmDialog.selectedTaskId === task.id;
                      return (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setConfirmDialog((prev) => ({
                            ...prev,
                            selectedTaskId: task.id,
                            selectedTruckId: prev.selectedTruckId ?? task.truck_id ?? null,
                            correctedPlate: prev.correctedPlate || task.plate_number || '',
                          }))}
                          className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${selected ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-muted/50'}`}
                        >
                          <div className="font-medium">{task.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {task.plate_number || 'Без привязанного номера'}{task.driver_name ? ` • ${task.driver_name}` : ''}{task.plan_date ? ` • ${formatDateTime(task.plan_date)}` : ''}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant={confirmDialog.item.has_permit ? 'default' : 'outline'}>
                    <KeyRound className="h-3 w-3" />
                    {confirmDialog.item.has_permit ? 'Разрешение найдено' : 'Разрешение не найдено'}
                  </Badge>
                  <Badge variant={confirmDialog.item.has_loading_task ? 'default' : 'outline'}>
                    <Package className="h-3 w-3" />
                    {confirmDialog.item.has_loading_task ? `Погрузка: ${confirmDialog.item.loading_points_count}` : 'Без погрузки'}
                  </Badge>
                  <Badge variant={confirmDialog.item.has_weighing_task ? 'default' : 'outline'}>
                    <Scale className="h-3 w-3" />
                    {confirmDialog.item.has_weighing_task ? 'Нужно взвешивание' : 'Без взвешивания'}
                  </Badge>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeConfirmDialog}>Отмена</Button>
            <Button onClick={handleConfirm} disabled={!confirmDialog.item || processingVisitorId === confirmDialog.item?.visitor_id}>
              {processingVisitorId === confirmDialog.item?.visitor_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Подтвердить въезд
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ручное добавление посетителя</DialogTitle>
            <DialogDescription>
              Используйте этот режим, если камера потеряла сигнал или распознавание не сработало.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              КПП: <span className="font-medium text-foreground">{selectedCheckpoint?.name || 'Не выбрано'}</span>
              {selectedCheckpoint?.yard_name && (
                <span> • {selectedCheckpoint.yard_name}</span>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Номер ТС</label>
              <Input
                value={manualPlateNumber}
                onChange={(event) => setManualPlateNumber(event.target.value.toUpperCase())}
                placeholder="Например: А123ВС777"
                className="font-mono"
              />

              {selectedManualTruck && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="font-mono font-semibold text-emerald-800 dark:text-emerald-300">
                      {selectedManualTruck.plate_number}
                    </div>
                    <Badge variant={selectedManualTruck.has_permit ? 'default' : 'outline'}>
                      {selectedManualTruck.has_permit ? 'Разрешение есть' : 'Без разрешения'}
                    </Badge>
                  </div>

                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <span className="text-muted-foreground">Модель/марка:</span>{' '}
                      <span className="font-medium">
                        {[selectedManualTruck.truck_brand_name, selectedManualTruck.truck_model_name].filter(Boolean).join(' ') || '—'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Категория:</span>{' '}
                      <span className="font-medium">{selectedManualTruck.truck_category_name || '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Задание:</span>{' '}
                      <span className="font-medium">{selectedManualTruck.task_name || 'Не найдено'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Водитель:</span>{' '}
                      <span className="font-medium">{selectedManualTruck.driver_name || 'Не указан'}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-lg border bg-muted/20 p-2">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Поиск существующих ТС в базе</span>
                  {manualTruckSearchLoading && <span>Поиск...</span>}
                </div>

                {manualPlateNumber.trim().length < 2 ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    Начните вводить номер, и здесь появятся существующие ТС из базы.
                  </div>
                ) : manualTruckResults.length === 0 ? (
                  <div className="px-2 py-3 text-sm text-muted-foreground">
                    Совпадений в базе не найдено.
                  </div>
                ) : (
                  <div className="max-h-56 space-y-2 overflow-y-auto">
                    {manualTruckResults.map((truck) => (
                      <button
                        key={truck.id}
                        type="button"
                        onClick={() => setManualPlateNumber(truck.plate_number.toUpperCase())}
                        className="w-full rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-semibold">{truck.plate_number}</span>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant={truck.has_permit ? 'default' : 'outline'}>
                              {truck.has_permit ? 'Есть разрешение' : 'Без разрешения'}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {[truck.truck_brand_name, truck.truck_model_name, truck.truck_category_name].filter(Boolean).join(' • ') || 'Без описания'}
                          {truck.task_name ? ` • ${truck.task_name}` : ''}
                          {truck.driver_name ? ` • ${truck.driver_name}` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleManualCreate} disabled={!selectedCheckpointId || !manualPlateNumber.trim() || creatingManualVisitor}>
              {creatingManualVisitor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Добавить в очередь
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={imagePreview.open} onOpenChange={(open) => !open && closeImagePreview()}>
        <DialogContent
          className="h-[96vh] w-[98vw] max-w-[98vw] border-0 bg-black/95 p-2 text-white [&>button]:text-white [&>button]:opacity-90 [&>button]:ring-white/30 [&>button]:hover:bg-white/10 [&>button]:hover:text-white sm:h-[98vh] sm:w-[98vw] sm:max-w-[98vw] sm:p-4"
          onClick={closeImagePreview}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{imagePreview.title}</DialogTitle>
          </DialogHeader>
          {imagePreview.src && (
            <div
              className="flex h-full w-full items-center justify-center overflow-hidden rounded-lg"
              onClick={(event) => event.stopPropagation()}
            >
              <img
                src={imagePreview.src}
                alt={imagePreview.title}
                className="max-h-[92vh] w-auto max-w-full rounded-lg object-contain sm:max-h-[94vh]"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  );
};

export default CheckpointReview;
