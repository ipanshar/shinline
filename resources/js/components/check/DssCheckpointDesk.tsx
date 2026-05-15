import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRightLeft,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileCheck,
  Info,
  Loader2,
  LogIn,
  LogOut,
  Plus,
  Radio,
  Scale,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Truck,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import VisitorsHistoryPanel from '@/components/check/VisitorsHistoryPanel';
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
  weighing_required_type?: 'entry' | 'exit' | 'both' | null;
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

type ExitPermitSummary = {
  id: number;
  valid_until?: string | null;
  comment?: string | null;
};

type ExitCandidate = {
  visitor_id: number;
  plate_number: string;
  entry_date: string;
  task_id?: number | null;
  task_name?: string | null;
  confirmation_status: string;
  truck_id?: number | null;
  exit_permit_required?: boolean;
  has_active_exit_permit?: boolean;
  exit_permit?: ExitPermitSummary | null;
  is_exact_truck_match: boolean;
  is_exact_plate_match: boolean;
  weighing?: {
    status: 'pending' | 'entry_done' | 'completed' | 'skipped';
    required_type: 'entry' | 'exit' | 'both';
    reason: string;
    needs_entry: boolean;
    needs_exit: boolean;
    entry_weight: number | null;
    entry_weighed_at: string | null;
    exit_weight: number | null;
    exit_weighed_at: string | null;
  } | null;
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
  can_open_barrier?: boolean;
  truck_id?: number | null;
  note?: string | null;
  capture_picture_url?: string | null;
  capture_plate_picture_url?: string | null;
  candidate_visitors: ExitCandidate[];
};

type TerritoryVisitor = {
  id: number;
  plate_number: string;
  truck_model_name?: string | null;
  status_name: string;
  entry_date: string;
  exit_date?: string | null;
  user_name?: string | null;
  user_phone?: string | null;
  description?: string | null;
  name?: string | null;
  truck_own?: string | null;
  truck_vip_level?: number | null;
  entrance_device_name?: string | null;
  has_permit?: boolean;
  permit_type?: 'one_time' | 'permanent' | null;
  exit_permit_required?: boolean;
  has_active_exit_permit?: boolean;
  exit_permit?: ExitPermitSummary | null;
  comment?: string | null;
};

type ConfirmResolvedTruck = {
  truckId: number | null;
  hasPermit: boolean;
  isNew: boolean;
};

export type CheckpointOption = {
  id: number;
  name: string;
  yard_id?: number | null;
  yard_name?: string | null;
};

export type DssCheckpointDeskStatus = {
  connectionState: string;
  subscriptionState: DssChannelSubscriptionState;
  lastSignalAt: string | null;
  lastReviewSyncAt: string | null;
  entryCount: number;
  exitCount: number;
};

