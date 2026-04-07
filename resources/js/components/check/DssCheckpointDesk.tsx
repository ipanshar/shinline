import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRightLeft, Camera, CheckCircle2, Clock3, Loader2, MapPin, Radio, RefreshCw, Search, ShieldAlert, ShieldCheck, Truck, Wifi, WifiOff, XCircle, Package, KeyRound, Scale } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { bindDssAlarmConnectionDebug, subscribeToDssUnknownVehicleDetected, type DssChannelSubscriptionState } from '@/lib/dss-alarms';

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

type Checkpoint = { id: number; name: string; yard_id: number; yard_name?: string };
type EntryQueueItem = {
  visitor_id: number; plate_number: string; original_plate_number?: string | null; confirmation_status: 'pending' | 'confirmed' | 'rejected';
  confirmed_at?: string | null; entry_date: string; recognition_confidence?: number | null; yard_id: number; yard_name?: string | null;
  yard_strict_mode: boolean; checkpoint_id: number; device_name?: string | null; can_open_barrier?: boolean; matched_truck_id?: number | null;
  matched_plate_number?: string | null; task_id?: number | null; task_name?: string | null; has_permit: boolean; permit_type?: 'one_time' | 'permanent' | null;
  has_loading_task: boolean; loading_points_count: number; has_weighing_task: boolean; weighing_reason?: string | null; pending_reason?: string | null;
  pending_reason_text?: string | null; capture_id?: number | null; capture_time?: string | null; capture_picture_url?: string | null; capture_plate_picture_url?: string | null;
};
type SimilarPlate = { truck_id: number; plate_number: string; truck_model_name?: string; has_permit: boolean; permit_id?: number; task_id?: number; task_name?: string; similarity_percent: number };
type ExpectedTask = { id: number; name: string; description?: string; plan_date?: string; truck_id?: number; plate_number?: string; driver_name?: string; driver_phone?: string };
type ConfirmResolvedTruck = { truckId: number | null; hasPermit: boolean; isNew: boolean };
type ExitCandidate = { visitor_id: number; plate_number: string; entry_date: string; task_id?: number | null; task_name?: string | null; confirmation_status: string; truck_id?: number | null; is_exact_truck_match: boolean; is_exact_plate_match: boolean };
type ExitReviewItem = {
  review_id: number; status: 'pending' | 'confirmed' | 'rejected'; resolved_at?: string | null; resolved_visitor_id?: number | null; plate_number: string;
  capture_time?: string | null; recognition_confidence?: number | null; checkpoint_id: number; checkpoint_name?: string | null; yard_id: number; yard_name?: string | null;
  device_id?: number | null; device_name?: string | null; truck_id?: number | null; note?: string | null; capture_picture_url?: string | null; capture_plate_picture_url?: string | null;
  candidate_visitors: ExitCandidate[];
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
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

const normalizePlateNumber = (value?: string | null) => value?.replace(/[\s-]+/g, '').toUpperCase() ?? '';
const getConfidenceBadgeClass = (confidence?: number | null) => confidence == null ? 'bg-gray-100 text-gray-700' : confidence >= 90 ? 'bg-emerald-100 text-emerald-700' : confidence >= 75 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
const getConfirmationStatusLabel = (status: string) => status === 'confirmed' ? 'Подтверждён' : status === 'pending' ? 'Ожидает' : status === 'rejected' ? 'Отклонён' : status;
const getSubscriptionBadgeClass = (state: DssChannelSubscriptionState) => state === 'subscribed' ? 'bg-emerald-100 text-emerald-700' : state === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
const getSubscriptionLabel = (state: DssChannelSubscriptionState) => state === 'subscribed' ? 'Private channel активен' : state === 'subscribing' ? 'Подписка выполняется' : state === 'error' ? 'Ошибка авторизации канала' : 'Подписка не начата';
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
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<number | null>(null);
  const [loadingCheckpoints, setLoadingCheckpoints] = useState(false);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [entryItem, setEntryItem] = useState<EntryQueueItem | null>(null);
  const [exitItem, setExitItem] = useState<ExitReviewItem | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [lastSignalAt, setLastSignalAt] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<string>('initialized');
  const [subscriptionState, setSubscriptionState] = useState<DssChannelSubscriptionState>('idle');
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [processingVisitorId, setProcessingVisitorId] = useState<number | null>(null);
  const [processingReviewId, setProcessingReviewId] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<SimilarPlate[]>([]);
  const [expectedTasks, setExpectedTasks] = useState<ExpectedTask[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingExpectedTasks, setLoadingExpectedTasks] = useState(false);
  const [manualSearchResults, setManualSearchResults] = useState<ExitCandidate[]>([]);
  const [manualSearchLoading, setManualSearchLoading] = useState(false);
  const [imagePreview, setImagePreview] = useState<{ open: boolean; src: string; title: string }>({ open: false, src: '', title: '' });
  const [entryConfirmDialog, setEntryConfirmDialog] = useState({ open: false, item: null as EntryQueueItem | null, correctedPlate: '', selectedTruckId: null as number | null, selectedTaskId: null as number | null, createPermit: false, createWeighing: false, openBarrier: false, comment: '' });
  const [exitConfirmDialog, setExitConfirmDialog] = useState({ open: false, item: null as ExitReviewItem | null, selectedVisitorId: null as number | null, correctedPlate: '' });

  const selectedCheckpoint = useMemo(() => checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) ?? null, [checkpoints, selectedCheckpointId]);
  const resolvedConfirmTruck = useMemo<ConfirmResolvedTruck>(() => {
    const normalizedCorrectedPlate = normalizePlateNumber(entryConfirmDialog.correctedPlate);
    const selectedTruckCandidate = searchResults.find((truck) => truck.truck_id === entryConfirmDialog.selectedTruckId) ?? null;
    const selectedTruck = selectedTruckCandidate && normalizePlateNumber(selectedTruckCandidate.plate_number) === normalizedCorrectedPlate ? selectedTruckCandidate : null;
    if (selectedTruck) return { truckId: selectedTruck.truck_id, hasPermit: selectedTruck.has_permit, isNew: false };
    if (!normalizedCorrectedPlate) return { truckId: null, hasPermit: entryConfirmDialog.item?.has_permit ?? false, isNew: false };
    const matchedByPlate = searchResults.find((truck) => normalizePlateNumber(truck.plate_number) === normalizedCorrectedPlate);
    return matchedByPlate ? { truckId: matchedByPlate.truck_id, hasPermit: matchedByPlate.has_permit, isNew: false } : { truckId: null, hasPermit: false, isNew: true };
  }, [entryConfirmDialog.correctedPlate, entryConfirmDialog.item?.has_permit, entryConfirmDialog.selectedTruckId, searchResults]);

  const loadCheckpoints = useCallback(async () => {
    setLoadingCheckpoints(true);
    try {
      const response = await axios.post('/entrance-permit/getallcheckpoints', {}, { headers: getAuthHeaders() });
      const items: Checkpoint[] = response.data?.data ?? [];
      setCheckpoints(items);
      if (!selectedCheckpointId && items.length > 0) setSelectedCheckpointId(items[0].id);
    } catch (error) {
      console.error('Ошибка загрузки КПП:', error);
      toast.error('Не удалось загрузить список КПП');
    } finally {
      setLoadingCheckpoints(false);
    }
  }, [selectedCheckpointId]);

  const loadSnapshot = useCallback(async () => {
    if (!selectedCheckpointId) {
      setEntryItem(null);
      setExitItem(null);
      return;
    }
    setLoadingSnapshot(true);
    try {
      const [entryResponse, exitResponse] = await Promise.all([
        axios.post('/security/checkpoint-review-queue', { checkpoint_id: selectedCheckpointId, limit: 1 }, { headers: getAuthHeaders() }),
        axios.post('/security/checkpoint-exit-review-queue', { checkpoint_id: selectedCheckpointId, limit: 1 }, { headers: getAuthHeaders() }),
      ]);
      setEntryItem((entryResponse.data?.data ?? [])[0] ?? null);
      setExitItem((exitResponse.data?.data ?? [])[0] ?? null);
      setLastUpdatedAt(new Date());
    } catch (error) {
      console.error('Ошибка загрузки snapshot КПП:', error);
    } finally {
      setLoadingSnapshot(false);
    }
  }, [selectedCheckpointId]);

  const loadExpectedTasks = useCallback(async (yardId: number) => {
    setLoadingExpectedTasks(true);
    try {
      const response = await axios.post('/security/getexpectedvehicles', { yard_id: yardId }, { headers: getAuthHeaders() });
      if (response.data?.status) setExpectedTasks(response.data.data ?? []);
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
      const response = await axios.post('/security/searchsimilarplates', { plate_number: plate, yard_id: yardId }, { headers: getAuthHeaders() });
      if (response.data?.status) setSearchResults(response.data.data ?? []);
    } catch (error) {
      console.error('Ошибка поиска похожих номеров:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const searchActiveVisitors = useCallback(async (plate: string, yardId: number, fallback: ExitCandidate[] = []) => {
    if (plate.trim().length < 2) {
      setManualSearchResults(fallback);
      return;
    }
    setManualSearchLoading(true);
    try {
      const response = await axios.post('/security/search-active-visitors-for-exit', { yard_id: yardId, plate_number: plate }, { headers: getAuthHeaders() });
      setManualSearchResults(response.data?.status ? response.data.data ?? [] : []);
    } catch (error) {
      console.error('Ошибка поиска активных визитов для выезда:', error);
      setManualSearchResults([]);
    } finally {
      setManualSearchLoading(false);
    }
  }, []);

  useEffect(() => { loadCheckpoints(); }, [loadCheckpoints]);
  useEffect(() => {
    if (!selectedCheckpointId) return;
    loadSnapshot();
    const interval = window.setInterval(loadSnapshot, 10000);
    return () => window.clearInterval(interval);
  }, [selectedCheckpointId, loadSnapshot]);
  useEffect(() => {
    const unbindConnection = bindDssAlarmConnectionDebug((state) => setConnectionState(state));
    const unsubscribe = subscribeToDssUnknownVehicleDetected(
      () => {
        setLastSignalAt(new Date().toISOString());
        void loadSnapshot();
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
    return () => { unbindConnection(); unsubscribe(); };
  }, [loadSnapshot]);
  useEffect(() => {
    const item = entryConfirmDialog.item;
    if (!entryConfirmDialog.open || !item) return;
    loadExpectedTasks(item.yard_id);
  }, [entryConfirmDialog.open, entryConfirmDialog.item, loadExpectedTasks]);
  useEffect(() => {
    const item = entryConfirmDialog.item;
    if (!entryConfirmDialog.open || !item) return;
    const timeoutId = window.setTimeout(() => { searchSimilarPlates(entryConfirmDialog.correctedPlate, item.yard_id); }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [entryConfirmDialog.correctedPlate, entryConfirmDialog.item, entryConfirmDialog.open, searchSimilarPlates]);
  useEffect(() => {
    const item = exitConfirmDialog.item;
    if (!exitConfirmDialog.open || !item) return;
    const timeoutId = window.setTimeout(() => { searchActiveVisitors(exitConfirmDialog.correctedPlate, item.yard_id, item.candidate_visitors); }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [exitConfirmDialog.correctedPlate, exitConfirmDialog.item, exitConfirmDialog.open, searchActiveVisitors]);

  const openImagePreview = (src: string, title: string) => setImagePreview({ open: true, src, title });
  const closeImagePreview = () => setImagePreview({ open: false, src: '', title: '' });
  const openEntryConfirmDialog = (item: EntryQueueItem) => { setEntryConfirmDialog({ open: true, item, correctedPlate: item.matched_plate_number || item.plate_number, selectedTruckId: item.matched_truck_id ?? null, selectedTaskId: item.task_id ?? null, createPermit: false, createWeighing: false, openBarrier: false, comment: '' }); setSearchResults([]); setExpectedTasks([]); };
  const closeEntryConfirmDialog = () => { setEntryConfirmDialog({ open: false, item: null, correctedPlate: '', selectedTruckId: null, selectedTaskId: null, createPermit: false, createWeighing: false, openBarrier: false, comment: '' }); setSearchResults([]); setExpectedTasks([]); };
  const openExitConfirmDialog = (item: ExitReviewItem) => { setExitConfirmDialog({ open: true, item, selectedVisitorId: item.candidate_visitors.length === 1 ? item.candidate_visitors[0].visitor_id : null, correctedPlate: item.plate_number }); setManualSearchResults(item.candidate_visitors); };
  const closeExitConfirmDialog = () => { setExitConfirmDialog({ open: false, item: null, selectedVisitorId: null, correctedPlate: '' }); setManualSearchResults([]); };

  const handleEntryConfirm = async () => {
    const item = entryConfirmDialog.item; if (!item) return;
    const userId = Number(localStorage.getItem('user_id') || '1');
    setProcessingVisitorId(item.visitor_id);
    const hasPermit = resolvedConfirmTruck.hasPermit;
    const willCreatePermit = entryConfirmDialog.createPermit && !hasPermit;
    const shouldOpenBarrier = entryConfirmDialog.openBarrier && !!item.can_open_barrier;
    if (item.yard_strict_mode && !hasPermit && !willCreatePermit) { toast.error('🚫 Въезд запрещён: строгий режим активен, требуется разрешение на въезд'); setProcessingVisitorId(null); return; }
    try {
      const response = await axios.post('/security/confirmvisitor', { visitor_id: item.visitor_id, operator_user_id: userId, truck_id: entryConfirmDialog.selectedTruckId ?? undefined, task_id: entryConfirmDialog.selectedTaskId ?? undefined, corrected_plate_number: entryConfirmDialog.correctedPlate || item.plate_number, comment: entryConfirmDialog.comment.trim() || undefined, create_permit: willCreatePermit, create_weighing: entryConfirmDialog.createWeighing, open_barrier: shouldOpenBarrier }, { headers: getAuthHeaders() });
      if (response.data?.status) {
        const confirmedTruckId = Number(response.data?.data?.truck_id || 0) || null;
        if (entryConfirmDialog.createWeighing && !willCreatePermit) {
          try {
            await axios.post('/weighing/create-requirement', { yard_id: item.yard_id, visitor_id: item.visitor_id, plate_number: entryConfirmDialog.correctedPlate || item.plate_number, truck_id: confirmedTruckId ?? undefined, task_id: entryConfirmDialog.selectedTaskId ?? undefined }, { headers: getAuthHeaders() });
          } catch {
            console.error('Не удалось создать задание на взвешивание');
          }
        }
        toast.success(willCreatePermit ? 'Въезд подтверждён, разовый пропуск создан' : 'Въезд подтверждён');
        if (shouldOpenBarrier) {
          if (response.data?.data?.barrier_opened) toast.success('Шлагбаум открыт'); else toast.error(response.data?.data?.barrier_open_error || 'Въезд подтверждён, но шлагбаум не открылся');
        }
        closeEntryConfirmDialog();
        await loadSnapshot();
      }
    } catch (error: any) {
      console.error('Ошибка подтверждения въезда:', error);
      toast.error(error.response?.data?.message || 'Не удалось подтвердить въезд');
    } finally { setProcessingVisitorId(null); }
  };

  const handleEntryReject = async (item: EntryQueueItem) => {
    const userId = Number(localStorage.getItem('user_id') || '1');
    setProcessingVisitorId(item.visitor_id);
    try {
      const response = await axios.post('/security/rejectvisitor', { visitor_id: item.visitor_id, operator_user_id: userId, reason: 'Отклонено оператором КПП' }, { headers: getAuthHeaders() });
      if (response.data?.status) { toast.success('Въезд отклонён'); await loadSnapshot(); }
    } catch (error: any) {
      console.error('Ошибка отклонения въезда:', error);
      toast.error(error.response?.data?.message || 'Не удалось отклонить въезд');
    } finally { setProcessingVisitorId(null); }
  };

  const handleExitConfirm = async () => {
    const item = exitConfirmDialog.item; if (!item) return;
    if (!exitConfirmDialog.selectedVisitorId) { toast.error('Выберите активный визит для подтверждения выезда'); return; }
    setProcessingReviewId(item.review_id);
    const userId = Number(localStorage.getItem('user_id') || '1');
    try {
      const response = await axios.post('/security/confirm-exit-review', { review_id: item.review_id, operator_user_id: userId, visitor_id: exitConfirmDialog.selectedVisitorId ?? undefined }, { headers: getAuthHeaders() });
      if (response.data?.status) { toast.success('Выезд подтверждён'); closeExitConfirmDialog(); await loadSnapshot(); }
    } catch (error: any) {
      console.error('Ошибка подтверждения выезда:', error);
      toast.error(error.response?.data?.message || 'Не удалось подтвердить выезд');
    } finally { setProcessingReviewId(null); }
  };

  const handleExitReject = async (item: ExitReviewItem) => {
    setProcessingReviewId(item.review_id);
    const userId = Number(localStorage.getItem('user_id') || '1');
    try {
      const response = await axios.post('/security/reject-exit-review', { review_id: item.review_id, operator_user_id: userId, reason: 'Отклонено оператором КПП' }, { headers: getAuthHeaders() });
      if (response.data?.status) { toast.success('Событие выезда отклонено'); await loadSnapshot(); }
    } catch (error: any) {
      console.error('Ошибка отклонения выезда:', error);
      toast.error(error.response?.data?.message || 'Не удалось отклонить событие выезда');
    } finally { setProcessingReviewId(null); }
  };

  const renderEntryBlock = () => {
    if (!selectedCheckpointId) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Выберите КПП, чтобы получать события въезда.</div>;
    if (loadingSnapshot && !entryItem) return <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Загружаем последнее событие въезда...</div>;
    if (!entryItem) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Для выбранного КПП новых событий въезда пока нет.</div>;
    const isProcessing = processingVisitorId === entryItem.visitor_id;
    const isConfirmed = entryItem.confirmation_status === 'confirmed';
    const isRejected = entryItem.confirmation_status === 'rejected';
    const isResolved = isConfirmed || isRejected;
    return <div className="overflow-hidden rounded-xl border bg-card"><div className="grid gap-4 p-4 xl:grid-cols-[220px_minmax(0,1fr)_auto]"><div className="group relative overflow-hidden rounded-lg border bg-muted/30">{entryItem.capture_picture_url ? <button type="button" onClick={() => openImagePreview(entryItem.capture_picture_url!, `ТС ${entryItem.plate_number}`)} className="block h-full w-full cursor-zoom-in"><img src={entryItem.capture_picture_url} alt={`ТС ${entryItem.plate_number}`} className="h-44 w-full object-cover transition-transform duration-300 group-hover:scale-110" /></button> : <div className="flex h-44 items-center justify-center text-muted-foreground"><Camera className="h-8 w-8" /></div>}</div><div className="space-y-3"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-2xl font-bold tracking-wide">{entryItem.plate_number}</span>{entryItem.original_plate_number && entryItem.original_plate_number !== entryItem.plate_number && <Badge variant="outline">OCR: {entryItem.original_plate_number}</Badge>}<Badge variant={isConfirmed ? 'default' : 'secondary'} className={isRejected ? 'bg-red-100 text-red-700 hover:bg-red-100' : undefined}>{isConfirmed ? 'Въезд подтверждён' : isRejected ? 'Въезд отклонён' : 'Ожидает решения'}</Badge><Badge className={getConfidenceBadgeClass(entryItem.recognition_confidence)}>{entryItem.recognition_confidence != null ? `${entryItem.recognition_confidence}%` : 'Уверенность n/a'}</Badge></div><div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-3"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4" /><span>{formatDateTime(entryItem.capture_time || entryItem.entry_date)}</span></div><div className="flex items-center gap-2"><Camera className="h-4 w-4" /><span>{entryItem.device_name || 'Камера не указана'}</span></div><div className="flex items-center gap-2"><MapPin className="h-4 w-4" /><span>{entryItem.yard_name || 'Двор не указан'}</span></div></div><div className="text-sm text-muted-foreground">Последняя фиксация: <span className="font-medium text-foreground">{formatRelativeSeconds(entryItem.capture_time || entryItem.entry_date)}</span></div>{entryItem.pending_reason_text && !isResolved && <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{entryItem.pending_reason_text}</span></div>}<div className="flex flex-wrap gap-2"><Badge variant={entryItem.has_permit ? 'default' : 'outline'}><KeyRound className="h-3 w-3" />{entryItem.has_permit ? `Разрешение ${entryItem.permit_type === 'one_time' ? 'разовое' : 'есть'}` : 'Без разрешения'}</Badge><Badge variant={entryItem.has_loading_task ? 'default' : 'outline'}><Package className="h-3 w-3" />{entryItem.has_loading_task ? `Погрузка: ${entryItem.loading_points_count}` : 'Погрузки нет'}</Badge><Badge variant={entryItem.has_weighing_task ? 'default' : 'outline'}><Scale className="h-3 w-3" />{entryItem.has_weighing_task ? 'Нужно взвешивание' : 'Без взвешивания'}</Badge><Badge variant={entryItem.matched_truck_id ? 'secondary' : 'outline'}><Truck className="h-3 w-3" />{entryItem.matched_plate_number || 'ТС не сопоставлено'}</Badge></div><div className="grid gap-2 text-sm sm:grid-cols-2"><div><span className="text-muted-foreground">Задание:</span> <span className="font-medium">{entryItem.task_name || 'Не найдено'}</span></div><div><span className="text-muted-foreground">Причина визита:</span> <span className="font-medium">{entryItem.pending_reason_text || entryItem.weighing_reason || 'Требуется проверка'}</span></div></div></div><div className="flex flex-col justify-between gap-3 xl:min-w-40"><div className="text-right text-xs text-muted-foreground">Visitor #{entryItem.visitor_id}</div>{isResolved ? <div className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">{isConfirmed ? 'Событие уже подтверждено' : 'Событие уже отклонено'}</div> : <div className="flex flex-col gap-2"><Button onClick={() => openEntryConfirmDialog(entryItem)} disabled={isProcessing} className="w-full">{isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Разрешить въезд</Button><Button variant="destructive" onClick={() => handleEntryReject(entryItem)} disabled={isProcessing} className="w-full"><XCircle className="h-4 w-4" />Отклонить</Button></div>}</div></div></div>;
  };

  const renderExitBlock = () => {
    if (!selectedCheckpointId) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Выберите КПП, чтобы получать события выезда.</div>;
    if (loadingSnapshot && !exitItem) return <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Загружаем последнее событие выезда...</div>;
    if (!exitItem) return <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Для выбранного КПП новых событий выезда пока нет.</div>;
    const isProcessing = processingReviewId === exitItem.review_id;
    const isResolved = exitItem.status !== 'pending';
    const isConfirmed = exitItem.status === 'confirmed';
    const isRejected = exitItem.status === 'rejected';
    return <div className="overflow-hidden rounded-xl border bg-card"><div className="grid gap-4 p-4 xl:grid-cols-[220px_minmax(0,1fr)_auto]"><div className="group relative overflow-hidden rounded-lg border bg-muted/30">{exitItem.capture_picture_url ? <button type="button" onClick={() => openImagePreview(exitItem.capture_picture_url!, `Выезд ${exitItem.plate_number}`)} className="block h-full w-full cursor-zoom-in"><img src={exitItem.capture_picture_url} alt={`Выезд ${exitItem.plate_number}`} className="h-44 w-full object-cover transition-transform duration-300 group-hover:scale-110" /></button> : <div className="flex h-44 items-center justify-center text-muted-foreground"><Camera className="h-8 w-8" /></div>}</div><div className="space-y-3"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-2xl font-bold tracking-wide">{exitItem.plate_number}</span><Badge variant={isConfirmed ? 'default' : 'secondary'} className={isRejected ? 'bg-red-100 text-red-700 hover:bg-red-100' : undefined}>{isConfirmed ? 'Выезд подтверждён' : isRejected ? 'Выезд отклонён' : 'Ожидает решения'}</Badge><Badge className={getConfidenceBadgeClass(exitItem.recognition_confidence)}>{exitItem.recognition_confidence != null ? `${exitItem.recognition_confidence}%` : 'Уверенность n/a'}</Badge><Badge variant="secondary">Кандидатов: {exitItem.candidate_visitors.length}</Badge></div><div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-3"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4" /><span>{formatDateTime(exitItem.capture_time)}</span></div><div className="flex items-center gap-2"><Camera className="h-4 w-4" /><span>{exitItem.device_name || 'Камера не указана'}</span></div><div className="flex items-center gap-2"><MapPin className="h-4 w-4" /><span>{exitItem.yard_name || 'Двор не указан'}</span></div></div><div className="rounded-lg border p-3 text-sm"><div className="mb-2 font-medium">Связанные визиты</div>{exitItem.candidate_visitors.length === 0 ? <div className="text-muted-foreground">Активные визиты по этому номеру не найдены.</div> : <div className="flex flex-wrap gap-2">{exitItem.candidate_visitors.map((candidate) => <Badge key={candidate.visitor_id} variant="outline">#{candidate.visitor_id} • {candidate.plate_number} • {getConfirmationStatusLabel(candidate.confirmation_status)}{candidate.task_name ? ` • ${candidate.task_name}` : ''}</Badge>)}</div>}</div><div className="grid gap-2 text-sm sm:grid-cols-2"><div><span className="text-muted-foreground">Причина:</span> <span className="font-medium">{exitItem.note || 'Требуется проверка выезда'}</span></div><div><span className="text-muted-foreground">Последняя фиксация:</span> <span className="font-medium">{formatRelativeSeconds(exitItem.capture_time)}</span></div></div></div><div className="flex flex-col justify-between gap-3 xl:min-w-40"><div className="text-right text-xs text-muted-foreground">Review #{exitItem.review_id}</div>{isResolved ? <div className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">{isConfirmed ? 'Событие выезда уже подтверждено' : 'Событие выезда уже отклонено'}</div> : <div className="flex flex-col gap-2"><Button onClick={() => openExitConfirmDialog(exitItem)} disabled={isProcessing} className="w-full"><CheckCircle2 className="h-4 w-4" />Подтвердить выезд</Button><Button variant="destructive" onClick={() => handleExitReject(exitItem)} disabled={isProcessing} className="w-full"><XCircle className="h-4 w-4" />Отклонить</Button></div>}</div></div></div>;
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Card className="gap-0 py-0"><CardContent className="px-4 py-4 sm:px-6"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><div className="text-sm font-medium">Единое рабочее место КПП по live-событиям DSS</div><div className="text-sm text-muted-foreground">Охрана выбирает КПП и работает только с последним событием на въезд и выезд через защищённый приватный канал.</div></div><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><select value={selectedCheckpointId ?? ''} onChange={(event) => setSelectedCheckpointId(Number(event.target.value) || null)} className="h-10 min-w-72 rounded-md border border-input bg-background px-3 text-sm" disabled={loadingCheckpoints}><option value="">Выберите КПП</option>{checkpoints.map((checkpoint) => <option key={checkpoint.id} value={checkpoint.id}>{checkpoint.name}{checkpoint.yard_name ? ` — ${checkpoint.yard_name}` : ''}</option>)}</select><Button variant="outline" onClick={loadSnapshot} disabled={!selectedCheckpointId || loadingSnapshot}><RefreshCw className={`h-4 w-4 ${loadingSnapshot ? 'animate-spin' : ''}`} />Обновить</Button></div></div></CardContent></Card>
      {subscriptionState === 'error' && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /><div><div className="font-medium">Нет доступа к приватному каналу DSS</div><div>{subscriptionError}</div></div></div>}
      <div className="grid gap-4 xl:grid-cols-5"><div className="rounded-xl border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"><div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400"><MapPin className="h-4 w-4" />КПП</div><div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{selectedCheckpoint ? `${selectedCheckpoint.name}${selectedCheckpoint.yard_name ? ` • ${selectedCheckpoint.yard_name}` : ''}` : 'Не выбрано'}</div></div><div className="rounded-xl border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"><div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400"><Wifi className="h-4 w-4" />WebSocket</div><div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${connectionState === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{connectionState === 'connected' ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}{connectionState}</div></div><div className="rounded-xl border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"><div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400"><ShieldCheck className="h-4 w-4" />Канал DSS</div><div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${getSubscriptionBadgeClass(subscriptionState)}`}>{subscriptionState === 'subscribed' ? <ShieldCheck className="h-4 w-4" /> : subscriptionState === 'error' ? <ShieldAlert className="h-4 w-4" /> : <Loader2 className={`h-4 w-4 ${subscriptionState === 'subscribing' ? 'animate-spin' : ''}`} />}{getSubscriptionLabel(subscriptionState)}</div></div><div className="rounded-xl border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"><div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400"><Radio className="h-4 w-4" />Последний сигнал DSS</div><div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatDateTime(lastSignalAt)}</div></div><div className="rounded-xl border bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"><div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400"><Clock3 className="h-4 w-4" />Snapshot</div><div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatDateTime(lastUpdatedAt?.toISOString() ?? null)}</div></div></div>
      <div className="grid gap-4 xl:grid-cols-2"><Card className="gap-0 py-0"><CardHeader className="border-b px-4 py-4 sm:px-6"><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-blue-600" />Заезд</CardTitle><CardDescription>Последнее событие въезда по выбранному КПП. Без очереди, только актуальная карточка.</CardDescription></CardHeader><CardContent className="px-4 py-4 sm:px-6">{renderEntryBlock()}</CardContent></Card><Card className="gap-0 py-0"><CardHeader className="border-b px-4 py-4 sm:px-6"><CardTitle className="flex items-center gap-2 text-lg"><ArrowRightLeft className="h-5 w-5 text-orange-600" />Выезд</CardTitle><CardDescription>Последнее спорное событие выезда по выбранному КПП с выбором активного визита.</CardDescription></CardHeader><CardContent className="px-4 py-4 sm:px-6">{renderExitBlock()}</CardContent></Card></div>
      <Dialog open={entryConfirmDialog.open} onOpenChange={(open) => !open && closeEntryConfirmDialog()}><DialogContent className="flex max-h-[95vh] flex-col sm:max-h-[90vh] sm:max-w-4xl"><DialogHeader className="shrink-0"><DialogTitle>Подтверждение въезда на КПП</DialogTitle><DialogDescription>Охранник может скорректировать номер, выбрать ТС и привязать задание перед подтверждением въезда.</DialogDescription></DialogHeader>{entryConfirmDialog.item && <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto pr-1 lg:grid-cols-[260px_minmax(0,1fr)]"><div className="space-y-3"><div className="group relative overflow-hidden rounded-lg border bg-muted/20">{entryConfirmDialog.item.capture_picture_url ? <button type="button" onClick={() => openImagePreview(entryConfirmDialog.item!.capture_picture_url!, `Фото ${entryConfirmDialog.item!.plate_number}`)} className="block h-full w-full cursor-zoom-in"><img src={entryConfirmDialog.item.capture_picture_url} alt={`Фото ${entryConfirmDialog.item.plate_number}`} className="h-52 w-full object-cover transition-transform duration-300 group-hover:scale-110" /></button> : <div className="flex h-52 items-center justify-center text-muted-foreground"><Camera className="h-8 w-8" /></div>}</div><div className="rounded-lg border p-3 text-sm"><div><span className="text-muted-foreground">Распознанный номер:</span> <span className="font-mono font-semibold">{entryConfirmDialog.item.plate_number}</span></div><div><span className="text-muted-foreground">КПП:</span> {selectedCheckpoint?.name || '—'}</div><div><span className="text-muted-foreground">Камера:</span> {entryConfirmDialog.item.device_name || '—'}</div><div><span className="text-muted-foreground">Причина:</span> {entryConfirmDialog.item.pending_reason_text || 'Требуется проверка'}</div></div></div><div className="space-y-4"><div className="space-y-2"><label className="text-sm font-medium">Скорректированный номер</label><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={entryConfirmDialog.correctedPlate} onChange={(event) => setEntryConfirmDialog((prev) => ({ ...prev, correctedPlate: event.target.value.toUpperCase() }))} className="pl-9 font-mono" placeholder="Введите номер ТС" /></div></div><div className="space-y-2"><div className="flex items-center justify-between"><label className="text-sm font-medium">Подходящие ТС</label>{searching && <span className="text-xs text-muted-foreground">Поиск...</span>}</div><div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border p-2">{searchResults.length === 0 ? <div className="px-2 py-3 text-sm text-muted-foreground">Совпадения не найдены. Можно подтвердить только с ручной коррекцией номера.</div> : searchResults.map((truck) => { const selected = entryConfirmDialog.selectedTruckId === truck.truck_id; return <button key={truck.truck_id} type="button" onClick={() => setEntryConfirmDialog((prev) => ({ ...prev, selectedTruckId: truck.truck_id, selectedTaskId: prev.selectedTaskId ?? truck.task_id ?? null, correctedPlate: truck.plate_number }))} className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${selected ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-muted/50'}`}><div className="flex items-center justify-between gap-2"><span className="font-mono font-semibold">{truck.plate_number}</span><Badge variant={truck.has_permit ? 'default' : 'outline'}>{truck.has_permit ? 'Есть разрешение' : 'Без разрешения'}</Badge></div><div className="mt-1 text-xs text-muted-foreground">Совпадение: {truck.similarity_percent}%{truck.task_name ? ` • ${truck.task_name}` : ''}</div></button>; })}</div></div><div className="space-y-2"><div className="flex items-center justify-between"><label className="text-sm font-medium">Ожидаемые задания</label>{loadingExpectedTasks && <span className="text-xs text-muted-foreground">Загрузка...</span>}</div><div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-2">{expectedTasks.length === 0 ? <div className="px-2 py-3 text-sm text-muted-foreground">На выбранный двор ожидаемых заданий не найдено.</div> : expectedTasks.map((task) => { const selected = entryConfirmDialog.selectedTaskId === task.id; return <button key={task.id} type="button" onClick={() => setEntryConfirmDialog((prev) => ({ ...prev, selectedTaskId: task.id, selectedTruckId: prev.selectedTruckId ?? task.truck_id ?? null, correctedPlate: prev.correctedPlate || task.plate_number || '' }))} className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${selected ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'hover:bg-muted/50'}`}><div className="font-medium">{task.name}</div><div className="mt-1 text-xs text-muted-foreground">{task.plate_number || 'Без привязанного номера'}{task.driver_name ? ` • ${task.driver_name}` : ''}{task.plan_date ? ` • ${formatDateTime(task.plan_date)}` : ''}</div></button>; })}</div></div><div className="space-y-2"><label className="text-sm font-medium">Цель визита</label><textarea value={entryConfirmDialog.comment} onChange={(event) => setEntryConfirmDialog((prev) => ({ ...prev, comment: event.target.value }))} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Например: загрузка зерна, доставка комбикорма..." rows={2} maxLength={500} /></div><div className="flex flex-wrap gap-2"><Badge variant={entryConfirmDialog.item.has_permit ? 'default' : 'outline'}><KeyRound className="h-3 w-3" />{entryConfirmDialog.item.has_permit ? 'Разрешение найдено' : 'Разрешение не найдено'}</Badge><Badge variant={entryConfirmDialog.item.has_loading_task ? 'default' : 'outline'}><Package className="h-3 w-3" />{entryConfirmDialog.item.has_loading_task ? `Погрузка: ${entryConfirmDialog.item.loading_points_count}` : 'Без погрузки'}</Badge><Badge variant={entryConfirmDialog.item.has_weighing_task ? 'default' : 'outline'}><Scale className="h-3 w-3" />{entryConfirmDialog.item.has_weighing_task ? 'Нужно взвешивание' : 'Без взвешивания'}</Badge></div>{(!entryConfirmDialog.item.has_permit || !entryConfirmDialog.item.has_weighing_task || entryConfirmDialog.item.can_open_barrier) && <div className="space-y-3 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-950/20"><div className="text-sm font-medium text-blue-800 dark:text-blue-300">Дополнительные действия</div>{!entryConfirmDialog.item.has_permit && <label className="flex items-start gap-3 cursor-pointer"><Checkbox checked={entryConfirmDialog.createPermit} onCheckedChange={(checked) => setEntryConfirmDialog((prev) => ({ ...prev, createPermit: !!checked }))} className="mt-0.5" disabled={!normalizePlateNumber(entryConfirmDialog.correctedPlate)} /><div className="space-y-0.5"><div className="text-sm font-medium">Создать разовый пропуск</div><div className="text-xs text-muted-foreground">{!normalizePlateNumber(entryConfirmDialog.correctedPlate) ? 'Сначала укажите корректный номер ТС' : resolvedConfirmTruck.isNew ? 'Если ТС нет в базе, оно будет создано автоматически вместе с пропуском' : 'Будет создано разовое разрешение на въезд для выбранного ТС'}</div></div></label>}{!entryConfirmDialog.item.has_weighing_task && <label className="flex items-start gap-3 cursor-pointer"><Checkbox checked={entryConfirmDialog.createWeighing} onCheckedChange={(checked) => setEntryConfirmDialog((prev) => ({ ...prev, createWeighing: !!checked }))} className="mt-0.5" /><div className="space-y-0.5"><div className="text-sm font-medium">Назначить взвешивание</div><div className="text-xs text-muted-foreground">Будет создано задание на взвешивание (въезд + выезд)</div></div></label>}{entryConfirmDialog.item.can_open_barrier && <label className="flex items-start gap-3 cursor-pointer"><Checkbox checked={entryConfirmDialog.openBarrier} onCheckedChange={(checked) => setEntryConfirmDialog((prev) => ({ ...prev, openBarrier: !!checked }))} className="mt-0.5" /><div className="space-y-0.5"><div className="text-sm font-medium">Открыть шлагбаум</div><div className="text-xs text-muted-foreground">После подтверждения будет отправлена команда DSS на прямое открытие шлагбаума</div></div></label>}</div>}</div></div>}<DialogFooter className="shrink-0 border-t pt-4"><Button variant="outline" onClick={closeEntryConfirmDialog}>Отмена</Button><Button onClick={handleEntryConfirm} disabled={!entryConfirmDialog.item || processingVisitorId === entryConfirmDialog.item?.visitor_id}>{processingVisitorId === entryConfirmDialog.item?.visitor_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Подтвердить въезд</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={exitConfirmDialog.open} onOpenChange={(open) => !open && closeExitConfirmDialog()}><DialogContent className="sm:max-w-3xl"><DialogHeader><DialogTitle>Подтверждение выезда</DialogTitle><DialogDescription>Выберите активный визит, который нужно закрыть по событию выезда камеры.</DialogDescription></DialogHeader>{exitConfirmDialog.item && <div className="space-y-4"><div className="rounded-lg border bg-muted/30 p-3 text-sm"><div><span className="text-muted-foreground">Распознанный номер:</span> <span className="font-mono font-semibold">{exitConfirmDialog.item.plate_number}</span></div><div><span className="text-muted-foreground">Время:</span> {formatDateTime(exitConfirmDialog.item.capture_time)}</div></div><div className="space-y-2"><label className="text-sm font-medium">Скорректированный номер / поиск активного визита</label><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={exitConfirmDialog.correctedPlate} onChange={(event) => setExitConfirmDialog((prev) => ({ ...prev, correctedPlate: event.target.value.toUpperCase(), selectedVisitorId: null }))} className="pl-9 font-mono" placeholder="Введите правильный номер ТС" /></div></div><div className="space-y-2">{manualSearchLoading ? <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Ищем активные визиты...</div> : manualSearchResults.length === 0 ? <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">По текущему номеру активные визиты не найдены. Можно уточнить номер и повторить поиск.</div> : manualSearchResults.map((candidate) => { const selected = exitConfirmDialog.selectedVisitorId === candidate.visitor_id; return <button key={candidate.visitor_id} type="button" onClick={() => setExitConfirmDialog((prev) => ({ ...prev, selectedVisitorId: candidate.visitor_id }))} className={`w-full rounded-lg border p-3 text-left transition ${selected ? 'border-blue-600 bg-blue-50' : 'hover:bg-muted/40'}`}><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">Визит #{candidate.visitor_id}</span><Badge variant="outline">{candidate.plate_number}</Badge><Badge variant="secondary">{getConfirmationStatusLabel(candidate.confirmation_status)}</Badge>{candidate.is_exact_truck_match && <Badge className="bg-emerald-100 text-emerald-700">Совпадает ТС</Badge>}{candidate.is_exact_plate_match && <Badge className="bg-blue-100 text-blue-700">Совпадает номер</Badge>}</div><div className="mt-2 text-sm text-muted-foreground">Въезд: {formatDateTime(candidate.entry_date)}{candidate.task_name ? ` • Задание: ${candidate.task_name}` : ''}</div></button>; })}</div></div>}<DialogFooter><Button variant="outline" onClick={closeExitConfirmDialog}>Отмена</Button><Button onClick={handleExitConfirm} disabled={processingReviewId === exitConfirmDialog.item?.review_id}><ShieldCheck className="h-4 w-4" />Подтвердить выезд</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={imagePreview.open} onOpenChange={(open) => !open && closeImagePreview()}><DialogContent className="h-[96vh] w-[98vw] max-w-[98vw] border-0 bg-black/95 p-2 text-white [&>button]:text-white [&>button]:opacity-90 [&>button]:ring-white/30 [&>button]:hover:bg-white/10 [&>button]:hover:text-white sm:h-[98vh] sm:w-[98vw] sm:max-w-[98vw] sm:p-4" onClick={closeImagePreview}><DialogHeader className="sr-only"><DialogTitle>{imagePreview.title}</DialogTitle></DialogHeader>{imagePreview.src && <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-lg" onClick={(event) => event.stopPropagation()}><img src={imagePreview.src} alt={imagePreview.title} className="max-h-[92vh] w-auto max-w-full rounded-lg object-contain sm:max-h-[94vh]" /></div>}</DialogContent></Dialog>
    </div>
  );
}