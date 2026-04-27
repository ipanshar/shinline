import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  ArrowRightLeft,
  Camera,
  CheckCircle2,
  Clock3,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  bindDssAlarmConnectionDebug,
  subscribeToDssUnknownVehicleDetected,
  type DssChannelSubscriptionState,
  type DssUnknownVehicleDetectedEvent,
} from '@/lib/dss-alarms';

const MAX_EVENTS = 20;

type CheckpointQueueItem = {
  visitor_id: number;
  plate_number: string;
  original_plate_number?: string | null;
  confirmation_status: 'pending' | 'confirmed' | 'rejected';
  confirmed_at?: string | null;
  entry_date: string;
  recognition_confidence?: number | null;
  yard_id: number;
  yard_name?: string | null;
  yard_strict_mode: boolean;
  checkpoint_id: number;
  device_name?: string | null;
  can_open_barrier?: boolean;
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
  capture_id?: number | null;
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

type ConfirmResolvedTruck = {
  truckId: number | null;
  hasPermit: boolean;
  isNew: boolean;
};

type CheckpointOption = {
  id: number;
  name: string;
  yard_id?: number | null;
  yard_name?: string | null;
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const parseDateValue = (value?: string | number | Date | null) => {
  if (value == null) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number') {
    const normalized = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) return null;

  if (/^\d+$/.test(normalizedValue)) {
    const numericValue = Number(normalizedValue);
    if (!Number.isNaN(numericValue)) {
      const normalized = normalizedValue.length <= 10 ? numericValue * 1000 : numericValue;
      const date = new Date(normalized);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }

  const date = new Date(normalizedValue);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = parseDateValue(value);
  if (!date) return value;
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
  const date = parseDateValue(value);
  if (!date) return '—';
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  const minutes = Math.floor(diffSec / 60);
  const seconds = diffSec % 60;
  return minutes > 0 ? `${minutes}м ${seconds}с назад` : `${seconds}с назад`;
};

const normalizePlateNumber = (value?: string | null) => value?.replace(/[\s-]+/g, '').toUpperCase() ?? '';

const toEpoch = (value?: string | null) => {
  const date = parseDateValue(value);
  return date ? date.getTime() : null;
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

const getRequestErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data;
    if (message && typeof message === 'object' && 'message' in message && typeof message.message === 'string') {
      return message.message;
    }
  }

  return fallback;
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

const getConfidenceBadgeClass = (confidence?: number | null) => {
  if (confidence == null) return 'bg-gray-100 text-gray-700';
  if (confidence >= 90) return 'bg-emerald-100 text-emerald-700';
  if (confidence >= 75) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
};

const getEntryStatusBadgeClass = (status?: CheckpointQueueItem['confirmation_status']) => {
  if (status === 'confirmed') return 'bg-emerald-100 text-emerald-700';
  if (status === 'rejected') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
};

const getEntryStatusLabel = (status?: CheckpointQueueItem['confirmation_status']) => {
  if (status === 'confirmed') return 'Въезд подтверждён';
  if (status === 'rejected') return 'Въезд отклонён';
  return 'Ожидает решения';
};

const getExitStatusBadgeClass = (status?: ExitReviewItem['status']) => {
  if (status === 'confirmed') return 'bg-emerald-100 text-emerald-700';
  if (status === 'rejected') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
};

const getExitStatusLabel = (status?: ExitReviewItem['status']) => {
  if (status === 'confirmed') return 'Выезд подтверждён';
  if (status === 'rejected') return 'Выезд отклонён';
  return 'Ожидает решения';
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

const matchEntryReviewItem = (event: DssUnknownVehicleDetectedEvent | null, items: CheckpointQueueItem[]) => {
  if (!event) return null;

  if (event.vehicle_capture_id != null) {
    const byCaptureId = items.find((item) => item.capture_id === event.vehicle_capture_id);
    if (byCaptureId) return byCaptureId;
  }

  const normalizedPlate = normalizePlateNumber(event.plate_no);
  if (!normalizedPlate) return items[0] ?? null;

  const candidates = items.filter((item) => (
    normalizePlateNumber(item.plate_number) === normalizedPlate
    || normalizePlateNumber(item.original_plate_number) === normalizedPlate
    || normalizePlateNumber(item.matched_plate_number) === normalizedPlate
  ));

  const pendingCandidates = candidates.filter((item) => item.confirmation_status === 'pending');
  const prioritizedCandidates = pendingCandidates.length > 0 ? pendingCandidates : candidates;

  if (prioritizedCandidates.length <= 1) return prioritizedCandidates[0] ?? items[0] ?? null;

  const eventEpoch = toEpoch(event.capture_time || event.created_at);
  if (eventEpoch == null) return prioritizedCandidates[0];

  return prioritizedCandidates.reduce((best, current) => {
    const bestEpoch = toEpoch(best.capture_time || best.entry_date) ?? 0;
    const currentEpoch = toEpoch(current.capture_time || current.entry_date) ?? 0;
    return Math.abs(currentEpoch - eventEpoch) < Math.abs(bestEpoch - eventEpoch) ? current : best;
  });
};

const matchExitReviewItem = (event: DssUnknownVehicleDetectedEvent | null, items: ExitReviewItem[]) => {
  if (!event) return null;

  if (event.vehicle_capture_id != null) {
    const byCaptureId = items.find((item) => item.capture_id === event.vehicle_capture_id);
    if (byCaptureId) return byCaptureId;
  }

  const normalizedPlate = normalizePlateNumber(event.plate_no);
  if (!normalizedPlate) return items[0] ?? null;

  const candidates = items.filter((item) => normalizePlateNumber(item.plate_number) === normalizedPlate);
  if (candidates.length <= 1) return candidates[0] ?? items[0] ?? null;

  const eventEpoch = toEpoch(event.capture_time || event.created_at);
  if (eventEpoch == null) return candidates[0];

  return candidates.reduce((best, current) => {
    const bestEpoch = toEpoch(best.capture_time) ?? 0;
    const currentEpoch = toEpoch(current.capture_time) ?? 0;
    return Math.abs(currentEpoch - eventEpoch) < Math.abs(bestEpoch - eventEpoch) ? current : best;
  });
};

const getCheckpointKey = (event: DssUnknownVehicleDetectedEvent) => {
  if (event.checkpoint_id != null) return String(event.checkpoint_id);
  return `unknown:${event.point_name || event.channel_name || event.device_name || 'no-checkpoint'}`;
};

export default function DssCheckpointDesk() {
  const [connectionState, setConnectionState] = useState<string>('initialized');
  const [subscriptionState, setSubscriptionState] = useState<DssChannelSubscriptionState>('idle');
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [lastSignalAt, setLastSignalAt] = useState<string | null>(null);
  const [lastReviewSyncAt, setLastReviewSyncAt] = useState<string | null>(null);
  const [events, setEvents] = useState<DssUnknownVehicleDetectedEvent[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointOption[]>([]);
  const [selectedCheckpointKey, setSelectedCheckpointKey] = useState<string>('all');
  const [entryQueuesByCheckpoint, setEntryQueuesByCheckpoint] = useState<Record<number, CheckpointQueueItem[]>>({});
  const [exitQueuesByCheckpoint, setExitQueuesByCheckpoint] = useState<Record<number, ExitReviewItem[]>>({});
  const [loadingEntryByCheckpoint, setLoadingEntryByCheckpoint] = useState<Record<number, boolean>>({});
  const [loadingExitByCheckpoint, setLoadingExitByCheckpoint] = useState<Record<number, boolean>>({});
  const [processingVisitorId, setProcessingVisitorId] = useState<number | null>(null);
  const [processingExitReviewId, setProcessingExitReviewId] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<SimilarPlate[]>([]);
  const [expectedTasks, setExpectedTasks] = useState<ExpectedTask[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingExpectedTasks, setLoadingExpectedTasks] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    item: CheckpointQueueItem | null;
    correctedPlate: string;
    selectedTruckId: number | null;
    selectedTaskId: number | null;
    createPermit: boolean;
    createWeighing: boolean;
    openBarrier: boolean;
    comment: string;
  }>({
    open: false,
    item: null,
    correctedPlate: '',
    selectedTruckId: null,
    selectedTaskId: null,
    createPermit: false,
    createWeighing: false,
    openBarrier: false,
    comment: '',
  });
  const [manualDialog, setManualDialog] = useState<{
    open: boolean;
    checkpointId: number | null;
    plateNumber: string;
  }>({
    open: false,
    checkpointId: null,
    plateNumber: '',
  });
  const [manualTruckResults, setManualTruckResults] = useState<ManualTruckSearchResult[]>([]);
  const [manualTruckSearchLoading, setManualTruckSearchLoading] = useState(false);
  const [manualCreatePermit, setManualCreatePermit] = useState(false);
  const [manualCreateWeighing, setManualCreateWeighing] = useState(false);
  const [manualOpenBarrier, setManualOpenBarrier] = useState(false);
  const [manualComment, setManualComment] = useState('');
  const [creatingManualVisitor, setCreatingManualVisitor] = useState(false);
  const [exitConfirmDialog, setExitConfirmDialog] = useState<{
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

  useEffect(() => {
    const loadCheckpoints = async () => {
      try {
        const response = await axios.post('/entrance-permit/getallcheckpoints', {}, {
          headers: getAuthHeaders(),
        });

        setCheckpoints(response.data?.data ?? []);
      } catch (error) {
        console.error('Ошибка загрузки списка КПП для DSS desk:', error);
      }
    };

    void loadCheckpoints();
  }, []);

  const checkpointOptions = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();

    for (const checkpoint of checkpoints) {
      map.set(String(checkpoint.id), {
        key: String(checkpoint.id),
        label: checkpoint.yard_name ? `${checkpoint.name} - ${checkpoint.yard_name}` : checkpoint.name,
      });
    }

    for (const event of events) {
      const key = getCheckpointKey(event);
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: event.checkpoint_name || event.point_name || event.channel_name || event.device_name || 'Без привязки к КПП',
        });
      }
    }

    return Array.from(map.values());
  }, [checkpoints, events]);

  const filteredEvents = useMemo(() => {
    if (selectedCheckpointKey === 'all') return events;
    return events.filter((event) => getCheckpointKey(event) === selectedCheckpointKey);
  }, [events, selectedCheckpointKey]);

  const selectedCheckpointId = useMemo(() => {
    if (selectedCheckpointKey === 'all') return null;
    const parsed = Number(selectedCheckpointKey);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [selectedCheckpointKey]);

  const entryEvents = useMemo(() => filteredEvents.filter((event) => getEventDirection(event) === 'entry'), [filteredEvents]);
  const exitEvents = useMemo(() => filteredEvents.filter((event) => getEventDirection(event) === 'exit'), [filteredEvents]);
  const latestEntryEvent = useMemo(() => entryEvents[0] ?? null, [entryEvents]);
  const latestExitEvent = useMemo(() => exitEvents[0] ?? null, [exitEvents]);

  const loadEntryQueue = useCallback(async (checkpointId: number) => {
    setLoadingEntryByCheckpoint((current) => ({ ...current, [checkpointId]: true }));
    try {
      const response = await axios.post('/security/checkpoint-review-queue', {
        checkpoint_id: checkpointId,
        limit: 20,
      }, {
        headers: getAuthHeaders(),
      });

      setEntryQueuesByCheckpoint((current) => ({
        ...current,
        [checkpointId]: response.data?.data ?? [],
      }));
      setLastReviewSyncAt(new Date().toISOString());
    } catch (error) {
      console.error('Ошибка загрузки очереди въезда для DSS desk:', error);
    } finally {
      setLoadingEntryByCheckpoint((current) => ({ ...current, [checkpointId]: false }));
    }
  }, []);

  const loadExitQueue = useCallback(async (checkpointId: number) => {
    setLoadingExitByCheckpoint((current) => ({ ...current, [checkpointId]: true }));
    try {
      const response = await axios.post('/security/checkpoint-exit-review-queue', {
        checkpoint_id: checkpointId,
        limit: 20,
      }, {
        headers: getAuthHeaders(),
      });

      setExitQueuesByCheckpoint((current) => ({
        ...current,
        [checkpointId]: response.data?.data ?? [],
      }));
      setLastReviewSyncAt(new Date().toISOString());
    } catch (error) {
      console.error('Ошибка загрузки очереди выезда для DSS desk:', error);
    } finally {
      setLoadingExitByCheckpoint((current) => ({ ...current, [checkpointId]: false }));
    }
  }, []);

  const refreshCheckpointContext = useCallback(async (checkpointId: number | null | undefined) => {
    if (!checkpointId) return;
    await Promise.all([loadEntryQueue(checkpointId), loadExitQueue(checkpointId)]);
  }, [loadEntryQueue, loadExitQueue]);

  useEffect(() => {
    const checkpointIds = Array.from(new Set([
      latestEntryEvent?.checkpoint_id ?? null,
      latestExitEvent?.checkpoint_id ?? null,
    ].filter((value): value is number => typeof value === 'number' && value > 0)));

    checkpointIds.forEach((checkpointId) => {
      void refreshCheckpointContext(checkpointId);
    });
  }, [latestEntryEvent?.vehicle_capture_id, latestEntryEvent?.checkpoint_id, latestExitEvent?.vehicle_capture_id, latestExitEvent?.checkpoint_id, refreshCheckpointContext]);

  useEffect(() => {
    if (!selectedCheckpointId) return;
    if (entryQueuesByCheckpoint[selectedCheckpointId] || exitQueuesByCheckpoint[selectedCheckpointId]) return;

    void refreshCheckpointContext(selectedCheckpointId);
  }, [entryQueuesByCheckpoint, exitQueuesByCheckpoint, refreshCheckpointContext, selectedCheckpointId]);

  const entryReviewItem = useMemo(() => {
    if (latestEntryEvent?.checkpoint_id) {
      return matchEntryReviewItem(latestEntryEvent, entryQueuesByCheckpoint[latestEntryEvent.checkpoint_id] ?? []);
    }

    if (selectedCheckpointId) {
      return entryQueuesByCheckpoint[selectedCheckpointId]?.[0] ?? null;
    }

    return null;
  }, [entryQueuesByCheckpoint, latestEntryEvent, selectedCheckpointId]);

  const exitReviewItem = useMemo(() => {
    if (latestExitEvent?.checkpoint_id) {
      return matchExitReviewItem(latestExitEvent, exitQueuesByCheckpoint[latestExitEvent.checkpoint_id] ?? []);
    }

    if (selectedCheckpointId) {
      return exitQueuesByCheckpoint[selectedCheckpointId]?.[0] ?? null;
    }

    return null;
  }, [exitQueuesByCheckpoint, latestExitEvent, selectedCheckpointId]);

  const selectedManualTruck = useMemo(
    () => manualTruckResults.find((truck) => truck.plate_number.toUpperCase() === manualDialog.plateNumber.trim().toUpperCase()) ?? null,
    [manualDialog.plateNumber, manualTruckResults],
  );

  const resolvedConfirmTruck = useMemo<ConfirmResolvedTruck>(() => {
    const normalizedCorrectedPlate = normalizePlateNumber(confirmDialog.correctedPlate);
    const selectedTruckCandidate = searchResults.find((truck) => truck.truck_id === confirmDialog.selectedTruckId) ?? null;
    const selectedTruck = selectedTruckCandidate && normalizePlateNumber(selectedTruckCandidate.plate_number) === normalizedCorrectedPlate
      ? selectedTruckCandidate
      : null;

    if (selectedTruck) {
      return {
        truckId: selectedTruck.truck_id,
        hasPermit: selectedTruck.has_permit,
        isNew: false,
      };
    }

    if (!normalizedCorrectedPlate) {
      return {
        truckId: null,
        hasPermit: confirmDialog.item?.has_permit ?? false,
        isNew: false,
      };
    }

    const matchedByPlate = searchResults.find((truck) => normalizePlateNumber(truck.plate_number) === normalizedCorrectedPlate);
    if (matchedByPlate) {
      return {
        truckId: matchedByPlate.truck_id,
        hasPermit: matchedByPlate.has_permit,
        isNew: false,
      };
    }

    return {
      truckId: null,
      hasPermit: false,
      isNew: true,
    };
  }, [confirmDialog.correctedPlate, confirmDialog.item?.has_permit, confirmDialog.selectedTruckId, searchResults]);

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
      } else {
        setExpectedTasks([]);
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
      } else {
        setSearchResults([]);
      }
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
    if (!confirmDialog.open || !item) return;
    void loadExpectedTasks(item.yard_id);
  }, [confirmDialog.open, confirmDialog.item, loadExpectedTasks]);

  useEffect(() => {
    const item = confirmDialog.item;
    if (!confirmDialog.open || !item) return undefined;

    const timeoutId = window.setTimeout(() => {
      void searchSimilarPlates(confirmDialog.correctedPlate, item.yard_id);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [confirmDialog.correctedPlate, confirmDialog.item, confirmDialog.open, searchSimilarPlates]);

  useEffect(() => {
    if (!manualDialog.open || !manualDialog.checkpointId) return undefined;
    if (manualDialog.plateNumber.trim().length < 2) {
      setManualTruckResults([]);
      setManualTruckSearchLoading(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      setManualTruckSearchLoading(true);
      try {
        const checkpointId = manualDialog.checkpointId;
        if (!checkpointId) {
          setManualTruckResults([]);
          return;
        }

        const checkpointQueueItem = entryQueuesByCheckpoint[checkpointId]?.[0] ?? null;
        const yardId = checkpointQueueItem?.yard_id;
        const response = await axios.post('/security/searchtruck', {
          plate_number: manualDialog.plateNumber.trim(),
          yard_id: yardId,
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
  }, [entryQueuesByCheckpoint, manualDialog.checkpointId, manualDialog.open, manualDialog.plateNumber]);

  useEffect(() => {
    const item = exitConfirmDialog.item;
    if (!exitConfirmDialog.open || !item) return undefined;

    const timeoutId = window.setTimeout(() => {
      void searchActiveVisitors(exitConfirmDialog.correctedPlate, item.yard_id, item.candidate_visitors);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [exitConfirmDialog.correctedPlate, exitConfirmDialog.item, exitConfirmDialog.open, searchActiveVisitors]);

  const openImagePreview = (src: string, title: string) => setImagePreview({ open: true, src, title });
  const closeImagePreview = () => setImagePreview({ open: false, src: '', title: '' });

  const openConfirmDialog = (item: CheckpointQueueItem) => {
    setConfirmDialog({
      open: true,
      item,
      correctedPlate: item.matched_plate_number || item.plate_number,
      selectedTruckId: item.matched_truck_id ?? null,
      selectedTaskId: item.task_id ?? null,
      createPermit: false,
      createWeighing: false,
      openBarrier: false,
      comment: '',
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
      createPermit: false,
      createWeighing: false,
      openBarrier: false,
      comment: '',
    });
    setSearchResults([]);
    setExpectedTasks([]);
  };

  const openManualDialog = (checkpointId: number | null | undefined, plateNumber?: string | null) => {
    setManualDialog({
      open: true,
      checkpointId: checkpointId ?? null,
      plateNumber: plateNumber ?? '',
    });
    setManualTruckResults([]);
    setManualCreatePermit(false);
    setManualCreateWeighing(false);
    setManualOpenBarrier(false);
    setManualComment('');
  };

  const closeManualDialog = () => {
    setManualDialog({ open: false, checkpointId: null, plateNumber: '' });
    setManualTruckResults([]);
    setManualCreatePermit(false);
    setManualCreateWeighing(false);
    setManualOpenBarrier(false);
    setManualComment('');
  };

  const openExitConfirmDialog = (item: ExitReviewItem) => {
    setExitConfirmDialog({
      open: true,
      item,
      selectedVisitorId: item.candidate_visitors.length === 1 ? item.candidate_visitors[0].visitor_id : null,
      correctedPlate: item.plate_number,
    });
    setManualSearchResults(item.candidate_visitors);
  };

  const closeExitConfirmDialog = () => {
    setExitConfirmDialog({
      open: false,
      item: null,
      selectedVisitorId: null,
      correctedPlate: '',
    });
    setManualSearchResults([]);
  };

  const handleManualCreate = async () => {
    if (!manualDialog.checkpointId || !manualDialog.plateNumber.trim()) {
      toast.error('Введите номер ТС и выберите КПП');
      return;
    }

    setCreatingManualVisitor(true);
    try {
      const response = await axios.post('/security/checkpoint-review-manual-add', {
        checkpoint_id: manualDialog.checkpointId,
        plate_number: manualDialog.plateNumber.trim().toUpperCase(),
        comment: manualComment.trim() || undefined,
        create_permit: manualCreatePermit && !selectedManualTruck?.has_permit,
        create_weighing: manualCreateWeighing,
        open_barrier: manualOpenBarrier,
      }, {
        headers: getAuthHeaders(),
      });

      if (response.data?.status) {
        toast.success(response.data?.data?.already_exists ? 'Найдена существующая запись' : 'ТС добавлено и подтверждено');

        if (manualOpenBarrier) {
          if (response.data?.data?.barrier_opened) {
            toast.success('Шлагбаум открыт');
          } else {
            toast.error(response.data?.data?.barrier_open_error || 'ТС добавлено, но шлагбаум не открылся');
          }
        }

        closeManualDialog();
        await refreshCheckpointContext(manualDialog.checkpointId);
      } else {
        toast.error(response.data?.message || 'Не удалось добавить ТС');
      }
    } catch (error: unknown) {
      console.error('Ошибка ручного добавления посетителя:', error);
      toast.error(getRequestErrorMessage(error, 'Не удалось добавить ТС'));
    } finally {
      setCreatingManualVisitor(false);
    }
  };

  const handleConfirmEntry = async () => {
    const item = confirmDialog.item;
    if (!item) return;

    const userId = Number(localStorage.getItem('user_id') || '1');
    setProcessingVisitorId(item.visitor_id);

    const hasPermit = resolvedConfirmTruck.hasPermit;
    const willCreatePermit = confirmDialog.createPermit && !hasPermit;
    const shouldOpenBarrier = confirmDialog.openBarrier && !!item.can_open_barrier;

    if (item.yard_strict_mode && !hasPermit && !willCreatePermit) {
      toast.error('Строгий режим: без разрешения въезд подтверждать нельзя');
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
        comment: confirmDialog.comment.trim() || undefined,
        create_permit: willCreatePermit,
        create_weighing: confirmDialog.createWeighing,
        open_barrier: shouldOpenBarrier,
      }, {
        headers: getAuthHeaders(),
      });

      if (response.data?.status) {
        const confirmedTruckId = Number(response.data?.data?.truck_id || 0) || null;

        if (confirmDialog.createWeighing && !willCreatePermit) {
          try {
            await axios.post('/weighing/create-requirement', {
              yard_id: item.yard_id,
              visitor_id: item.visitor_id,
              plate_number: confirmDialog.correctedPlate || item.plate_number,
              truck_id: confirmedTruckId ?? undefined,
              task_id: confirmDialog.selectedTaskId ?? undefined,
            }, {
              headers: getAuthHeaders(),
            });
          } catch {
            console.error('Не удалось создать задание на взвешивание');
          }
        }

        toast.success(willCreatePermit ? 'Въезд подтверждён, разовый пропуск создан' : 'Въезд подтверждён');

        if (shouldOpenBarrier) {
          if (response.data?.data?.barrier_opened) {
            toast.success('Шлагбаум открыт');
          } else {
            toast.error(response.data?.data?.barrier_open_error || 'Въезд подтверждён, но шлагбаум не открылся');
          }
        }

        closeConfirmDialog();
        await refreshCheckpointContext(item.checkpoint_id);
      }
    } catch (error: unknown) {
      console.error('Ошибка подтверждения въезда:', error);
      toast.error(getRequestErrorMessage(error, 'Не удалось подтвердить въезд'));
    } finally {
      setProcessingVisitorId(null);
    }
  };

  const handleRejectEntry = async (item: CheckpointQueueItem) => {
    const userId = Number(localStorage.getItem('user_id') || '1');
    setProcessingVisitorId(item.visitor_id);

    try {
      const response = await axios.post('/security/rejectvisitor', {
        visitor_id: item.visitor_id,
        operator_user_id: userId,
        reason: 'Отклонено оператором DSS КПП',
      }, {
        headers: getAuthHeaders(),
      });

      if (response.data?.status) {
        toast.success('Въезд отклонён');
        await refreshCheckpointContext(item.checkpoint_id);
      }
    } catch (error: unknown) {
      console.error('Ошибка отклонения въезда:', error);
      toast.error(getRequestErrorMessage(error, 'Не удалось отклонить въезд'));
    } finally {
      setProcessingVisitorId(null);
    }
  };

  const handleConfirmExit = async () => {
    const item = exitConfirmDialog.item;
    if (!item) return;

    if (!exitConfirmDialog.selectedVisitorId) {
      toast.error('Выберите активный визит для подтверждения выезда');
      return;
    }

    const userId = Number(localStorage.getItem('user_id') || '1');
    setProcessingExitReviewId(item.review_id);

    try {
      const response = await axios.post('/security/confirm-exit-review', {
        review_id: item.review_id,
        operator_user_id: userId,
        visitor_id: exitConfirmDialog.selectedVisitorId,
      }, {
        headers: getAuthHeaders(),
      });

      if (response.data?.status) {
        toast.success('Выезд подтверждён');
        closeExitConfirmDialog();
        await refreshCheckpointContext(item.checkpoint_id);
      }
    } catch (error: unknown) {
      console.error('Ошибка подтверждения выезда:', error);
      toast.error(getRequestErrorMessage(error, 'Не удалось подтвердить выезд'));
    } finally {
      setProcessingExitReviewId(null);
    }
  };

  const handleRejectExit = async (item: ExitReviewItem) => {
    const userId = Number(localStorage.getItem('user_id') || '1');
    setProcessingExitReviewId(item.review_id);

    try {
      const response = await axios.post('/security/reject-exit-review', {
        review_id: item.review_id,
        operator_user_id: userId,
        reason: 'Отклонено оператором DSS КПП',
      }, {
        headers: getAuthHeaders(),
      });

      if (response.data?.status) {
        toast.success('Выезд отклонён');
        await refreshCheckpointContext(item.checkpoint_id);
      }
    } catch (error: unknown) {
      console.error('Ошибка отклонения выезда:', error);
      toast.error(getRequestErrorMessage(error, 'Не удалось отклонить выезд'));
    } finally {
      setProcessingExitReviewId(null);
    }
  };

  const renderCaptureMedia = (
    imageSrc?: string | null,
    imageAlt?: string,
    plateImageSrc?: string | null,
    plateImageAlt?: string,
  ) => (
    <div className="space-y-3">
      <div className="group relative overflow-hidden rounded-lg border bg-muted/30">
        {imageSrc ? (
          <button type="button" onClick={() => openImagePreview(imageSrc, imageAlt || 'Фото ТС')} className="block h-full w-full cursor-zoom-in">
            <img src={imageSrc} alt={imageAlt || 'Фото ТС'} className="h-56 w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          </button>
        ) : (
          <div className="flex h-56 items-center justify-center text-muted-foreground">
            <Camera className="h-8 w-8" />
          </div>
        )}
      </div>

      {plateImageSrc && (
        <button type="button" onClick={() => openImagePreview(plateImageSrc, plateImageAlt || 'Фото номера')} className="group relative block overflow-hidden rounded-lg border bg-muted/30 text-left">
          <img src={plateImageSrc} alt={plateImageAlt || 'Фото номера'} className="h-24 w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105" />
        </button>
      )}
    </div>
  );

  const renderInfoRow = (label: string, value?: string | null) => (
    <div>
      <span className="font-medium text-foreground">{label}:</span>{' '}
      <span>{value && String(value).trim().length > 0 ? value : '—'}</span>
    </div>
  );

  const renderEntryCard = () => {
    const event = latestEntryEvent;
    const item = entryReviewItem;
    const selectedCheckpoint = selectedCheckpointId ? checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) ?? null : null;

    if (!event && !item) {
      return (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          По выбранному КПП входящих событий пока не было.
        </div>
      );
    }

    const imageSrc = item?.capture_picture_url || event?.capture_picture;
    const plateImageSrc = item?.capture_plate_picture_url || event?.plate_picture;
    const checkpointId = event?.checkpoint_id ?? item?.checkpoint_id ?? selectedCheckpointId ?? null;
    const isLoadingReview = checkpointId ? !!loadingEntryByCheckpoint[checkpointId] : false;
    const canManualAdd = checkpointId != null;
    const canConfirmEntry = !!item && item.confirmation_status === 'pending';
    const canRejectEntry = !!item && item.confirmation_status === 'pending';
    const checkpointLabel = event?.checkpoint_name || selectedCheckpoint?.name || (item?.checkpoint_id ? String(item.checkpoint_id) : 'Без привязки');
    const yardLabel = item?.yard_name || selectedCheckpoint?.yard_name || event?.parking_lot_name || event?.source_name;
    const deviceLabel = item?.device_name || event?.device_name || event?.point_name || event?.channel_name;
    const plateLabel = event?.plate_no || item?.plate_number || 'Без номера';
    const captureLabel = item?.capture_time || event?.capture_time || event?.created_at || item?.entry_date;
    const imageTitle = `ТС ${plateLabel}`;

    return (
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid gap-4 p-4 xl:grid-cols-[240px_minmax(0,1fr)]">
          {renderCaptureMedia(imageSrc, imageTitle, plateImageSrc, `Номер ${plateLabel}`)}

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-2xl font-bold tracking-wide">{plateLabel}</span>
              <Badge className="bg-emerald-100 text-emerald-700">Въезд</Badge>
              {item ? <Badge className={getEntryStatusBadgeClass(item.confirmation_status)}>{getEntryStatusLabel(item.confirmation_status)}</Badge> : <Badge variant="outline">Нет review-контекста</Badge>}
              {item?.recognition_confidence != null && <Badge className={getConfidenceBadgeClass(item.recognition_confidence)}>Точность {item.recognition_confidence}%</Badge>}
              {!event && item && <Badge variant="outline">Из очереди КПП</Badge>}
              {isLoadingReview && <Badge variant="outline"><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Синхронизация</Badge>}
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant={item?.matched_truck_id ? 'default' : 'outline'}>{item?.matched_truck_id ? 'ТС найдено в базе' : 'ТС не найдено в базе'}</Badge>
              <Badge variant={item?.has_permit ? 'default' : 'outline'}>{item?.has_permit ? `Разрешение: ${item.permit_type === 'one_time' ? 'разовое' : 'постоянное'}` : 'Без разрешения'}</Badge>
              <Badge variant={item?.task_id ? 'default' : 'outline'}>{item?.task_name || 'Задание не найдено'}</Badge>
              <Badge variant={item?.has_weighing_task ? 'default' : 'outline'}>{item?.has_weighing_task ? 'Есть весовой контроль' : 'Весовой контроль не требуется'}</Badge>
              {item?.can_open_barrier && <Badge className="bg-sky-100 text-sky-700">Шлагбаум доступен</Badge>}
            </div>

            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
              {renderInfoRow('КПП', checkpointLabel)}
              {renderInfoRow('Устройство', deviceLabel)}
              {renderInfoRow('Территория', yardLabel)}
              {renderInfoRow('Время фиксации', formatDateTime(captureLabel))}
              {renderInfoRow('Поступило', event ? formatRelativeSeconds(event.created_at) : 'Загружено из истории КПП')}
              {renderInfoRow('Причина', item?.pending_reason_text || 'Ожидает сопоставления с очередью КПП')}
              {renderInfoRow('Задание', item?.task_name || 'Не назначено')}
              {renderInfoRow('Весовой контроль', item?.weighing_reason || (item?.has_weighing_task ? 'Назначен' : 'Не требуется'))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => openManualDialog(checkpointId, event?.plate_no || item?.plate_number)} disabled={!canManualAdd}>
                <Plus className="h-4 w-4" />
                Добавить ТС
              </Button>

              <Button type="button" onClick={() => canConfirmEntry && item ? openConfirmDialog(item) : openManualDialog(checkpointId, event?.plate_no || item?.plate_number)} disabled={(!canManualAdd && !canConfirmEntry) || !canConfirmEntry || processingVisitorId === item?.visitor_id}>
                {processingVisitorId === item?.visitor_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Разрешить проезд
              </Button>

              <Button type="button" variant="destructive" onClick={() => item && handleRejectEntry(item)} disabled={!canRejectEntry || processingVisitorId === item?.visitor_id}>
                {processingVisitorId === item?.visitor_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Отклонить
              </Button>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              В окне подтверждения доступны создание разрешения, создание весового контроля и открытие шлагбаума.
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderExitCard = () => {
    const event = latestExitEvent;
    const item = exitReviewItem;
    const selectedCheckpoint = selectedCheckpointId ? checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) ?? null : null;

    if (!event && !item) {
      return (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          По выбранному КПП исходящих событий пока не было.
        </div>
      );
    }

    const imageSrc = item?.capture_picture_url || event?.capture_picture;
    const plateImageSrc = item?.capture_plate_picture_url || event?.plate_picture;
    const checkpointId = event?.checkpoint_id ?? item?.checkpoint_id ?? selectedCheckpointId ?? null;
    const isLoadingReview = checkpointId ? !!loadingExitByCheckpoint[checkpointId] : false;
    const checkpointLabel = event?.checkpoint_name || item?.checkpoint_name || selectedCheckpoint?.name || 'Без привязки';
    const yardLabel = item?.yard_name || selectedCheckpoint?.yard_name || event?.parking_lot_name || event?.source_name;
    const deviceLabel = item?.device_name || event?.device_name || event?.point_name || event?.channel_name;
    const plateLabel = event?.plate_no || item?.plate_number || 'Без номера';
    const captureLabel = item?.capture_time || event?.capture_time || event?.created_at;

    return (
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="grid gap-4 p-4 xl:grid-cols-[240px_minmax(0,1fr)]">
          {renderCaptureMedia(imageSrc, `Выезд ${plateLabel}`, plateImageSrc, `Номер ${plateLabel}`)}

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-2xl font-bold tracking-wide">{plateLabel}</span>
              <Badge className="bg-orange-100 text-orange-700">Выезд</Badge>
              {item ? <Badge className={getExitStatusBadgeClass(item.status)}>{getExitStatusLabel(item.status)}</Badge> : <Badge variant="outline">Нет exit-review контекста</Badge>}
              {item?.recognition_confidence != null && <Badge className={getConfidenceBadgeClass(item.recognition_confidence)}>Точность {item.recognition_confidence}%</Badge>}
              {!event && item && <Badge variant="outline">Из очереди КПП</Badge>}
              {isLoadingReview && <Badge variant="outline"><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Синхронизация</Badge>}
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant={item?.truck_id ? 'default' : 'outline'}>{item?.truck_id ? 'ТС найдено в базе' : 'ТС не сопоставлено'}</Badge>
              <Badge variant={item && item.candidate_visitors.length > 0 ? 'default' : 'outline'}>{item ? `Активных визитов: ${item.candidate_visitors.length}` : 'Нет кандидатов'}</Badge>
              {item?.resolved_visitor_id && <Badge className="bg-emerald-100 text-emerald-700">Визит выбран: #{item.resolved_visitor_id}</Badge>}
            </div>

            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
              {renderInfoRow('КПП', checkpointLabel)}
              {renderInfoRow('Устройство', deviceLabel)}
              {renderInfoRow('Территория', yardLabel)}
              {renderInfoRow('Время фиксации', formatDateTime(captureLabel))}
              {renderInfoRow('Поступило', event ? formatRelativeSeconds(event.created_at) : 'Загружено из истории КПП')}
              {renderInfoRow('Комментарий', item?.note || 'Нет')}
            </div>

            {item?.candidate_visitors?.length ? (
              <div className="space-y-2">
                <div className="text-sm font-medium">Не закрытые визиты</div>
                <div className="flex flex-wrap gap-2">
                  {item.candidate_visitors.slice(0, 4).map((candidate) => (
                    <Badge key={candidate.visitor_id} variant="outline" className="gap-1">
                      {candidate.plate_number}
                      <span className="text-xs text-muted-foreground">{candidate.task_name || getConfirmationStatusLabel(candidate.confirmation_status)}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => item && openExitConfirmDialog(item)} disabled={!item || processingExitReviewId === item.review_id}>
                {processingExitReviewId === item?.review_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Разрешить выезд
              </Button>

              <Button type="button" variant="destructive" onClick={() => item && handleRejectExit(item)} disabled={!item || processingExitReviewId === item.review_id}>
                {processingExitReviewId === item?.review_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Отклонить
              </Button>
            </div>
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
                Машины приходят из websocket, а карточки добирают review-контекст из действующих API КПП: ТС в базе, разрешение, вес, задание и действия оператора.
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
            Sync review API
          </div>
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatDateTime(lastReviewSyncAt)}</div>
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
            <CardDescription>Последнее событие и операторские действия по выбранному КПП.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 py-4 sm:px-6">
            {renderEntryCard()}
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          <CardHeader className="border-b px-4 py-4 sm:px-6">
            <CardTitle className="flex items-center gap-2 text-lg">
              <LogOut className="h-5 w-5 text-orange-600" />
              Выезд
            </CardTitle>
            <CardDescription>Последнее событие и выбор активного визита для закрытия выезда.</CardDescription>
          </CardHeader>
          <CardContent className="px-4 py-4 sm:px-6">
            {renderExitCard()}
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && closeConfirmDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Подтверждение въезда</DialogTitle>
            <DialogDescription>
              Здесь доступны исправление номера, выбор ТС, задание, создание разрешения, весового контроля и открытие шлагбаума.
            </DialogDescription>
          </DialogHeader>

          {confirmDialog.item && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge className={getEntryStatusBadgeClass(confirmDialog.item.confirmation_status)}>{getEntryStatusLabel(confirmDialog.item.confirmation_status)}</Badge>
                <Badge variant={confirmDialog.item.matched_truck_id ? 'default' : 'outline'}>{confirmDialog.item.matched_truck_id ? 'ТС есть в базе' : 'ТС не найдено'}</Badge>
                <Badge variant={confirmDialog.item.has_permit ? 'default' : 'outline'}>{confirmDialog.item.has_permit ? 'Разрешение есть' : 'Разрешения нет'}</Badge>
                <Badge variant={confirmDialog.item.has_weighing_task ? 'default' : 'outline'}>{confirmDialog.item.has_weighing_task ? 'Весовой контроль есть' : 'Без весового контроля'}</Badge>
                {confirmDialog.item.can_open_barrier && <Badge className="bg-sky-100 text-sky-700">Можно открыть шлагбаум</Badge>}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Номер ТС</div>
                  <Input value={confirmDialog.correctedPlate} onChange={(event) => setConfirmDialog((current) => ({ ...current, correctedPlate: event.target.value.toUpperCase() }))} />
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Комментарий</div>
                  <Input value={confirmDialog.comment} onChange={(event) => setConfirmDialog((current) => ({ ...current, comment: event.target.value }))} placeholder="Комментарий оператора" />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Похожие номера и ТС</div>
                    {searching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>

                  {searchResults.length > 0 ? (
                    <div className="space-y-2">
                      {searchResults.map((result) => (
                        <button
                          key={result.truck_id}
                          type="button"
                          onClick={() => setConfirmDialog((current) => ({
                            ...current,
                            selectedTruckId: result.truck_id,
                            correctedPlate: result.plate_number,
                            selectedTaskId: current.selectedTaskId ?? result.task_id ?? null,
                          }))}
                          className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${confirmDialog.selectedTruckId === result.truck_id ? 'border-blue-500 bg-blue-50' : 'hover:bg-muted/40'}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-medium">{result.plate_number}</div>
                              <div className="text-xs text-muted-foreground">{result.task_name || result.truck_model_name || 'Без модели/задания'}</div>
                            </div>
                            <Badge variant={result.has_permit ? 'default' : 'outline'}>{result.similarity_percent}%</Badge>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Похожие ТС не найдены.</div>
                  )}
                </div>

                <div className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Ожидаемые задания</div>
                    {loadingExpectedTasks && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>

                  {expectedTasks.length > 0 ? (
                    <div className="space-y-2">
                      {expectedTasks.slice(0, 8).map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setConfirmDialog((current) => ({ ...current, selectedTaskId: task.id, selectedTruckId: current.selectedTruckId ?? task.truck_id ?? null }))}
                          className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${confirmDialog.selectedTaskId === task.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-muted/40'}`}
                        >
                          <div className="font-medium">{task.name}</div>
                          <div className="text-xs text-muted-foreground">{task.plate_number || task.driver_name || 'Без привязки к ТС'}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Ожидаемых заданий нет.</div>
                  )}
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={confirmDialog.createPermit} onCheckedChange={(checked) => setConfirmDialog((current) => ({ ...current, createPermit: checked === true }))} />
                  Создать разрешение
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={confirmDialog.createWeighing} onCheckedChange={(checked) => setConfirmDialog((current) => ({ ...current, createWeighing: checked === true }))} />
                  Создать весовой контроль
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={confirmDialog.openBarrier} onCheckedChange={(checked) => setConfirmDialog((current) => ({ ...current, openBarrier: checked === true }))} disabled={!confirmDialog.item.can_open_barrier} />
                  Открыть шлагбаум
                </label>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                <div>Выбранное ТС: {resolvedConfirmTruck.truckId ? `#${resolvedConfirmTruck.truckId}` : 'новое / не определено'}</div>
                <div>Разрешение после подтверждения: {resolvedConfirmTruck.hasPermit || confirmDialog.createPermit ? 'будет' : 'не будет'}</div>
                <div>Задание: {confirmDialog.selectedTaskId ? `#${confirmDialog.selectedTaskId}` : 'не выбрано'}</div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeConfirmDialog}>Отмена</Button>
            <Button type="button" onClick={handleConfirmEntry} disabled={!confirmDialog.item || processingVisitorId === confirmDialog.item?.visitor_id}>
              {processingVisitorId === confirmDialog.item?.visitor_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Разрешить проезд
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manualDialog.open} onOpenChange={(open) => !open && closeManualDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ручное добавление ТС</DialogTitle>
            <DialogDescription>
              Добавление машины в очередь КПП с возможностью сразу создать разрешение и весовой контроль.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Номер ТС</div>
              <Input value={manualDialog.plateNumber} onChange={(event) => setManualDialog((current) => ({ ...current, plateNumber: event.target.value.toUpperCase() }))} placeholder="A123BC777" />
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">Найденные ТС в базе</div>
                {manualTruckSearchLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>

              {manualTruckResults.length > 0 ? (
                <div className="space-y-2">
                  {manualTruckResults.map((truck) => (
                    <div key={truck.id} className={`rounded-lg border px-3 py-2 text-sm ${selectedManualTruck?.id === truck.id ? 'border-blue-500 bg-blue-50' : ''}`}>
                      <div className="font-medium">{truck.plate_number}</div>
                      <div className="text-xs text-muted-foreground">{truck.truck_model_name || truck.truck_brand_name || 'Модель не указана'}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant={truck.has_permit ? 'default' : 'outline'}>{truck.has_permit ? 'Есть разрешение' : 'Без разрешения'}</Badge>
                        {truck.task_name && <Badge variant="outline">{truck.task_name}</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Совпадений по базе пока нет. Можно добавить новое ТС по введённому номеру.</div>
              )}
            </div>

            <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={manualCreatePermit} onCheckedChange={(checked) => setManualCreatePermit(checked === true)} />
                Создать разрешение
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={manualCreateWeighing} onCheckedChange={(checked) => setManualCreateWeighing(checked === true)} />
                Создать весовой контроль
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={manualOpenBarrier} onCheckedChange={(checked) => setManualOpenBarrier(checked === true)} />
                Открыть шлагбаум
              </label>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Комментарий</div>
              <Input value={manualComment} onChange={(event) => setManualComment(event.target.value)} placeholder="Комментарий оператора" />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeManualDialog}>Отмена</Button>
            <Button type="button" onClick={handleManualCreate} disabled={!manualDialog.checkpointId || creatingManualVisitor}>
              {creatingManualVisitor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Добавить ТС
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exitConfirmDialog.open} onOpenChange={(open) => !open && closeExitConfirmDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Подтверждение выезда</DialogTitle>
            <DialogDescription>
              Выберите активный визит, который нужно закрыть по текущему событию DSS.
            </DialogDescription>
          </DialogHeader>

          {exitConfirmDialog.item && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Номер ТС</div>
                <Input value={exitConfirmDialog.correctedPlate} onChange={(event) => setExitConfirmDialog((current) => ({ ...current, correctedPlate: event.target.value.toUpperCase() }))} />
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Активные визиты</div>
                  {manualSearchLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>

                {manualSearchResults.length > 0 ? (
                  <div className="space-y-2">
                    {manualSearchResults.map((candidate) => (
                      <button
                        key={candidate.visitor_id}
                        type="button"
                        onClick={() => setExitConfirmDialog((current) => ({ ...current, selectedVisitorId: candidate.visitor_id }))}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${exitConfirmDialog.selectedVisitorId === candidate.visitor_id ? 'border-orange-500 bg-orange-50' : 'hover:bg-muted/40'}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-medium">{candidate.plate_number}</div>
                            <div className="text-xs text-muted-foreground">Въезд: {formatDateTime(candidate.entry_date)}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {candidate.task_name && <Badge variant="outline">{candidate.task_name}</Badge>}
                            <Badge variant={candidate.is_exact_plate_match || candidate.is_exact_truck_match ? 'default' : 'outline'}>
                              {getConfirmationStatusLabel(candidate.confirmation_status)}
                            </Badge>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Подходящих активных визитов не найдено.</div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeExitConfirmDialog}>Отмена</Button>
            <Button type="button" onClick={handleConfirmExit} disabled={!exitConfirmDialog.selectedVisitorId || processingExitReviewId === exitConfirmDialog.item?.review_id}>
              {processingExitReviewId === exitConfirmDialog.item?.review_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Разрешить выезд
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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