type DssCheckpointDeskProps = {
  checkpoints: CheckpointOption[];
  selectedCheckpointKey: string;
  selectedYardId?: number | null;
  onStatusChange?: (status: DssCheckpointDeskStatus) => void;
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

export function DssCheckpointStatusPills({ status }: { status: DssCheckpointDeskStatus | null }) {
  if (!status) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status.connectionState === 'connected' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
        {status.connectionState === 'connected' ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        WS: {status.connectionState === 'connected' ? 'online' : status.connectionState}
      </div>
      <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${getSubscriptionBadgeClass(status.subscriptionState)}`} title={getSubscriptionLabel(status.subscriptionState)}>
        {status.subscriptionState === 'subscribed' ? <ShieldCheck className="h-3.5 w-3.5" /> : status.subscriptionState === 'error' ? <ShieldAlert className="h-3.5 w-3.5" /> : <Radio className="h-3.5 w-3.5" />}
        DSS: {status.subscriptionState === 'subscribed' ? 'online' : status.subscriptionState === 'subscribing' ? 'sync' : status.subscriptionState}
      </div>
      <div className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">
        <Radio className="h-3.5 w-3.5" />
        Сигнал: {formatRelativeSeconds(status.lastSignalAt)}
      </div>
      <div className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">
        <Clock3 className="h-3.5 w-3.5" />
        Sync: {formatRelativeSeconds(status.lastReviewSyncAt)}
      </div>
      <div className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">
        <ArrowRightLeft className="h-3.5 w-3.5" />
        {status.entryCount} / {status.exitCount}
      </div>
    </div>
  );
}

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

const getExitPermitComment = (candidate: ExitCandidate) => {
  const comment = candidate.exit_permit?.comment?.trim();
  return comment ? comment : null;
};

const getExitPermitComments = (candidates: ExitCandidate[]) => candidates.flatMap((candidate) => {
  const comment = getExitPermitComment(candidate);

  return comment ? [{
    visitorId: candidate.visitor_id,
    plateNumber: candidate.plate_number,
    comment,
  }] : [];
});

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

const doesEntryEventMatchItem = (event: DssUnknownVehicleDetectedEvent | null, item: CheckpointQueueItem | null) => {
  if (!event || !item || getEventDirection(event) !== 'entry') return false;

  if (event.checkpoint_id != null && item.checkpoint_id !== event.checkpoint_id) {
    return false;
  }

  if (event.vehicle_capture_id != null && item.capture_id != null) {
    return event.vehicle_capture_id === item.capture_id;
  }

  const normalizedEventPlate = normalizePlateNumber(event.plate_no);
  if (!normalizedEventPlate) return false;

  return [item.plate_number, item.original_plate_number, item.matched_plate_number]
    .some((plate) => normalizePlateNumber(plate) === normalizedEventPlate);
};

const doesExitEventMatchItem = (event: DssUnknownVehicleDetectedEvent | null, item: ExitReviewItem | null) => {
  if (!event || !item || getEventDirection(event) !== 'exit') return false;

  if (event.checkpoint_id != null && item.checkpoint_id !== event.checkpoint_id) {
    return false;
  }

  if (event.vehicle_capture_id != null && item.capture_id != null) {
    return event.vehicle_capture_id === item.capture_id;
  }

  return normalizePlateNumber(event.plate_no) === normalizePlateNumber(item.plate_number);
};

const getCheckpointKey = (event: DssUnknownVehicleDetectedEvent) => {
  if (event.checkpoint_id != null) return String(event.checkpoint_id);
  return `unknown:${event.point_name || event.channel_name || event.device_name || 'no-checkpoint'}`;
};

export default function DssCheckpointDesk({ checkpoints, selectedCheckpointKey, selectedYardId = null, onStatusChange }: DssCheckpointDeskProps) {
  const [connectionState, setConnectionState] = useState<string>('initialized');
  const [subscriptionState, setSubscriptionState] = useState<DssChannelSubscriptionState>('idle');
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [lastSignalAt, setLastSignalAt] = useState<string | null>(null);
  const [lastReviewSyncAt, setLastReviewSyncAt] = useState<string | null>(null);
  const [events, setEvents] = useState<DssUnknownVehicleDetectedEvent[]>([]);
  const [entryQueuesByCheckpoint, setEntryQueuesByCheckpoint] = useState<Record<number, CheckpointQueueItem[]>>({});
  const [exitQueuesByCheckpoint, setExitQueuesByCheckpoint] = useState<Record<number, ExitReviewItem[]>>({});
  const [loadingEntryByCheckpoint, setLoadingEntryByCheckpoint] = useState<Record<number, boolean>>({});
  const [loadingExitByCheckpoint, setLoadingExitByCheckpoint] = useState<Record<number, boolean>>({});
  const [pinnedEntryVisitorId, setPinnedEntryVisitorId] = useState<number | null>(null);
  const [pinnedExitReviewId, setPinnedExitReviewId] = useState<number | null>(null);
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
  const [manualExitDialog, setManualExitDialog] = useState<{
    open: boolean;
    checkpointId: number | null;
    yardId: number | null;
    search: string;
    selectedVisitorId: number | null;
    openBarrier: boolean;
    overrideExitPermit: boolean;
    overrideReason: string;
  }>({
    open: false,
    checkpointId: null,
    yardId: null,
    search: '',
    selectedVisitorId: null,
    openBarrier: false,
    overrideExitPermit: false,
    overrideReason: '',
  });
  const [manualExitVisitors, setManualExitVisitors] = useState<TerritoryVisitor[]>([]);
  const [manualExitLoading, setManualExitLoading] = useState(false);
  const [processingManualExitVisitorId, setProcessingManualExitVisitorId] = useState<number | null>(null);
  const [exitConfirmDialog, setExitConfirmDialog] = useState<{
    open: boolean;
    item: ExitReviewItem | null;
    selectedVisitorId: number | null;
    correctedPlate: string;
    openBarrier: boolean;
    overrideExitPermit: boolean;
    overrideReason: string;
    releaseWithoutVisit: boolean;
    releaseReason: string;
  }>({
    open: false,
    item: null,
    selectedVisitorId: null,
    correctedPlate: '',
    openBarrier: false,
    overrideExitPermit: false,
    overrideReason: '',
    releaseWithoutVisit: false,
    releaseReason: '',
  });
  const [manualSearchResults, setManualSearchResults] = useState<ExitCandidate[]>([]);
  const [manualSearchLoading, setManualSearchLoading] = useState(false);
  const [exitTerritoryVisitors, setExitTerritoryVisitors] = useState<TerritoryVisitor[]>([]);
  const [loadingExitTerritoryVisitors, setLoadingExitTerritoryVisitors] = useState(false);
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

  const filteredEvents = useMemo(() => {
    if (selectedCheckpointKey === 'all') return events;
    return events.filter((event) => getCheckpointKey(event) === selectedCheckpointKey);
  }, [events, selectedCheckpointKey]);

  const selectedCheckpointId = useMemo(() => {
    if (selectedCheckpointKey === 'all') return null;
    const parsed = Number(selectedCheckpointKey);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [selectedCheckpointKey]);

  const currentCheckpoint = useMemo(
    () => (selectedCheckpointId ? checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) ?? null : null),
    [checkpoints, selectedCheckpointId],
  );

  const entryEvents = useMemo(() => filteredEvents.filter((event) => getEventDirection(event) === 'entry'), [filteredEvents]);
  const exitEvents = useMemo(() => filteredEvents.filter((event) => getEventDirection(event) === 'exit'), [filteredEvents]);
  const latestEntryEvent = useMemo(() => entryEvents[0] ?? null, [entryEvents]);
  const latestExitEvent = useMemo(() => exitEvents[0] ?? null, [exitEvents]);
  const pendingEntryQueuesByCheckpoint = useMemo(
    () => Object.entries(entryQueuesByCheckpoint).reduce<Record<number, CheckpointQueueItem[]>>((accumulator, [checkpointId, items]) => {
      const parsedCheckpointId = Number(checkpointId);
      if (Number.isFinite(parsedCheckpointId)) {
        accumulator[parsedCheckpointId] = items.filter((item) => item.confirmation_status === 'pending');
      }
      return accumulator;
    }, {}),
    [entryQueuesByCheckpoint],
  );
  const pendingExitQueuesByCheckpoint = useMemo(
    () => Object.entries(exitQueuesByCheckpoint).reduce<Record<number, ExitReviewItem[]>>((accumulator, [checkpointId, items]) => {
      const parsedCheckpointId = Number(checkpointId);
      if (Number.isFinite(parsedCheckpointId)) {
        accumulator[parsedCheckpointId] = items.filter((item) => item.status === 'pending');
      }
      return accumulator;
    }, {}),
    [exitQueuesByCheckpoint],
  );

  useEffect(() => {
    if (!onStatusChange) {
      return;
    }

    onStatusChange({
      connectionState,
      subscriptionState,
      lastSignalAt,
      lastReviewSyncAt,
      entryCount: entryEvents.length,
      exitCount: exitEvents.length,
    });
  }, [connectionState, entryEvents.length, exitEvents.length, lastReviewSyncAt, lastSignalAt, onStatusChange, subscriptionState]);

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
      return matchEntryReviewItem(latestEntryEvent, pendingEntryQueuesByCheckpoint[latestEntryEvent.checkpoint_id] ?? []);
    }

    if (selectedCheckpointId) {
      return pendingEntryQueuesByCheckpoint[selectedCheckpointId]?.[0] ?? null;
    }

    return null;
  }, [latestEntryEvent, pendingEntryQueuesByCheckpoint, selectedCheckpointId]);

  const exitReviewItem = useMemo(() => {
    if (latestExitEvent?.checkpoint_id) {
      return matchExitReviewItem(latestExitEvent, pendingExitQueuesByCheckpoint[latestExitEvent.checkpoint_id] ?? []);
    }

    if (selectedCheckpointId) {
      return pendingExitQueuesByCheckpoint[selectedCheckpointId]?.[0] ?? null;
    }

    return null;
  }, [latestExitEvent, pendingExitQueuesByCheckpoint, selectedCheckpointId]);

  const displayedEntryEvent = useMemo(() => {
    if (!latestEntryEvent) {
      return null;
    }

    if (!entryReviewItem) {
      return latestEntryEvent;
    }

    return doesEntryEventMatchItem(latestEntryEvent, entryReviewItem) ? latestEntryEvent : null;
  }, [entryReviewItem, latestEntryEvent]);

  const displayedExitEvent = useMemo(() => {
    if (!latestExitEvent) {
      return null;
    }

    if (!exitReviewItem) {
      return latestExitEvent;
    }

    return doesExitEventMatchItem(latestExitEvent, exitReviewItem) ? latestExitEvent : null;
  }, [exitReviewItem, latestExitEvent]);

  const selectedManualTruck = useMemo(
    () => manualTruckResults.find((truck) => truck.plate_number.toUpperCase() === manualDialog.plateNumber.trim().toUpperCase()) ?? null,
    [manualDialog.plateNumber, manualTruckResults],
  );

  const manualExitCheckpoint = useMemo(
    () => (manualExitDialog.checkpointId ? checkpoints.find((checkpoint) => checkpoint.id === manualExitDialog.checkpointId) ?? null : null),
    [checkpoints, manualExitDialog.checkpointId],
  );

  const filteredManualExitVisitors = useMemo(() => {
    const query = normalizePlateNumber(manualExitDialog.search);
    if (!query) {
      return manualExitVisitors;
    }

    return manualExitVisitors.filter((visitor) => normalizePlateNumber([
      visitor.plate_number,
      visitor.user_name,
      visitor.user_phone,
      visitor.truck_model_name,
      visitor.name,
      visitor.description,
      visitor.entrance_device_name,
      visitor.exit_permit?.comment,
      visitor.comment,
    ].filter(Boolean).join(' ')).includes(query));
  }, [manualExitDialog.search, manualExitVisitors]);

  const selectedManualExitVisitor = useMemo(
    () => manualExitVisitors.find((visitor) => visitor.id === manualExitDialog.selectedVisitorId) ?? null,
    [manualExitDialog.selectedVisitorId, manualExitVisitors],
  );

  const selectedConfirmSearchTruck = useMemo(
    () => searchResults.find((truck) => truck.truck_id === confirmDialog.selectedTruckId) ?? null,
    [confirmDialog.selectedTruckId, searchResults],
  );

  const selectedConfirmTask = useMemo(
    () => expectedTasks.find((task) => task.id === confirmDialog.selectedTaskId) ?? null,
    [confirmDialog.selectedTaskId, expectedTasks],
  );

  const selectedExitSystemCandidate = useMemo(
    () => manualSearchResults.find((candidate) => candidate.visitor_id === exitConfirmDialog.selectedVisitorId) ?? null,
    [exitConfirmDialog.selectedVisitorId, manualSearchResults],
  );

  const selectedExitTerritoryVisitor = useMemo(
    () => exitTerritoryVisitors.find((visitor) => visitor.id === exitConfirmDialog.selectedVisitorId) ?? null,
    [exitConfirmDialog.selectedVisitorId, exitTerritoryVisitors],
  );

  const prioritizedExitTerritoryVisitors = useMemo(() => {
    const query = normalizePlateNumber(exitConfirmDialog.correctedPlate);
    if (!query) {
      return exitTerritoryVisitors;
    }

    const matched: TerritoryVisitor[] = [];
    const unmatched: TerritoryVisitor[] = [];

    exitTerritoryVisitors.forEach((visitor) => {
      const searchable = normalizePlateNumber([
        visitor.plate_number,
        visitor.user_name,
        visitor.user_phone,
        visitor.truck_model_name,
        visitor.name,
        visitor.description,
        visitor.entrance_device_name,
        visitor.exit_permit?.comment,
        visitor.comment,
      ].filter(Boolean).join(' '));

      if (searchable.includes(query)) {
        matched.push(visitor);
        return;
      }

      unmatched.push(visitor);
    });

    return [...matched, ...unmatched];
  }, [exitConfirmDialog.correctedPlate, exitTerritoryVisitors]);

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

  const dismissEntryContext = useCallback((item: CheckpointQueueItem | null | undefined) => {
    if (!item) {
      return;
    }

    setEvents((current) => current.filter((event) => !doesEntryEventMatchItem(event, item)));
    setEntryQueuesByCheckpoint((current) => {
      const checkpointQueue = current[item.checkpoint_id];
      if (!checkpointQueue) {
        return current;
      }

      return {
        ...current,
        [item.checkpoint_id]: checkpointQueue.filter((queueItem) => queueItem.visitor_id !== item.visitor_id),
      };
    });
  }, []);

  const dismissExitContext = useCallback((item: ExitReviewItem | null | undefined) => {
    if (!item) {
      return;
    }

    setEvents((current) => current.filter((event) => !doesExitEventMatchItem(event, item)));
    setExitQueuesByCheckpoint((current) => {
      const checkpointQueue = current[item.checkpoint_id];
      if (!checkpointQueue) {
        return current;
      }

      return {
        ...current,
        [item.checkpoint_id]: checkpointQueue.filter((queueItem) => queueItem.review_id !== item.review_id),
      };
    });
  }, []);

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

  const fetchActiveTerritoryVisitors = useCallback(async (yardId: number) => {
    const response = await axios.post('/security/getvisitors', {
      yard_id: yardId,
    }, {
      headers: getAuthHeaders(),
    });

    return (response.data?.data ?? []).filter((visitor: TerritoryVisitor) => !visitor.exit_date);
  }, []);

  const loadManualExitVisitors = useCallback(async (yardId: number) => {
    setManualExitLoading(true);
    try {
      const activeVisitors = await fetchActiveTerritoryVisitors(yardId);

      setManualExitVisitors(activeVisitors);
      setManualExitDialog((current) => ({
        ...current,
        selectedVisitorId: current.selectedVisitorId ?? (activeVisitors.length === 1 ? activeVisitors[0].id : null),
      }));
    } catch (error) {
      console.error('Ошибка загрузки ТС на территории для ручного выезда:', error);
      setManualExitVisitors([]);
      toast.error('Не удалось загрузить ТС на территории');
    } finally {
      setManualExitLoading(false);
    }
  }, [fetchActiveTerritoryVisitors]);

  const loadExitTerritoryVisitors = useCallback(async (yardId: number) => {
    setLoadingExitTerritoryVisitors(true);
    try {
      const activeVisitors = await fetchActiveTerritoryVisitors(yardId);
      setExitTerritoryVisitors(activeVisitors);
    } catch (error) {
      console.error('Ошибка загрузки списка ТС на территории для exit review:', error);
      setExitTerritoryVisitors([]);
    } finally {
      setLoadingExitTerritoryVisitors(false);
    }
  }, [fetchActiveTerritoryVisitors]);

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

  useEffect(() => {
    const item = exitConfirmDialog.item;
    if (!exitConfirmDialog.open || !item) return;

    void loadExitTerritoryVisitors(item.yard_id);
  }, [exitConfirmDialog.open, exitConfirmDialog.item, loadExitTerritoryVisitors]);

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

  const openManualExitDialog = async (checkpointId: number | null | undefined) => {
    if (!checkpointId) {
      toast.error('Выберите конкретный КПП для ручного выезда');
      return;
    }

    const checkpoint = checkpoints.find((item) => item.id === checkpointId) ?? null;
    if (!checkpoint?.yard_id) {
      toast.error('Для выбранного КПП не найден привязанный двор');
      return;
    }

    setManualExitDialog({
      open: true,
      checkpointId,
      yardId: checkpoint.yard_id,
      search: '',
      selectedVisitorId: null,
      openBarrier: false,
      overrideExitPermit: false,
      overrideReason: '',
    });
    setManualExitVisitors([]);
    await loadManualExitVisitors(checkpoint.yard_id);
  };

  const closeManualDialog = () => {
    setManualDialog({ open: false, checkpointId: null, plateNumber: '' });
    setManualTruckResults([]);
    setManualCreatePermit(false);
    setManualCreateWeighing(false);
    setManualOpenBarrier(false);
    setManualComment('');
  };

  const closeManualExitDialog = () => {
    setManualExitDialog({
      open: false,
      checkpointId: null,
      yardId: null,
      search: '',
      selectedVisitorId: null,
      openBarrier: false,
      overrideExitPermit: false,
      overrideReason: '',
    });
    setManualExitVisitors([]);
  };

  const openExitConfirmDialog = (item: ExitReviewItem) => {
    setExitConfirmDialog({
      open: true,
      item,
      selectedVisitorId: item.candidate_visitors.length === 1 ? item.candidate_visitors[0].visitor_id : null,
      correctedPlate: item.plate_number,
      openBarrier: false,
      overrideExitPermit: false,
      overrideReason: '',
      releaseWithoutVisit: false,
      releaseReason: '',
    });
    setManualSearchResults(item.candidate_visitors);
  };

  const closeExitConfirmDialog = () => {
    setExitConfirmDialog({
      open: false,
      item: null,
      selectedVisitorId: null,
      correctedPlate: '',
      openBarrier: false,
      overrideExitPermit: false,
      overrideReason: '',
      releaseWithoutVisit: false,
      releaseReason: '',
    });
    setManualSearchResults([]);
    setExitTerritoryVisitors([]);
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

  const handleManualExit = async () => {
    const visitor = selectedManualExitVisitor;
    if (!visitor) {
      toast.error('Выберите ТС, для которого нужно зафиксировать выезд');
      return;
    }

    if (manualExitDialog.overrideExitPermit && manualExitDialog.overrideReason.trim().length < 3) {
      toast.error('Укажите причину ручного выпуска без разрешения на выезд');
      return;
    }

    if (visitor.exit_permit_required && !visitor.has_active_exit_permit && !manualExitDialog.overrideExitPermit) {
      toast.error('Для этого визита нужно разрешение на выезд или ручной выпуск с причиной');
      return;
    }

    const checkpointId = manualExitDialog.checkpointId;
    setProcessingManualExitVisitorId(visitor.id);

    try {
      const response = await axios.post('/security/exitvisitor', {
        id: visitor.id,
        checkpoint_id: checkpointId,
        open_barrier: manualExitDialog.openBarrier,
        override_exit_permit: manualExitDialog.overrideExitPermit || undefined,
        override_reason: manualExitDialog.overrideExitPermit ? manualExitDialog.overrideReason.trim() : undefined,
      }, {
        headers: getAuthHeaders(),
      });

      if (response.data?.status) {
        toast.success(manualExitDialog.overrideExitPermit ? 'Выезд зафиксирован вручную' : 'Выезд зафиксирован');

        if (manualExitDialog.openBarrier) {
          if (response.data?.data?.barrier_opened) {
            toast.success('Шлагбаум открыт');
          } else {
            toast.error(response.data?.data?.barrier_open_error || 'Выезд зафиксирован, но шлагбаум не открылся');
          }
        }

        closeManualExitDialog();
        await refreshCheckpointContext(checkpointId);
      } else {
        toast.error(response.data?.message || 'Не удалось зафиксировать выезд');
      }
    } catch (error: unknown) {
      console.error('Ошибка ручного завершения визита:', error);
      toast.error(getRequestErrorMessage(error, 'Не удалось зафиксировать ручной выезд'));
    } finally {
      setProcessingManualExitVisitorId(null);
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

        dismissEntryContext(item);
        setPinnedEntryVisitorId(null);
        closeConfirmDialog();
        await refreshCheckpointContext(item.checkpoint_id);
      } else {
        toast.error(response.data?.message || 'Не удалось подтвердить въезд');
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
        dismissEntryContext(item);
        setPinnedEntryVisitorId(null);
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

    if (exitConfirmDialog.releaseWithoutVisit) {
      if (exitConfirmDialog.releaseReason.trim().length < 3) {
        toast.error('Укажите причину выпуска ТС без визита (минимум 3 символа)');
        return;
      }
    } else {
      if (!exitConfirmDialog.selectedVisitorId) {
        toast.error('Выберите активный визит для подтверждения выезда');
        return;
      }
      if (exitConfirmDialog.overrideExitPermit && exitConfirmDialog.overrideReason.trim().length < 3) {
        toast.error('Укажите причину выпуска без разрешения на выезд');
        return;
      }
    }

    const userId = Number(localStorage.getItem('user_id') || '1');
    setProcessingExitReviewId(item.review_id);

    try {
      const response = await axios.post('/security/confirm-exit-review', {
        review_id: item.review_id,
        operator_user_id: userId,
        ...(exitConfirmDialog.releaseWithoutVisit
          ? {
              release_without_visit: true,
              release_reason: exitConfirmDialog.releaseReason,
              open_barrier: exitConfirmDialog.openBarrier,
            }
          : {
              visitor_id: exitConfirmDialog.selectedVisitorId,
              open_barrier: exitConfirmDialog.openBarrier,
              override_exit_permit: exitConfirmDialog.overrideExitPermit,
              override_reason: exitConfirmDialog.overrideExitPermit ? exitConfirmDialog.overrideReason : undefined,
            }),
      }, {
        headers: getAuthHeaders(),
      });

      if (response.data?.status) {
        toast.success('Выезд подтверждён');

        if (exitConfirmDialog.openBarrier) {
          if (response.data?.data?.barrier_opened) {
            toast.success('Шлагбаум открыт');
          } else {
            toast.error(response.data?.data?.barrier_open_error || 'Выезд подтверждён, но шлагбаум не открылся');
          }
        }

        dismissExitContext(item);
        setPinnedExitReviewId(null);
        closeExitConfirmDialog();
        await refreshCheckpointContext(item.checkpoint_id);
      } else {
        toast.error(response.data?.message || 'Не удалось подтвердить выезд');
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
        dismissExitContext(item);
        setPinnedExitReviewId(null);
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
    <div className={`min-w-0 gap-2 ${plateImageSrc ? 'grid sm:grid-cols-[minmax(0,1fr)_6.5rem]' : 'space-y-2'}`}>
      <div className="group relative overflow-hidden rounded-2xl border bg-muted/30">
        {imageSrc ? (
          <button type="button" onClick={() => openImagePreview(imageSrc, imageAlt || 'Фото ТС')} className="block h-full w-full cursor-zoom-in">
            <img src={imageSrc} alt={imageAlt || 'Фото ТС'} className="h-40 w-full object-cover transition-transform duration-300 group-hover:scale-105 sm:h-44" />
          </button>
        ) : (
          <div className="flex h-40 items-center justify-center text-muted-foreground sm:h-44">
            <Camera className="h-8 w-8" />
          </div>
        )}
      </div>

      {plateImageSrc && (
        <button type="button" onClick={() => openImagePreview(plateImageSrc, plateImageAlt || 'Фото номера')} className="group relative block overflow-hidden rounded-2xl border bg-muted/30 text-left">
          <img src={plateImageSrc} alt={plateImageAlt || 'Фото номера'} className="h-16 w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105 sm:h-24" />
        </button>
      )}
    </div>
  );

  const renderInfoRow = (label: string, value?: string | null) => (
    <div className="inline-flex max-w-full items-center gap-1.5 rounded-lg border bg-background/70 px-2 py-1.5 text-xs leading-4 text-foreground">
      <span className="shrink-0 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}:</span>
      <span className="min-w-0 break-words font-medium">
        {value && String(value).trim().length > 0 ? value : '—'}
      </span>
    </div>
  );

  const renderSummaryTile = (label: string, value: string, toneClass?: string) => (
    <div className="rounded-xl border bg-background/70 px-2.5 py-2">
      <div className="text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={`mt-1 break-words text-xs font-semibold leading-4 sm:text-sm ${toneClass ?? 'text-foreground'}`}>{value}</div>
    </div>
  );

  const renderCompactSummaryTile = (label: string, value: string, toneClass?: string) => (
    <div className="rounded-lg border bg-background/70 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}:</span>
        <span className={`min-w-0 break-words text-xs font-semibold leading-4 ${toneClass ?? 'text-foreground'}`}>{value}</span>
      </div>
    </div>
  );

  const renderIconTile = (icon: React.ReactNode, label: string, value: string, toneClass?: string) => (
    <div className="flex items-center gap-2.5 rounded-xl border bg-background/70 px-2.5 py-2">
      <div className="shrink-0 text-muted-foreground/60">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
        <div className={`mt-0.5 truncate text-xs font-semibold ${toneClass ?? 'text-foreground'}`}>{value}</div>
      </div>
    </div>
  );

  const renderGuardDecisionHint = (title: string, tone: 'neutral' | 'warning' | 'danger' = 'neutral') => {
    const config = tone === 'danger'
      ? { wrapper: 'border-red-200 bg-red-50/90 text-red-900', bar: 'bg-red-500', icon: <ShieldAlert className="h-4 w-4 shrink-0" /> }
      : tone === 'warning'
        ? { wrapper: 'border-amber-200 bg-amber-50/90 text-amber-900', bar: 'bg-amber-500', icon: <AlertTriangle className="h-4 w-4 shrink-0" /> }
        : { wrapper: 'border-emerald-200 bg-emerald-50/90 text-emerald-900', bar: 'bg-emerald-500', icon: <Info className="h-4 w-4 shrink-0" /> };

    return (
      <div className={`flex items-stretch overflow-hidden rounded-xl border ${config.wrapper}`}>
        <div className={`w-1 shrink-0 ${config.bar}`} />
        <div className="flex min-w-0 items-start gap-2.5 px-3 py-2.5">
          <div className="mt-0.5 shrink-0 opacity-70">{config.icon}</div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-60">Причина ожидания</div>
            <div className="mt-0.5 text-sm font-semibold leading-5">{title}</div>
          </div>
        </div>
      </div>
    );
  };

  const renderEntryCard = () => {
    const event = displayedEntryEvent;
    const item = pinnedEntryVisitorId !== null
      ? (Object.values(pendingEntryQueuesByCheckpoint).flat().find(i => i.visitor_id === pinnedEntryVisitorId) ?? entryReviewItem)
      : entryReviewItem;
    const selectedCheckpoint = selectedCheckpointId ? checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) ?? null : null;

    if (!event && !item) {
      return (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground sm:text-sm">
          По выбранному КПП входящих событий пока не было.
        </div>
      );
    }

    const imageSrc = item?.capture_picture_url || event?.capture_picture;
    const plateImageSrc = item?.capture_plate_picture_url || event?.plate_picture;
    const checkpointId = event?.checkpoint_id ?? item?.checkpoint_id ?? selectedCheckpointId ?? null;
    const allPendingEntryItems = checkpointId ? (pendingEntryQueuesByCheckpoint[checkpointId] ?? []) : [];
    const otherPendingEntryItems = item
      ? allPendingEntryItems.filter((q) => q.visitor_id !== item.visitor_id)
      : allPendingEntryItems;
    const isLoadingReview = checkpointId ? !!loadingEntryByCheckpoint[checkpointId] : false;
    const canManualAdd = checkpointId != null;
    const canConfirmEntry = !!item && item.confirmation_status === 'pending';
    const canOpenEntryFallback = canManualAdd && !item;
    const canRejectEntry = !!item && item.confirmation_status === 'pending';
    const checkpointLabel = event?.checkpoint_name || selectedCheckpoint?.name || (item?.checkpoint_id ? String(item.checkpoint_id) : 'Без привязки');
    const yardLabel = item?.yard_name || selectedCheckpoint?.yard_name || event?.parking_lot_name || event?.source_name;
    const deviceLabel = item?.device_name || event?.device_name || event?.point_name || event?.channel_name;
    const plateLabel = event?.plate_no || item?.plate_number || 'Без номера';
    const captureLabel = item?.capture_time || event?.capture_time || event?.created_at || item?.entry_date;
    const imageTitle = `ТС ${plateLabel}`;
    const matchLabel = item?.matched_truck_id ? 'ТС найдено в базе' : 'Нужна ручная проверка';
    const permitLabel = item?.has_permit
      ? `Разрешение: ${item.permit_type === 'one_time' ? 'разовое' : 'постоянное'}`
      : item?.yard_strict_mode
        ? 'Без разрешения, строгий режим'
        : 'Без разрешения';
    const taskLabel = item?.task_name || 'Задание не назначено';
    const weighingTypeText = (t?: string | null) => t === 'entry' ? 'Въезд' : t === 'exit' ? 'Выезд' : t === 'both' ? 'Въезд + выезд' : null;
    const weighingReasonText = (r?: string | null) => {
      switch (r) {
        case 'yard_policy': return 'политика территории';
        case 'truck_category': return 'категория ТС';
        case 'truck_flag': return 'флаг ТС';
        case 'permit': return 'условие разрешения';
        case 'task': return 'задание';
        case 'manual': return 'ручное назначение';
        default: return r || null;
      }
    };
    const weighingLabel = item?.has_weighing_task
      ? [weighingTypeText(item.weighing_required_type), weighingReasonText(item.weighing_reason)].filter(Boolean).join(' — ')
      : 'Не требуется';
    const entryDecisionHint = !item
      ? renderGuardDecisionHint('ТС не привязано к записи очереди — нет контекста КПП', 'warning')
      : item.pending_reason === 'truck_not_found'
        ? renderGuardDecisionHint('🚫 ТС не найдено в базе — номер не распознан или ТС не зарегистрировано', 'danger')
        : item.pending_reason === 'no_permit'
          ? renderGuardDecisionHint('🔒 Нет разрешения — территория работает в строгом режиме', 'danger')
          : item.pending_reason === 'low_confidence'
            ? renderGuardDecisionHint(`⚠️ Низкая уверенность распознавания номера (${item.recognition_confidence ?? '?'}%) — требуется сверка`, 'warning')
            : !item.has_permit && item.matched_truck_id
              ? renderGuardDecisionHint('🔓 Нет разрешения на въезд — ТС найдено в базе, но разрешение не оформлено', 'warning')
              : !item.matched_truck_id
                ? renderGuardDecisionHint('🔍 ТС не найдено в базе — требуется ручная проверка номера', 'warning')
                : item.pending_reason_text
                  ? renderGuardDecisionHint(item.pending_reason_text, 'neutral')
                  : renderGuardDecisionHint('Ручная проверка: подтвердите или отклоните въезд', 'neutral');

    return (
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="shrink-0 border-b bg-gradient-to-b from-emerald-50/50 to-muted/10 px-3 py-3 sm:px-4">
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="shrink-0 rounded-lg bg-foreground/[0.05] px-3 py-1.5 ring-1 ring-foreground/[0.09]">
                  <span className="min-w-0 break-all font-mono text-xl font-black tracking-[0.18em] text-foreground sm:text-2xl">{plateLabel}</span>
                </div>
                <Badge className="bg-emerald-100 text-emerald-700">Въезд</Badge>
                {item ? <Badge className={getEntryStatusBadgeClass(item.confirmation_status)}>{getEntryStatusLabel(item.confirmation_status)}</Badge> : <Badge variant="outline">Нет review-контекста</Badge>}
                {item?.recognition_confidence != null && <Badge className={getConfidenceBadgeClass(item.recognition_confidence)}>Точность {item.recognition_confidence}%</Badge>}
                {!event && item && <Badge variant="outline">Из очереди КПП</Badge>}
                {isLoadingReview && <Badge variant="outline"><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Синхронизация</Badge>}
              </div>
            </div>

            <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-4">
              {renderIconTile(<Truck className="h-3.5 w-3.5" />, 'Сопоставление', matchLabel, item?.matched_truck_id ? 'text-emerald-700' : 'text-amber-700')}
              {renderIconTile(<FileCheck className="h-3.5 w-3.5" />, 'Разрешение', permitLabel, item?.has_permit ? 'text-emerald-700' : item?.yard_strict_mode ? 'text-red-700' : 'text-amber-700')}
              {renderIconTile(<ClipboardList className="h-3.5 w-3.5" />, 'Задание', taskLabel, item?.task_name ? 'text-foreground' : 'text-muted-foreground')}
              {renderIconTile(<Scale className="h-3.5 w-3.5" />, 'Весовой контроль', weighingLabel, item?.has_weighing_task ? 'text-blue-700' : 'text-muted-foreground')}
            </div>

            {entryDecisionHint}
          </div>
        </div>

        <div className="flex-1 p-2.5 sm:p-3">
          <div className="space-y-3">
            {renderCaptureMedia(imageSrc, imageTitle, plateImageSrc, `Номер ${plateLabel}`)}

            <div className="rounded-2xl border bg-background/60 p-2">
              <div className="flex flex-wrap gap-1.5">
                  {renderInfoRow('КПП', checkpointLabel)}
                  {renderInfoRow('Устройство', deviceLabel)}
                  {renderInfoRow('Территория', yardLabel)}
                  {renderInfoRow('Время фиксации', formatDateTime(captureLabel))}
              </div>
            </div>
          </div>
        </div>

        {otherPendingEntryItems.length > 0 && (
          <div className="shrink-0 border-t border-amber-200 bg-amber-50/60 px-2.5 py-2 dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              <Clock3 className="h-3 w-3" />
              Ещё {otherPendingEntryItems.length} в очереди
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {otherPendingEntryItems.map((queueItem) => (
                <button
                  key={queueItem.visitor_id}
                  type="button"
                  onClick={() => setPinnedEntryVisitorId(queueItem.visitor_id)}
                  className="shrink-0 rounded-lg border bg-white px-2.5 py-1.5 text-left text-xs shadow-sm transition-colors hover:bg-amber-50 dark:bg-background dark:hover:bg-amber-950/30"
                >
                  <div className="font-mono font-semibold tracking-wide">{queueItem.plate_number}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{formatDateTime(queueItem.capture_time ?? queueItem.entry_date)}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {queueItem.has_permit
                      ? <span className="rounded bg-emerald-100 px-1 py-px text-[9px] font-medium text-emerald-700">Разрешение</span>
                      : <span className="rounded bg-amber-100 px-1 py-px text-[9px] font-medium text-amber-700">Без разрешения</span>}
                    {queueItem.recognition_confidence != null && (
                      <span className="rounded bg-slate-100 px-1 py-px text-[9px] font-medium text-slate-600">{queueItem.recognition_confidence}%</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="shrink-0 border-t bg-background/60 p-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" className="h-9 w-full justify-center rounded-xl" onClick={() => canConfirmEntry && item ? openConfirmDialog(item) : openManualDialog(checkpointId, event?.plate_no || item?.plate_number)} disabled={(!canConfirmEntry && !canOpenEntryFallback) || processingVisitorId === item?.visitor_id}>
              {processingVisitorId === item?.visitor_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {canConfirmEntry ? 'Подтвердить въезд' : 'Исправить номер и добавить'}
            </Button>

            <Button type="button" variant="destructive" className="h-9 w-full justify-center rounded-xl" onClick={() => item && handleRejectEntry(item)} disabled={!canRejectEntry || processingVisitorId === item?.visitor_id}>
              {processingVisitorId === item?.visitor_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Отклонить въезд
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderExitCard = () => {
    const event = displayedExitEvent;
    const item = pinnedExitReviewId !== null
      ? (Object.values(pendingExitQueuesByCheckpoint).flat().find(i => i.review_id === pinnedExitReviewId) ?? exitReviewItem)
      : exitReviewItem;
    const selectedCheckpoint = selectedCheckpointId ? checkpoints.find((checkpoint) => checkpoint.id === selectedCheckpointId) ?? null : null;
    const exitPermitComments = item ? getExitPermitComments(item.candidate_visitors) : [];

    if (!event && !item) {
      return (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground sm:text-sm">
          По выбранному КПП исходящих событий пока не было.
        </div>
      );
    }

    const imageSrc = item?.capture_picture_url || event?.capture_picture;
    const plateImageSrc = item?.capture_plate_picture_url || event?.plate_picture;
    const checkpointId = event?.checkpoint_id ?? item?.checkpoint_id ?? selectedCheckpointId ?? null;
    const allPendingExitItems = checkpointId ? (pendingExitQueuesByCheckpoint[checkpointId] ?? []) : [];
    const otherPendingExitItems = item
      ? allPendingExitItems.filter((q) => q.review_id !== item.review_id)
      : allPendingExitItems;
    const isLoadingReview = checkpointId ? !!loadingExitByCheckpoint[checkpointId] : false;
    const checkpointLabel = event?.checkpoint_name || item?.checkpoint_name || selectedCheckpoint?.name || 'Без привязки';
    const yardLabel = item?.yard_name || selectedCheckpoint?.yard_name || event?.parking_lot_name || event?.source_name;
    const deviceLabel = item?.device_name || event?.device_name || event?.point_name || event?.channel_name;
    const plateLabel = event?.plate_no || item?.plate_number || 'Без номера';
    const captureLabel = item?.capture_time || event?.capture_time || event?.created_at;
    const canOpenExitFallback = checkpointId != null && !item;
    const suggestedCandidate = item?.candidate_visitors[0] ?? null;
    const hasSuggestedCandidate = suggestedCandidate !== null;
    const hasMissingRequiredExitPermit = item?.candidate_visitors.some((candidate) => candidate.exit_permit_required && !candidate.has_active_exit_permit) ?? false;
    const exitDecisionHint = !item
      ? renderGuardDecisionHint('ТС зафиксировано на выезде без контекста обзора', 'warning')
      : !hasSuggestedCandidate
        ? renderGuardDecisionHint('🔍 Активный визит не найден — ТС, возможно, въезжало без камеры', 'warning')
        : hasMissingRequiredExitPermit
          ? renderGuardDecisionHint('🔒 Нет активного разрешения на выезд для выбранного визита', 'danger')
          : renderGuardDecisionHint('✅ Визит определён — требуется подтверждение оператора', 'neutral');

    return (
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="shrink-0 border-b bg-gradient-to-b from-orange-50/50 to-muted/10 px-3 py-3 sm:px-4">
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="shrink-0 rounded-lg bg-foreground/[0.05] px-3 py-1.5 ring-1 ring-foreground/[0.09]">
                  <span className="min-w-0 break-all font-mono text-xl font-black tracking-[0.18em] text-foreground sm:text-2xl">{plateLabel}</span>
                </div>
                <Badge className="bg-orange-100 text-orange-700">Выезд</Badge>
                {item ? <Badge className={getExitStatusBadgeClass(item.status)}>{getExitStatusLabel(item.status)}</Badge> : <Badge variant="outline">Нет exit-review контекста</Badge>}
                {item?.recognition_confidence != null && <Badge className={getConfidenceBadgeClass(item.recognition_confidence)}>Точность {item.recognition_confidence}%</Badge>}
                {!event && item && <Badge variant="outline">Из очереди КПП</Badge>}
                {isLoadingReview && <Badge variant="outline"><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Синхронизация</Badge>}
              </div>
            </div>

            <div className="grid gap-1.5 sm:grid-cols-2">
              {renderIconTile(<Truck className="h-3.5 w-3.5" />, 'Сопоставление', item?.truck_id ? 'ТС найдено в базе' : 'Нужен ручной выбор', item?.truck_id ? 'text-emerald-700' : 'text-amber-700')}
              {renderIconTile(<ScrollText className="h-3.5 w-3.5" />, 'Комментарий к выезду', exitPermitComments.length > 0 ? 'Есть комментарий' : 'Нет комментария', exitPermitComments.length > 0 ? 'text-emerald-700' : 'text-muted-foreground')}
            </div>

            {suggestedCandidate?.weighing && (
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700/70 mb-1.5">Весовой контроль</div>
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {suggestedCandidate.weighing.entry_weight !== null ? (
                    <div className="flex items-baseline gap-1 text-sm">
                      <span className="text-xs text-muted-foreground">Въезд:</span>
                      <span className="font-bold text-green-700">{Number(suggestedCandidate.weighing.entry_weight).toFixed(0)} кг</span>
                      {suggestedCandidate.weighing.entry_weighed_at && <span className="text-[10px] text-muted-foreground">{formatDateTime(suggestedCandidate.weighing.entry_weighed_at)}</span>}
                    </div>
                  ) : suggestedCandidate.weighing.needs_entry ? (
                    <span className="text-xs text-amber-600">⚠ Въездное взвешивание не выполнено</span>
                  ) : null}
                  {suggestedCandidate.weighing.exit_weight !== null ? (
                    <div className="flex items-baseline gap-1 text-sm">
                      <span className="text-xs text-muted-foreground">Выезд:</span>
                      <span className="font-bold text-orange-700">{Number(suggestedCandidate.weighing.exit_weight).toFixed(0)} кг</span>
                      {suggestedCandidate.weighing.exit_weighed_at && <span className="text-[10px] text-muted-foreground">{formatDateTime(suggestedCandidate.weighing.exit_weighed_at)}</span>}
                    </div>
                  ) : suggestedCandidate.weighing.needs_exit ? (
                    <span className="text-xs font-semibold text-amber-700">⚠ Требуется выездное взвешивание</span>
                  ) : null}
                  {suggestedCandidate.weighing.entry_weight !== null && suggestedCandidate.weighing.exit_weight !== null && (
                    <div className="flex items-baseline gap-1 text-sm">
                      <span className="text-xs text-muted-foreground">Разница:</span>
                      <span className="font-bold">{(Number(suggestedCandidate.weighing.exit_weight) - Number(suggestedCandidate.weighing.entry_weight)).toFixed(0)} кг</span>
                    </div>
                  )}
                  {!suggestedCandidate.weighing.needs_entry && !suggestedCandidate.weighing.needs_exit
                    && suggestedCandidate.weighing.entry_weight === null && suggestedCandidate.weighing.exit_weight === null && (
                    <span className="text-xs text-muted-foreground">Взвешивание не требуется</span>
                  )}
                </div>
              </div>
            )}

            {exitDecisionHint}
          </div>
        </div>

        <div className="flex-1 p-2.5 sm:p-3">
          <div className="space-y-3">
            {renderCaptureMedia(imageSrc, `Выезд ${plateLabel}`, plateImageSrc, `Номер ${plateLabel}`)}

            <div className="rounded-2xl border bg-background/60 p-2">
              <div className="flex flex-wrap gap-1.5">
                  {renderInfoRow('КПП', checkpointLabel)}
                  {renderInfoRow('Устройство', deviceLabel)}
                  {renderInfoRow('Территория', yardLabel)}
                  {renderInfoRow('Время фиксации', formatDateTime(captureLabel))}
              </div>
            </div>
          </div>
        </div>

        {otherPendingExitItems.length > 0 && (
          <div className="shrink-0 border-t border-orange-200 bg-orange-50/60 px-2.5 py-2 dark:border-orange-900/40 dark:bg-orange-950/20">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400">
              <Clock3 className="h-3 w-3" />
              Ещё {otherPendingExitItems.length} в очереди
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {otherPendingExitItems.map((queueItem) => (
                <button
                  key={queueItem.review_id}
                  type="button"
                  onClick={() => setPinnedExitReviewId(queueItem.review_id)}
                  className="shrink-0 rounded-lg border bg-white px-2.5 py-1.5 text-left text-xs shadow-sm transition-colors hover:bg-orange-50 dark:bg-background dark:hover:bg-orange-950/30"
                >
                  <div className="font-mono font-semibold tracking-wide">{queueItem.plate_number}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{formatDateTime(queueItem.capture_time)}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {queueItem.candidate_visitors.length > 0
                      ? <span className="rounded bg-emerald-100 px-1 py-px text-[9px] font-medium text-emerald-700">Визит найден</span>
                      : <span className="rounded bg-orange-100 px-1 py-px text-[9px] font-medium text-orange-700">Визит не найден</span>}
                    {queueItem.recognition_confidence != null && (
                      <span className="rounded bg-slate-100 px-1 py-px text-[9px] font-medium text-slate-600">{queueItem.recognition_confidence}%</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="shrink-0 border-t bg-background/60 p-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" className="h-9 w-full justify-center rounded-xl" onClick={() => item ? openExitConfirmDialog(item) : void openManualExitDialog(checkpointId)} disabled={(!item && !canOpenExitFallback) || processingExitReviewId === item?.review_id}>
              {processingExitReviewId === item?.review_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {item && hasSuggestedCandidate ? 'Подтвердить выезд' : 'Выбрать ТС на территории'}
            </Button>

            <Button type="button" variant="destructive" className="h-9 w-full justify-center rounded-xl" onClick={() => item && handleRejectExit(item)} disabled={!item || processingExitReviewId === item.review_id}>
              {processingExitReviewId === item?.review_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Отклонить выезд
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {subscriptionState === 'error' && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Нет доступа к приватному каналу DSS</div>
            <div>{subscriptionError}</div>
          </div>
        </div>
      )}

      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <Card className="h-full gap-0 py-0">
          <CardHeader className="border-b bg-gradient-to-r from-emerald-50/60 to-transparent px-4 py-3 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <LogIn className="h-5 w-5 text-emerald-600" />
                Въезд
              </CardTitle>
              <Button type="button" variant="secondary" className="h-9" onClick={() => openManualDialog(selectedCheckpointId)} disabled={!currentCheckpoint?.yard_id}>
                <Plus className="h-4 w-4" />
                Ручной въезд
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col px-3 py-3 sm:px-4">
            {renderEntryCard()}
          </CardContent>
        </Card>

        <Card className="h-full gap-0 py-0">
          <CardHeader className="border-b bg-gradient-to-r from-orange-50/60 to-transparent px-4 py-3 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <LogOut className="h-5 w-5 text-orange-600" />
                Выезд
              </CardTitle>
              <Button type="button" variant="outline" className="h-9" onClick={() => void openManualExitDialog(selectedCheckpointId)} disabled={!currentCheckpoint?.yard_id}>
                <LogOut className="h-4 w-4" />
                Ручной выезд
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col px-3 py-3 sm:px-4">
            {renderExitCard()}
          </CardContent>
        </Card>
      </div>

      <VisitorsHistoryPanel
        yardId={currentCheckpoint?.yard_id ?? selectedYardId ?? null}
        variant="desktop"
        title="История посещений"
        onVisitorsChanged={() => {
          if (selectedCheckpointId) {
            void refreshCheckpointContext(selectedCheckpointId);
          }
        }}
      />

      <Dialog open={confirmDialog.open} onOpenChange={(open) => !open && closeConfirmDialog()}>
        <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="shrink-0 gap-0 border-b px-3 py-2.5 pr-10">
            <DialogTitle className="text-base">Подтверждение въезда</DialogTitle>
          </DialogHeader>

          {confirmDialog.item && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-2 p-3">

                {/* Плашка: номер + статусные бейджи */}
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/20 px-2.5 py-2">
                  <span className="mr-1 font-mono text-lg font-bold tracking-[0.12em]">{confirmDialog.correctedPlate || confirmDialog.item.plate_number}</span>
                  <Badge className={getEntryStatusBadgeClass(confirmDialog.item.confirmation_status)}>{getEntryStatusLabel(confirmDialog.item.confirmation_status)}</Badge>
                  <Badge variant={confirmDialog.item.matched_truck_id ? 'default' : 'outline'} className="text-xs">{confirmDialog.item.matched_truck_id ? 'В базе' : 'Нужна проверка'}</Badge>
                  {confirmDialog.item.has_permit
                    ? <Badge className="bg-emerald-100 text-emerald-800 text-xs">Разрешение есть</Badge>
                    : <Badge variant="outline" className="border-amber-200 text-amber-700 text-xs">Нет разрешения</Badge>}
                  {confirmDialog.item.can_open_barrier && <Badge className="bg-sky-100 text-sky-700 text-xs">Шлагбаум</Badge>}
                </div>

                {/* Компактная сводка: 4 плитки */}
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {renderCompactSummaryTile('ТС', resolvedConfirmTruck.truckId ? `#${resolvedConfirmTruck.truckId}` : 'Новое', resolvedConfirmTruck.truckId ? 'text-foreground' : 'text-amber-700')}
                  {renderCompactSummaryTile('Разрешение', resolvedConfirmTruck.hasPermit || confirmDialog.createPermit ? 'Будет' : 'Нет', resolvedConfirmTruck.hasPermit || confirmDialog.createPermit ? 'text-emerald-700' : 'text-muted-foreground')}
                  {renderCompactSummaryTile('Задание', selectedConfirmTask?.name || (confirmDialog.selectedTaskId ? `#${confirmDialog.selectedTaskId}` : 'Не выбрано'), confirmDialog.selectedTaskId ? 'text-foreground' : 'text-muted-foreground')}
                  {renderCompactSummaryTile('Весы', confirmDialog.createWeighing || confirmDialog.item.has_weighing_task ? 'Активен' : 'Нет', confirmDialog.createWeighing || confirmDialog.item.has_weighing_task ? 'text-foreground' : 'text-muted-foreground')}
                </div>

                {/* Номер и комментарий */}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Номер ТС</div>
                    <Input className="h-8 text-sm" value={confirmDialog.correctedPlate} onChange={(event) => setConfirmDialog((current) => ({ ...current, correctedPlate: event.target.value.toUpperCase() }))} />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Комментарий</div>
                    <Input className="h-8 text-sm" value={confirmDialog.comment} onChange={(event) => setConfirmDialog((current) => ({ ...current, comment: event.target.value }))} placeholder="Комментарий оператора" />
                  </div>
                </div>

                {/* Похожие ТС */}
                <div className="rounded-lg border">
                  <div className="flex items-center justify-between border-b px-2.5 py-1.5">
                    <span className="text-xs font-medium">Похожие ТС</span>
                    {searching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                  {searchResults.length > 0 ? (
                    <div className="max-h-36 space-y-px overflow-y-auto p-1">
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
                          className={`w-full rounded-md border px-2.5 py-1.5 text-left transition-colors ${confirmDialog.selectedTruckId === result.truck_id ? 'border-blue-400 bg-blue-50' : 'hover:bg-muted/40'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-sm font-semibold">{result.plate_number}</span>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <Badge variant={result.has_permit ? 'default' : 'outline'} className={`text-[10px] ${result.has_permit ? 'bg-emerald-100 text-emerald-800' : ''}`}>{result.has_permit ? 'Разрешение' : 'Без разреш.'}</Badge>
                              <span className="text-[11px] text-muted-foreground">{result.similarity_percent}%</span>
                            </div>
                          </div>
                          {(result.task_name || result.truck_model_name) && (
                            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{result.task_name || result.truck_model_name}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-2.5 py-2 text-xs text-muted-foreground">Похожие ТС не найдены.</div>
                  )}
                </div>

                {/* Ожидаемые задания */}
                <div className="rounded-lg border">
                  <div className="flex items-center justify-between border-b px-2.5 py-1.5">
                    <span className="text-xs font-medium">Ожидаемые задания</span>
                    {loadingExpectedTasks && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                  {expectedTasks.length > 0 ? (
                    <div className="max-h-32 space-y-px overflow-y-auto p-1">
                      {expectedTasks.slice(0, 8).map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => setConfirmDialog((current) => ({ ...current, selectedTaskId: task.id, selectedTruckId: current.selectedTruckId ?? task.truck_id ?? null }))}
                          className={`w-full rounded-md border px-2.5 py-1.5 text-left transition-colors ${confirmDialog.selectedTaskId === task.id ? 'border-blue-400 bg-blue-50' : 'hover:bg-muted/40'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold">{task.name}</span>
                            <Badge variant="outline" className="shrink-0 text-[10px]">#{task.id}</Badge>
                          </div>
                          {(task.plate_number || task.driver_name) && (
                            <div className="mt-0.5 text-[11px] text-muted-foreground">{task.plate_number || task.driver_name}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-2.5 py-2 text-xs text-muted-foreground">Ожидаемых заданий нет.</div>
                  )}
                </div>

                {/* Действия: 3 чекбокса в ряд */}
                <div className="grid grid-cols-3 gap-1.5">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted/30">
                    <Checkbox checked={confirmDialog.createPermit} onCheckedChange={(checked) => setConfirmDialog((current) => ({ ...current, createPermit: checked === true }))} />
                    Создать разрешение
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted/30">
                    <Checkbox checked={confirmDialog.createWeighing} onCheckedChange={(checked) => setConfirmDialog((current) => ({ ...current, createWeighing: checked === true }))} />
                    Весовой контроль
                  </label>
                  <label className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${confirmDialog.item.can_open_barrier ? 'hover:bg-muted/30' : 'cursor-not-allowed opacity-60'}`}>
                    <Checkbox checked={confirmDialog.openBarrier} onCheckedChange={(checked) => setConfirmDialog((current) => ({ ...current, openBarrier: checked === true }))} disabled={!confirmDialog.item.can_open_barrier} />
                    Открыть шлагбаум
                  </label>
                </div>

              </div>
            </div>
          )}

          <DialogFooter className="shrink-0 gap-2 border-t px-3 py-2 sm:justify-between">
            <Button type="button" variant="outline" className="h-8 sm:min-w-24" onClick={closeConfirmDialog}>Отмена</Button>
            <Button type="button" className="h-8 sm:min-w-36" onClick={handleConfirmEntry} disabled={!confirmDialog.item || processingVisitorId === confirmDialog.item?.visitor_id}>
              {processingVisitorId === confirmDialog.item?.visitor_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Подтвердить въезд
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manualDialog.open} onOpenChange={(open) => !open && closeManualDialog()}>
        <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 gap-0 border-b px-3 py-2.5 pr-10">
            <DialogTitle className="text-base">Ручное добавление ТС</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-2 p-3">
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Номер ТС</div>
                <Input className="h-8 text-sm" value={manualDialog.plateNumber} onChange={(event) => setManualDialog((current) => ({ ...current, plateNumber: event.target.value.toUpperCase() }))} placeholder="A123BC777" />
              </div>

              <div className="rounded-lg border">
                <div className="flex items-center justify-between border-b px-2.5 py-1.5">
                  <span className="text-xs font-medium">Найденные ТС в базе</span>
                  {manualTruckSearchLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </div>
                {manualTruckResults.length > 0 ? (
                  <div className="max-h-32 space-y-px overflow-y-auto p-1">
                    {manualTruckResults.map((truck) => (
                      <div key={truck.id} className={`rounded-md border px-2.5 py-1.5 ${selectedManualTruck?.id === truck.id ? 'border-blue-400 bg-blue-50' : ''}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-sm font-semibold">{truck.plate_number}</span>
                          <div className="flex shrink-0 gap-1.5">
                            <Badge variant={truck.has_permit ? 'default' : 'outline'} className={`text-[10px] ${truck.has_permit ? 'bg-emerald-100 text-emerald-800' : ''}`}>{truck.has_permit ? 'Разрешение' : 'Без разреш.'}</Badge>
                            {truck.task_name && <Badge variant="outline" className="text-[10px]">{truck.task_name}</Badge>}
                          </div>
                        </div>
                        {(truck.truck_model_name || truck.truck_brand_name) && (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">{truck.truck_model_name || truck.truck_brand_name}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-2.5 py-2 text-xs text-muted-foreground">Совпадений нет — будет создано новое ТС.</div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                <label className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs hover:bg-muted/30">
                  <Checkbox checked={manualCreatePermit} onCheckedChange={(checked) => setManualCreatePermit(checked === true)} />
                  Разрешение
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs hover:bg-muted/30">
                  <Checkbox checked={manualCreateWeighing} onCheckedChange={(checked) => setManualCreateWeighing(checked === true)} />
                  Весовой
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs hover:bg-muted/30">
                  <Checkbox checked={manualOpenBarrier} onCheckedChange={(checked) => setManualOpenBarrier(checked === true)} />
                  Шлагбаум
                </label>
              </div>

              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">Комментарий</div>
                <Input className="h-8 text-sm" value={manualComment} onChange={(event) => setManualComment(event.target.value)} placeholder="Комментарий оператора" />
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t px-3 py-2">
            <Button type="button" variant="outline" className="h-8" onClick={closeManualDialog}>Отмена</Button>
            <Button type="button" className="h-8" onClick={handleManualCreate} disabled={!manualDialog.checkpointId || creatingManualVisitor}>
              {creatingManualVisitor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Добавить ТС
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manualExitDialog.open} onOpenChange={(open) => !open && closeManualExitDialog()}>
        <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 gap-0 border-b px-3 py-2.5 pr-10">
            <DialogTitle className="text-base">Ручной выезд</DialogTitle>
            {manualExitCheckpoint?.name && (
              <p className="text-xs text-muted-foreground">
                {manualExitCheckpoint.yard_name ? `${manualExitCheckpoint.name} — ${manualExitCheckpoint.yard_name}` : manualExitCheckpoint.name}
              </p>
            )}
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-2 p-3">
              <Input
                className="h-8 text-sm"
                value={manualExitDialog.search}
                onChange={(event) => setManualExitDialog((current) => ({ ...current, search: event.target.value.toUpperCase() }))}
                placeholder="Поиск: номер, водитель, телефон, задание"
              />

              <div className="rounded-lg border">
                <div className="flex items-center justify-between border-b px-2.5 py-1.5">
                  <span className="text-xs font-medium">ТС на территории</span>
                  <span className="text-xs text-muted-foreground">
                    {manualExitLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : filteredManualExitVisitors.length}
                  </span>
                </div>
                {manualExitLoading ? (
                  <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Загрузка...
                  </div>
                ) : filteredManualExitVisitors.length > 0 ? (
                  <div className="max-h-64 space-y-px overflow-y-auto p-1">
                    {filteredManualExitVisitors.map((visitor) => {
                      const exitPermitComment = visitor.exit_permit?.comment?.trim();

                      return (
                        <button
                          key={visitor.id}
                          type="button"
                          onClick={() => setManualExitDialog((current) => ({ ...current, selectedVisitorId: visitor.id }))}
                          className={`w-full rounded-md border px-2.5 py-1.5 text-left transition-colors ${manualExitDialog.selectedVisitorId === visitor.id ? 'border-orange-400 bg-orange-50' : 'hover:bg-muted/40'}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-sm font-semibold">{visitor.plate_number}</span>
                            <div className="flex shrink-0 flex-wrap gap-1">
                              {visitor.exit_permit_required
                                ? visitor.has_active_exit_permit
                                  ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Выезд ✓</Badge>
                                  : <Badge variant="outline" className="border-amber-200 text-amber-700 text-[10px]">Нужно разреш.</Badge>
                                : <Badge variant="outline" className="text-[10px]">Свободный</Badge>}
                              {visitor.name && <Badge variant="outline" className="text-[10px]">{visitor.name}</Badge>}
                            </div>
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            Въезд {formatDateTime(visitor.entry_date)}
                            {visitor.entrance_device_name ? ` · ${visitor.entrance_device_name}` : ''}
                            {visitor.user_name ? ` · ${visitor.user_name}` : ''}
                          </div>
                          {exitPermitComment && (
                            <div className="mt-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">{exitPermitComment}</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-2.5 py-2 text-xs text-muted-foreground">Нет активных ТС на территории.</div>
                )}
              </div>

              {selectedManualExitVisitor && (
                <div className="rounded-md border-l-2 border-orange-400 bg-orange-50/50 py-1.5 pl-3 pr-2.5 text-xs">
                  <span className="font-semibold">{selectedManualExitVisitor.plate_number}</span>
                  {' · '}въезд {formatDateTime(selectedManualExitVisitor.entry_date)}
                  {' · '}
                  <span className={selectedManualExitVisitor.exit_permit_required && !selectedManualExitVisitor.has_active_exit_permit && !manualExitDialog.overrideExitPermit ? 'text-amber-700' : 'text-emerald-700'}>
                    {selectedManualExitVisitor.exit_permit_required
                      ? selectedManualExitVisitor.has_active_exit_permit
                        ? 'разрешение активно'
                        : manualExitDialog.overrideExitPermit
                          ? 'ручной выпуск'
                          : 'нужно разрешение'
                      : 'выезд свободный'}
                  </span>
                </div>
              )}

              <div className="space-y-1.5 rounded-lg border p-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-muted/30">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={manualExitDialog.openBarrier}
                    onChange={(event) => setManualExitDialog((current) => ({ ...current, openBarrier: event.target.checked }))}
                  />
                  <span>Открыть шлагбаум <span className="text-muted-foreground">· после фиксации выезда</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-muted/30">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={manualExitDialog.overrideExitPermit}
                    onChange={(event) => setManualExitDialog((current) => ({ ...current, overrideExitPermit: event.target.checked }))}
                  />
                  <span>Выпустить без разрешения на выезд <span className="text-muted-foreground">· нужна причина</span></span>
                </label>
                {manualExitDialog.overrideExitPermit && (
                  <textarea
                    className="mt-1 min-h-12 w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
                    value={manualExitDialog.overrideReason}
                    onChange={(event) => setManualExitDialog((current) => ({ ...current, overrideReason: event.target.value }))}
                    placeholder="Причина выпуска без разрешения"
                  />
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t px-3 py-2">
            <Button type="button" variant="outline" className="h-8" onClick={closeManualExitDialog}>Отмена</Button>
            <Button type="button" className="h-8" onClick={handleManualExit} disabled={!manualExitDialog.selectedVisitorId || processingManualExitVisitorId === manualExitDialog.selectedVisitorId}>
              {processingManualExitVisitorId === manualExitDialog.selectedVisitorId ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Зафиксировать выезд
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exitConfirmDialog.open} onOpenChange={(open) => !open && closeExitConfirmDialog()}>
        <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="shrink-0 gap-0 border-b px-3 py-2.5 pr-10">
            <DialogTitle className="text-base">Подтверждение выезда</DialogTitle>
          </DialogHeader>

          {exitConfirmDialog.item && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-2 p-3">

                {/* Плашка: номер + статусные бейджи */}
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/20 px-2.5 py-2">
                  <span className="mr-1 font-mono text-lg font-bold tracking-[0.12em]">{exitConfirmDialog.correctedPlate || exitConfirmDialog.item.plate_number}</span>
                  <Badge className={getExitStatusBadgeClass(exitConfirmDialog.item.status)}>{getExitStatusLabel(exitConfirmDialog.item.status)}</Badge>
                  <Badge variant={exitConfirmDialog.item.candidate_visitors.length > 0 ? 'default' : 'outline'} className="text-xs">
                    {exitConfirmDialog.item.candidate_visitors.length > 0 ? 'Визит найден' : 'Нет кандидатов'}
                  </Badge>
                  {exitConfirmDialog.item.recognition_confidence != null && (
                    <Badge className={`text-xs ${getConfidenceBadgeClass(exitConfirmDialog.item.recognition_confidence)}`}>
                      {exitConfirmDialog.item.recognition_confidence}%
                    </Badge>
                  )}
                </div>

                {/* Компактная сводка: 3 плитки */}
                <div className="grid grid-cols-3 gap-1.5">
                  {renderCompactSummaryTile('Разрешение',
                    selectedExitSystemCandidate
                      ? (selectedExitSystemCandidate.exit_permit_required
                        ? selectedExitSystemCandidate.has_active_exit_permit ? 'Активно' : 'Нужно'
                        : 'Свободный')
                      : selectedExitTerritoryVisitor
                        ? (selectedExitTerritoryVisitor.exit_permit_required
                          ? selectedExitTerritoryVisitor.has_active_exit_permit ? 'Активно' : 'Нужно'
                          : 'Свободный')
                        : '—',
                    (selectedExitSystemCandidate?.has_active_exit_permit || selectedExitTerritoryVisitor?.has_active_exit_permit) ? 'text-emerald-700' : 'text-muted-foreground')}
                  {renderCompactSummaryTile('Шлагбаум',
                    exitConfirmDialog.item.can_open_barrier
                      ? (exitConfirmDialog.openBarrier ? 'Открыть' : 'Доступен')
                      : 'Нет',
                    exitConfirmDialog.item.can_open_barrier ? (exitConfirmDialog.openBarrier ? 'text-sky-700' : 'text-foreground') : 'text-muted-foreground')}
                  {renderCompactSummaryTile('Действие',
                    exitConfirmDialog.releaseWithoutVisit ? 'Без визита' : exitConfirmDialog.overrideExitPermit ? 'Override' : 'Стандарт',
                    exitConfirmDialog.releaseWithoutVisit ? 'text-red-700' : exitConfirmDialog.overrideExitPermit ? 'text-amber-700' : 'text-muted-foreground')}
                </div>

                {/* Поиск по номеру */}
                <Input
                  className="h-8 text-sm"
                  value={exitConfirmDialog.correctedPlate}
                  onChange={(event) => setExitConfirmDialog((current) => ({ ...current, correctedPlate: event.target.value.toUpperCase() }))}
                  placeholder="Поиск по номеру..."
                />

                {/* Подобранные системой (только если есть) */}
                {manualSearchResults.length > 0 && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/30">
                    <div className="flex items-center justify-between border-b border-blue-200 px-2.5 py-1.5">
                      <span className="text-xs font-medium text-blue-700">Подобранные системой</span>
                      {manualSearchLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </div>
                    <div className="max-h-36 space-y-px overflow-y-auto p-1">
                      {manualSearchResults.map((candidate) => {
                        const exitPermitComment = getExitPermitComment(candidate);

                        return (
                          <button
                            key={candidate.visitor_id}
                            type="button"
                            onClick={() => setExitConfirmDialog((current) => ({ ...current, selectedVisitorId: candidate.visitor_id }))}
                            className={`w-full rounded-md border px-2.5 py-1.5 text-left transition-colors ${exitConfirmDialog.selectedVisitorId === candidate.visitor_id ? 'border-orange-400 bg-orange-50' : 'hover:bg-white/80'}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-sm font-semibold">{candidate.plate_number}</span>
                              <div className="flex shrink-0 gap-1.5">
                                {candidate.task_name && <Badge variant="outline" className="text-[10px]">{candidate.task_name}</Badge>}
                                {candidate.exit_permit_required
                                  ? candidate.has_active_exit_permit
                                    ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Выезд ✓</Badge>
                                    : <Badge variant="outline" className="border-amber-200 text-amber-700 text-[10px]">Нужно</Badge>
                                  : <Badge variant="outline" className="text-[10px]">Свободный</Badge>}
                              </div>
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">Въезд {formatDateTime(candidate.entry_date)}</div>
                            {exitPermitComment && (
                              <div className="mt-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">{exitPermitComment}</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Все ТС на территории */}
                <div className="rounded-lg border">
                  <div className="flex items-center justify-between border-b px-2.5 py-1.5">
                    <span className="text-xs font-medium">Все ТС на территории</span>
                    {loadingExitTerritoryVisitors && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                  {prioritizedExitTerritoryVisitors.length > 0 ? (
                    <div className="max-h-56 space-y-px overflow-y-auto p-1">
                      {prioritizedExitTerritoryVisitors.map((visitor) => {
                        const exitPermitComment = visitor.exit_permit?.comment?.trim();
                        const isPriorityMatch = normalizePlateNumber(exitConfirmDialog.correctedPlate)
                          ? normalizePlateNumber([
                            visitor.plate_number,
                            visitor.user_name,
                            visitor.user_phone,
                            visitor.truck_model_name,
                            visitor.name,
                            visitor.description,
                            visitor.entrance_device_name,
                            visitor.exit_permit?.comment,
                            visitor.comment,
                          ].filter(Boolean).join(' ')).includes(normalizePlateNumber(exitConfirmDialog.correctedPlate))
                          : true;

                        return (
                          <button
                            key={visitor.id}
                            type="button"
                            onClick={() => setExitConfirmDialog((current) => ({ ...current, selectedVisitorId: visitor.id }))}
                            className={`w-full rounded-md border px-2.5 py-1.5 text-left transition-colors ${exitConfirmDialog.selectedVisitorId === visitor.id ? 'border-orange-400 bg-orange-50' : 'hover:bg-muted/40'} ${!isPriorityMatch ? 'opacity-60' : ''}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-sm font-semibold">{visitor.plate_number}</span>
                              <div className="flex shrink-0 flex-wrap gap-1">
                                {!isPriorityMatch && normalizePlateNumber(exitConfirmDialog.correctedPlate) && <Badge variant="outline" className="text-[10px]">Другой</Badge>}
                                {visitor.exit_permit_required
                                  ? visitor.has_active_exit_permit
                                    ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Выезд ✓</Badge>
                                    : <Badge variant="outline" className="border-amber-200 text-amber-700 text-[10px]">Нужно</Badge>
                                  : <Badge variant="outline" className="text-[10px]">Свободный</Badge>}
                              </div>
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              Въезд {formatDateTime(visitor.entry_date)}
                              {visitor.user_name ? ` · ${visitor.user_name}` : ''}
                              {(visitor.name || visitor.truck_model_name) ? ` · ${visitor.name || visitor.truck_model_name}` : ''}
                            </div>
                            {exitPermitComment && (
                              <div className="mt-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800">{exitPermitComment}</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-2.5 py-2 text-xs text-muted-foreground">ТС на территории не найдено.</div>
                  )}
                </div>

                {/* Компактный блок действий */}
                <div className="rounded-lg border p-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    <label className={`flex cursor-pointer items-center gap-1.5 text-xs ${exitConfirmDialog.item.can_open_barrier ? '' : 'cursor-not-allowed opacity-50'}`}>
                      <input
                        type="checkbox"
                        checked={exitConfirmDialog.openBarrier}
                        onChange={(event) => setExitConfirmDialog((current) => ({ ...current, openBarrier: event.target.checked }))}
                        disabled={!exitConfirmDialog.item.can_open_barrier}
                      />
                      Открыть шлагбаум
                    </label>
                    <label className={`flex cursor-pointer items-center gap-1.5 text-xs ${exitConfirmDialog.releaseWithoutVisit ? 'pointer-events-none opacity-40' : ''}`}>
                      <input
                        type="checkbox"
                        checked={exitConfirmDialog.overrideExitPermit}
                        onChange={(event) => setExitConfirmDialog((current) => ({ ...current, overrideExitPermit: event.target.checked }))}
                        disabled={exitConfirmDialog.releaseWithoutVisit}
                      />
                      Без разрешения на выезд
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-red-700">
                      <input
                        type="checkbox"
                        checked={exitConfirmDialog.releaseWithoutVisit}
                        onChange={(event) => setExitConfirmDialog((current) => ({
                          ...current,
                          releaseWithoutVisit: event.target.checked,
                          selectedVisitorId: event.target.checked ? null : current.selectedVisitorId,
                        }))}
                      />
                      ТС без визита (въезд без камеры)
                    </label>
                  </div>
                  {exitConfirmDialog.overrideExitPermit && !exitConfirmDialog.releaseWithoutVisit && (
                    <textarea
                      className="mt-2 min-h-12 w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
                      value={exitConfirmDialog.overrideReason}
                      onChange={(event) => setExitConfirmDialog((current) => ({ ...current, overrideReason: event.target.value }))}
                      placeholder="Причина выпуска без разрешения"
                    />
                  )}
                  {exitConfirmDialog.releaseWithoutVisit && (
                    <textarea
                      className="mt-2 min-h-12 w-full rounded-md border border-red-200 bg-background px-2.5 py-1.5 text-xs"
                      value={exitConfirmDialog.releaseReason}
                      onChange={(event) => setExitConfirmDialog((current) => ({ ...current, releaseReason: event.target.value }))}
                      placeholder="Причина: въезд через запасные ворота, нет камеры..."
                    />
                  )}
                </div>

              </div>
            </div>
          )}

          <DialogFooter className="shrink-0 gap-2 border-t px-3 py-2 sm:justify-between">
            <Button type="button" variant="outline" className="h-8 sm:min-w-24" onClick={closeExitConfirmDialog}>Отмена</Button>
            <Button
              type="button"
              className={`h-8 sm:min-w-36 ${exitConfirmDialog.releaseWithoutVisit ? 'bg-red-600 hover:bg-red-700' : ''}`}
              onClick={handleConfirmExit}
              disabled={
                processingExitReviewId === exitConfirmDialog.item?.review_id ||
                (!exitConfirmDialog.releaseWithoutVisit && !exitConfirmDialog.selectedVisitorId)
              }
            >
              {processingExitReviewId === exitConfirmDialog.item?.review_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {exitConfirmDialog.releaseWithoutVisit ? 'Выпустить без визита' : 'Подтвердить выезд'}
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