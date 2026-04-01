import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  Camera,
  CheckCircle2,
  Clock3,
  Loader2,
  LogOut,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  XCircle,
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

type ExitCandidate = {
  visitor_id: number;
  plate_number: string;
  entry_date: string;
  task_id?: number | null;
  task_name?: string | null;
  confirmation_status: string;
  truck_id?: number | null;
  is_exact_truck_match: boolean;
  is_exact_plate_match: boolean;
};

type ExitReviewItem = {
  review_id: number;
  status: 'pending' | 'confirmed' | 'rejected';
  resolved_at?: string | null;
  resolved_visitor_id?: number | null;
  plate_number: string;
  capture_time?: string | null;
  recognition_confidence?: number | null;
  checkpoint_id: number;
  checkpoint_name?: string | null;
  yard_id: number;
  yard_name?: string | null;
  device_id?: number | null;
  device_name?: string | null;
  truck_id?: number | null;
  note?: string | null;
  capture_picture_url?: string | null;
  capture_plate_picture_url?: string | null;
  candidate_visitors: ExitCandidate[];
};

type CheckpointExitReviewProps = {
  selectedCheckpointId?: number | null;
  onSelectedCheckpointIdChange?: (checkpointId: number | null) => void;
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

const getConfidenceBadgeClass = (confidence?: number | null) => {
  if (confidence == null) return 'bg-gray-100 text-gray-700';
  if (confidence >= 90) return 'bg-emerald-100 text-emerald-700';
  if (confidence >= 75) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
};

const getConfirmationStatusLabel = (status: string) => {
  switch (status) {
    case 'confirmed':
      return 'Подтверждён';
    case 'pending':
      return 'Ожидает';
    case 'rejected':
      return 'Отклонён';
    default:
      return status;
  }
};

const getExitReviewStatusLabel = (status: ExitReviewItem['status']) => {
  switch (status) {
    case 'confirmed':
      return 'Выезд подтверждён';
    case 'rejected':
      return 'Выезд отклонён';
    default:
      return 'Ожидает решения';
  }
};

const CheckpointExitReview: React.FC<CheckpointExitReviewProps> = ({
  selectedCheckpointId: controlledCheckpointId,
  onSelectedCheckpointIdChange,
}) => {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [internalSelectedCheckpointId, setInternalSelectedCheckpointId] = useState<number | null>(null);
  const [queue, setQueue] = useState<ExitReviewItem[]>([]);
  const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [processingReviewId, setProcessingReviewId] = useState<number | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    item: ExitReviewItem | null;
    selectedVisitorId: number | null;
    correctedPlate: string;
  }>({
    open: false,
    item: null,
    selectedVisitorId: null,
    correctedPlate: '',
  });
  const [manualSearchResults, setManualSearchResults] = useState<ExitCandidate[]>([]);
  const [manualSearchLoading, setManualSearchLoading] = useState(false);
  const [manualLookupPlate, setManualLookupPlate] = useState('');
  const [manualLookupResults, setManualLookupResults] = useState<ExitCandidate[]>([]);
  const [manualLookupLoading, setManualLookupLoading] = useState(false);
  const [manualExitVisitorId, setManualExitVisitorId] = useState<number | null>(null);
  const [imagePreview, setImagePreview] = useState<{
    open: boolean;
    src: string;
    title: string;
  }>({
    open: false,
    src: '',
    title: '',
  });

  const selectedCheckpointId = controlledCheckpointId ?? internalSelectedCheckpointId;

  const updateSelectedCheckpointId = useCallback((checkpointId: number | null) => {
    if (onSelectedCheckpointIdChange) {
      onSelectedCheckpointIdChange(checkpointId);
      return;
    }

    setInternalSelectedCheckpointId(checkpointId);
  }, [onSelectedCheckpointIdChange]);

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
        updateSelectedCheckpointId(items[0].id);
      }
    } catch (error) {
      console.error('Ошибка загрузки КПП:', error);
      toast.error('Не удалось загрузить список КПП');
    } finally {
      setLoadingCheckpoints(false);
    }
  }, [selectedCheckpointId, updateSelectedCheckpointId]);

  const loadQueue = useCallback(async () => {
    if (!selectedCheckpointId) {
      setQueue([]);
      return;
    }

    setLoadingQueue(true);
    try {
      const response = await axios.post('/security/checkpoint-exit-review-queue', {
        checkpoint_id: selectedCheckpointId,
        limit: 20,
      }, {
        headers: getAuthHeaders(),
      });

      setQueue(response.data?.data ?? []);
      setLastUpdatedAt(new Date());
    } catch (error) {
      console.error('Ошибка загрузки очереди проверки выезда:', error);
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
    const interval = window.setInterval(loadQueue, 2000);

    return () => window.clearInterval(interval);
  }, [selectedCheckpointId, loadQueue]);

  useEffect(() => {
    if (!selectedCheckpoint?.yard_id) {
      setManualLookupResults([]);
      return;
    }

    if (manualLookupPlate.trim().length < 2) {
      setManualLookupResults([]);
      setManualLookupLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setManualLookupLoading(true);
      try {
        const response = await axios.post('/security/search-active-visitors-for-exit', {
          yard_id: selectedCheckpoint.yard_id,
          plate_number: manualLookupPlate.trim(),
        }, {
          headers: getAuthHeaders(),
        });

        if (response.data?.status) {
          setManualLookupResults(response.data.data ?? []);
        } else {
          setManualLookupResults([]);
        }
      } catch (error) {
        console.error('Ошибка ручного поиска активных визитов:', error);
        setManualLookupResults([]);
      } finally {
        setManualLookupLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [manualLookupPlate, selectedCheckpoint]);

  const openConfirmDialog = (item: ExitReviewItem) => {
    setConfirmDialog({
      open: true,
      item,
      selectedVisitorId: item.candidate_visitors.length === 1 ? item.candidate_visitors[0].visitor_id : null,
      correctedPlate: item.plate_number,
    });
    setManualSearchResults(item.candidate_visitors);
  };

  const closeConfirmDialog = () => {
    setConfirmDialog({
      open: false,
      item: null,
      selectedVisitorId: null,
      correctedPlate: '',
    });
    setManualSearchResults([]);
  };

  const searchActiveVisitors = useCallback(async (plate: string, yardId: number, fallback: ExitCandidate[] = []) => {
    if (plate.trim().length < 2) {
      setManualSearchResults(fallback);
      return;
    }

    setManualSearchLoading(true);
    try {
      const response = await axios.post('/security/search-active-visitors-for-exit', {
        yard_id: yardId,
        plate_number: plate,
      }, {
        headers: getAuthHeaders(),
      });

      if (response.data?.status) {
        setManualSearchResults(response.data.data ?? []);
      } else {
        setManualSearchResults([]);
      }
    } catch (error) {
      console.error('Ошибка поиска активных визитов для выезда:', error);
      setManualSearchResults([]);
    } finally {
      setManualSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const item = confirmDialog.item;
    if (!confirmDialog.open || !item) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      searchActiveVisitors(confirmDialog.correctedPlate, item.yard_id, item.candidate_visitors);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [confirmDialog.correctedPlate, confirmDialog.item, confirmDialog.open, searchActiveVisitors]);

  const openImagePreview = (src: string, title: string) => {
    setImagePreview({ open: true, src, title });
  };

  const closeImagePreview = () => {
    setImagePreview({ open: false, src: '', title: '' });
  };

  const handleConfirm = async () => {
    const item = confirmDialog.item;
    if (!item) return;

    if (!confirmDialog.selectedVisitorId) {
      toast.error('Выберите активный визит для подтверждения выезда');
      return;
    }

    setProcessingReviewId(item.review_id);
    const userId = Number(localStorage.getItem('user_id') || '1');

    try {
      const response = await axios.post('/security/confirm-exit-review', {
        review_id: item.review_id,
        operator_user_id: userId,
        visitor_id: confirmDialog.selectedVisitorId ?? undefined,
      }, {
        headers: getAuthHeaders(),
      });

      if (response.data?.status) {
        toast.success('Выезд подтверждён');
        closeConfirmDialog();
        await loadQueue();
      }
    } catch (error: any) {
      console.error('Ошибка подтверждения выезда:', error);
      toast.error(error.response?.data?.message || 'Не удалось подтвердить выезд');
    } finally {
      setProcessingReviewId(null);
    }
  };

  const handleReject = async (item: ExitReviewItem) => {
    setProcessingReviewId(item.review_id);
    const userId = Number(localStorage.getItem('user_id') || '1');

    try {
      const response = await axios.post('/security/reject-exit-review', {
        review_id: item.review_id,
        operator_user_id: userId,
        reason: 'Отклонено оператором КПП',
      }, {
        headers: getAuthHeaders(),
      });

      if (response.data?.status) {
        toast.success('Событие выезда отклонено');
        await loadQueue();
      }
    } catch (error: any) {
      console.error('Ошибка отклонения выезда:', error);
      toast.error(error.response?.data?.message || 'Не удалось отклонить событие выезда');
    } finally {
      setProcessingReviewId(null);
    }
  };

  const handleManualExit = async (candidate: ExitCandidate) => {
    if (candidate.confirmation_status !== 'confirmed') {
      toast.error('Сначала нужно подтвердить въезд этого визита');
      return;
    }

    setManualExitVisitorId(candidate.visitor_id);
    try {
      const response = await axios.post('/security/exitvisitor', {
        id: candidate.visitor_id,
      }, {
        headers: getAuthHeaders(),
      });

      if (response.data?.status) {
        toast.success('Выезд зафиксирован вручную');
        setManualLookupResults((prev) => prev.filter((item) => item.visitor_id !== candidate.visitor_id));
        await loadQueue();
      }
    } catch (error: any) {
      console.error('Ошибка ручной фиксации выезда:', error);
      toast.error(error.response?.data?.message || 'Не удалось зафиксировать выезд');
    } finally {
      setManualExitVisitorId(null);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <LogOut className="h-5 w-5 text-orange-600" />
                Проверка выезда на КПП
              </CardTitle>
              <CardDescription>
                Лента выездов по выбранному КПП: спорные, подтверждённые и отклонённые события.
              </CardDescription>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={selectedCheckpointId ?? ''}
                onChange={(event) => updateSelectedCheckpointId(Number(event.target.value) || null)}
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

          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/70 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-blue-900">
                  <Search className="h-4 w-4" />
                  Ручной поиск среди въехавших
                </div>
                <div className="mt-1 text-sm text-blue-900/80">
                  Если выезд не попал в очередь камеры, охрана может найти активный визит по номеру и вручную отметить выезд.
                </div>
              </div>

              <div className="w-full max-w-xl space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={manualLookupPlate}
                    onChange={(event) => setManualLookupPlate(event.target.value.toUpperCase())}
                    className="bg-white pl-9 font-mono"
                    placeholder={selectedCheckpoint ? 'Введите номер ТС или его часть' : 'Сначала выберите КПП'}
                    disabled={!selectedCheckpoint}
                  />
                </div>

                {!selectedCheckpoint ? (
                  <div className="rounded-lg border border-dashed border-blue-200 bg-white/80 px-3 py-4 text-sm text-muted-foreground">
                    Выберите КПП, чтобы искать активные визиты только по его двору.
                  </div>
                ) : manualLookupPlate.trim().length < 2 ? (
                  <div className="rounded-lg border border-dashed border-blue-200 bg-white/80 px-3 py-4 text-sm text-muted-foreground">
                    Начните вводить номер, и ниже появятся въехавшие ТС для ручной отметки выезда.
                  </div>
                ) : manualLookupLoading ? (
                  <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Ищем активные визиты...
                  </div>
                ) : manualLookupResults.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-blue-200 bg-white/80 px-3 py-4 text-sm text-muted-foreground">
                    По этому номеру активные въезды не найдены.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {manualLookupResults.map((candidate) => {
                      const isProcessing = manualExitVisitorId === candidate.visitor_id;
                      const isConfirmed = candidate.confirmation_status === 'confirmed';

                      return (
                        <div key={candidate.visitor_id} className="rounded-lg border bg-white p-3 shadow-sm">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold">Визит #{candidate.visitor_id}</span>
                                <Badge variant="outline" className="font-mono">{candidate.plate_number}</Badge>
                                <Badge variant="secondary">{getConfirmationStatusLabel(candidate.confirmation_status)}</Badge>
                                {candidate.is_exact_truck_match && <Badge className="bg-emerald-100 text-emerald-700">Совпадает ТС</Badge>}
                                {candidate.is_exact_plate_match && <Badge className="bg-blue-100 text-blue-700">Точный номер</Badge>}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Въезд: {formatDateTime(candidate.entry_date)}
                                {candidate.task_name ? ` • Задание: ${candidate.task_name}` : ''}
                              </div>
                              {!isConfirmed && (
                                <div className="text-xs text-amber-700">
                                  Этот визит ещё не подтверждён на въезде, поэтому ручной выезд для него недоступен.
                                </div>
                              )}
                            </div>

                            <Button
                              type="button"
                              variant={isConfirmed ? 'default' : 'outline'}
                              onClick={() => handleManualExit(candidate)}
                              disabled={!isConfirmed || isProcessing}
                              className="lg:min-w-44"
                            >
                              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                              Покинул территорию
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {!selectedCheckpointId ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Выберите КПП, чтобы загрузить события выезда.
            </div>
          ) : loadingQueue && queue.length === 0 ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем события выезда...
            </div>
          ) : queue.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Для выбранного КПП событий выезда пока нет.
            </div>
          ) : (
            <div className="space-y-3">
              {queue.map((item) => {
                const isProcessing = processingReviewId === item.review_id;
                const isResolved = item.status !== 'pending';
                const isConfirmed = item.status === 'confirmed';
                const isRejected = item.status === 'rejected';

                return (
                  <div key={item.review_id} className="overflow-hidden rounded-xl border bg-card">
                    <div className="grid gap-4 p-4 xl:grid-cols-[220px_minmax(0,1fr)_auto]">
                      <div className="group relative overflow-hidden rounded-lg border bg-muted/30">
                        {item.capture_picture_url ? (
                          <button
                            type="button"
                            onClick={() => openImagePreview(item.capture_picture_url!, `Выезд ${item.plate_number}`)}
                            className="block h-full w-full cursor-zoom-in"
                          >
                            <img
                              src={item.capture_picture_url}
                              alt={`Выезд ${item.plate_number}`}
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
                          <Badge
                            variant={isConfirmed ? 'default' : 'secondary'}
                            className={isRejected ? 'bg-red-100 text-red-700 hover:bg-red-100' : undefined}
                          >
                            {getExitReviewStatusLabel(item.status)}
                          </Badge>
                          <Badge className={getConfidenceBadgeClass(item.recognition_confidence)}>
                            {item.recognition_confidence != null ? `${item.recognition_confidence}%` : 'Уверенность n/a'}
                          </Badge>
                          <Badge variant="secondary">Кандидатов: {item.candidate_visitors.length}</Badge>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-lg border bg-muted/30 p-3">
                            <div className="text-xs text-muted-foreground">Время фиксации</div>
                            <div className="mt-1 font-medium">{formatDateTime(item.capture_time)}</div>
                            <div className="text-xs text-muted-foreground">{formatRelativeSeconds(item.capture_time)}</div>
                          </div>
                          <div className="rounded-lg border bg-muted/30 p-3">
                            <div className="text-xs text-muted-foreground">КПП / камера</div>
                            <div className="mt-1 font-medium">{item.checkpoint_name || '—'}</div>
                            <div className="text-xs text-muted-foreground">{item.device_name || 'Камера не определена'}</div>
                          </div>
                          <div className="rounded-lg border bg-muted/30 p-3">
                            <div className="text-xs text-muted-foreground">Двор</div>
                            <div className="mt-1 font-medium">{item.yard_name || '—'}</div>
                          </div>
                          <div className="rounded-lg border bg-muted/30 p-3">
                            <div className="text-xs text-muted-foreground">Статус / примечание</div>
                            <div className="mt-1 text-sm font-medium">{item.note || (isResolved ? 'Событие обработано' : 'Нужна проверка оператора')}</div>
                            {item.resolved_at && (
                              <div className="mt-1 text-xs text-muted-foreground">Обработано: {formatDateTime(item.resolved_at)}</div>
                            )}
                          </div>
                        </div>

                        <div className={`rounded-lg border p-3 ${isResolved ? 'border-slate-200 bg-slate-50/80' : 'border-orange-200 bg-orange-50/80'}`}>
                          <div className={`mb-2 flex items-center gap-2 text-sm font-medium ${isResolved ? 'text-slate-900' : 'text-orange-900'}`}>
                            <Truck className="h-4 w-4" />
                            {isResolved ? 'Связанные визиты' : 'Активные визиты-кандидаты'}
                          </div>
                          {item.candidate_visitors.length === 0 ? (
                            <div className={`text-sm ${isResolved ? 'text-slate-700' : 'text-orange-900/80'}`}>
                              {isResolved
                                ? 'Связанный визит для этого события не найден.'
                                : 'Активные визиты по этому номеру не найдены. Событие можно отклонить или позже сопоставить вручную.'}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {item.candidate_visitors.map((candidate) => (
                                <Badge
                                  key={candidate.visitor_id}
                                  variant="outline"
                                  className={isResolved ? 'border-slate-300 bg-white text-slate-900' : 'border-orange-300 bg-white text-orange-900'}
                                >
                                  #{candidate.visitor_id} • {candidate.plate_number} • {getConfirmationStatusLabel(candidate.confirmation_status)}
                                  {candidate.task_name ? ` • ${candidate.task_name}` : ''}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 xl:w-48">
                        {isResolved ? (
                          <div className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                            {isConfirmed ? 'Действия недоступны для подтверждённого выезда' : 'Действия недоступны для отклонённого выезда'}
                          </div>
                        ) : (
                          <>
                            <Button onClick={() => openConfirmDialog(item)} disabled={isProcessing}>
                              <CheckCircle2 className="h-4 w-4" />
                              Подтвердить выезд
                            </Button>
                            <Button variant="destructive" onClick={() => handleReject(item)} disabled={isProcessing}>
                              <XCircle className="h-4 w-4" />
                              Отклонить
                            </Button>
                          </>
                        )}
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
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Подтверждение выезда</DialogTitle>
            <DialogDescription>
              Выберите активный визит, который нужно закрыть по событию выезда камеры.
            </DialogDescription>
          </DialogHeader>

          {confirmDialog.item && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <div><span className="text-muted-foreground">Распознанный номер:</span> <span className="font-mono font-semibold">{confirmDialog.item.plate_number}</span></div>
                <div><span className="text-muted-foreground">Время:</span> {formatDateTime(confirmDialog.item.capture_time)}</div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Скорректированный номер / поиск активного визита</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={confirmDialog.correctedPlate}
                    onChange={(event) => setConfirmDialog((prev) => ({ ...prev, correctedPlate: event.target.value.toUpperCase(), selectedVisitorId: null }))}
                    className="pl-9 font-mono"
                    placeholder="Введите правильный номер ТС"
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  Если OCR ошибся, исправьте номер — ниже загрузятся активные визиты по этому двору.
                </div>
              </div>

              <div className="space-y-2">
                {manualSearchLoading ? (
                  <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Ищем активные визиты...
                  </div>
                ) : manualSearchResults.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    По текущему номеру активные визиты не найдены. Можно уточнить номер и повторить поиск.
                  </div>
                ) : manualSearchResults.map((candidate) => {
                  const selected = confirmDialog.selectedVisitorId === candidate.visitor_id;
                  return (
                    <button
                      key={candidate.visitor_id}
                      type="button"
                      onClick={() => setConfirmDialog((prev) => ({ ...prev, selectedVisitorId: candidate.visitor_id }))}
                      className={`w-full rounded-lg border p-3 text-left transition ${selected ? 'border-blue-600 bg-blue-50' : 'hover:bg-muted/40'}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">Визит #{candidate.visitor_id}</span>
                        <Badge variant="outline">{candidate.plate_number}</Badge>
                        <Badge variant="secondary">{getConfirmationStatusLabel(candidate.confirmation_status)}</Badge>
                        {candidate.is_exact_truck_match && <Badge className="bg-emerald-100 text-emerald-700">Совпадает ТС</Badge>}
                        {candidate.is_exact_plate_match && <Badge className="bg-blue-100 text-blue-700">Совпадает номер</Badge>}
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        Въезд: {formatDateTime(candidate.entry_date)}
                        {candidate.task_name ? ` • Задание: ${candidate.task_name}` : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeConfirmDialog}>Отмена</Button>
            <Button onClick={handleConfirm} disabled={processingReviewId === confirmDialog.item?.review_id}>
              <ShieldCheck className="h-4 w-4" />
              Подтвердить выезд
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
    </div>
  );
};

export default CheckpointExitReview;
