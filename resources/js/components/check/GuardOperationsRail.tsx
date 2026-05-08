import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link } from '@inertiajs/react';
import {
  ArrowRight,
  Building2,
  Clock3,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  Truck,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type GuardOperationsRailProps = {
  selectedYardId: number | null;
};

type GuestVisitVehicle = {
  id?: number;
  plate_number: string;
};

type GuestVisitPermitLink = {
  id: number;
  entry_permit_id: number | null;
  permit_subject_type: 'person' | 'vehicle';
  guest_visit_vehicle_id: number | null;
  revoked_at: string | null;
  entry_permit?: {
    id: number;
    status?: {
      id: number;
      name: string;
      key: string;
    } | null;
  } | null;
};

type GuestVisit = {
  id: number;
  guest_full_name: string;
  guest_iin?: string | null;
  guest_company_name?: string | null;
  host_name: string;
  host_phone?: string | null;
  visit_starts_at: string;
  permit_kind: 'one_time' | 'multi_time';
  workflow_status: 'active' | 'closed' | 'canceled';
  last_entry_at?: string | null;
  last_exit_at?: string | null;
  vehicles: GuestVisitVehicle[];
  permit_links?: GuestVisitPermitLink[];
};

type PresenceMeta = {
  label: string;
  badgeClassName: string;
  detailLabel: string;
  detailValue: string;
  icon: 'entry' | 'exit' | 'planned';
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getVisitPlates = (visit: GuestVisit) => {
  const plates = visit.vehicles
    .map((vehicle) => vehicle.plate_number?.trim())
    .filter((plate): plate is string => Boolean(plate));

  if (plates.length === 0) {
    return 'Без ТС';
  }

  if (plates.length <= 2) {
    return plates.join(', ');
  }

  return `${plates.slice(0, 2).join(', ')} +${plates.length - 2}`;
};

const getActivePermitLinks = (visit: GuestVisit) => (visit.permit_links ?? []).filter((link) => (
  !link.revoked_at
  && link.entry_permit_id != null
  && (link.entry_permit?.status?.key == null || link.entry_permit.status.key === 'active')
));

const getPresenceMeta = (visit: GuestVisit): PresenceMeta => {
  if (visit.last_entry_at && !visit.last_exit_at) {
    return {
      label: 'На территории',
      badgeClassName: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
      detailLabel: 'Въезд',
      detailValue: formatDateTime(visit.last_entry_at),
      icon: 'entry',
    };
  }

  if (visit.last_entry_at && visit.last_exit_at) {
    return {
      label: 'Вне территории',
      badgeClassName: 'bg-slate-200 text-slate-700 hover:bg-slate-200',
      detailLabel: 'Последний выезд',
      detailValue: formatDateTime(visit.last_exit_at),
      icon: 'exit',
    };
  }

  return {
    label: 'Ожидает',
    badgeClassName: 'bg-amber-100 text-amber-700 hover:bg-amber-100',
    detailLabel: 'Начало визита',
    detailValue: formatDateTime(visit.visit_starts_at),
    icon: 'planned',
  };
};

const EmptyState = ({ title, description }: { title: string; description: string }) => (
  <div className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
    <div className="font-medium text-foreground">{title}</div>
    <div className="mt-1">{description}</div>
  </div>
);

const GuardOperationsRail: React.FC<GuardOperationsRailProps> = ({ selectedYardId }) => {
  const [guestVisits, setGuestVisits] = useState<GuestVisit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [permitKindFilter, setPermitKindFilter] = useState<'all' | 'one_time' | 'multi_time'>('all');
  const [search, setSearch] = useState('');
  const [processingPresenceVisitId, setProcessingPresenceVisitId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    if (!selectedYardId) {
      setGuestVisits([]);
      setError(null);
      setLastUpdatedAt(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const guestVisitsResponse = await axios.post('/security/guest-visits/list', {
        page: 1,
        per_page: 50,
        yard_id: selectedYardId,
        workflow_status: 'active',
        permit_kind: permitKindFilter,
        search: search.trim() || undefined,
      }, {
        headers: getAuthHeaders(),
      });

      setGuestVisits(guestVisitsResponse.data?.data ?? []);
      setLastUpdatedAt(new Date().toISOString());
    } catch (loadError) {
      console.error('Ошибка загрузки активных гостевых пропусков:', loadError);
      setError('Не удалось загрузить активные гостевые пропуска.');
    } finally {
      setLoading(false);
    }
  }, [permitKindFilter, search, selectedYardId]);

  useEffect(() => {
    setPermitKindFilter('all');
    setSearch('');
  }, [selectedYardId]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadData();
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [loadData]);

  useEffect(() => {
    if (!selectedYardId) return;

    const interval = window.setInterval(() => {
      void loadData();
    }, 30000);

    return () => window.clearInterval(interval);
  }, [loadData, selectedYardId]);

  const handlePresenceAction = useCallback(async (id: number, action: 'check-in' | 'check-out') => {
    setProcessingPresenceVisitId(id);

    try {
      const response = await axios.post(`/security/guest-visits/${action}`, { id }, { headers: getAuthHeaders() });

      if (response.data?.status) {
        toast.success(action === 'check-in' ? 'Приход гостя отмечен' : 'Уход гостя отмечен');
        await loadData();
      }
    } catch (presenceError: any) {
      console.error(`Ошибка действия ${action}`, presenceError);
      toast.error(presenceError.response?.data?.message || 'Не удалось отметить присутствие гостя');
    } finally {
      setProcessingPresenceVisitId(null);
    }
  }, [loadData]);

  const activeGuestPasses = useMemo(() => {
    const getPriority = (visit: GuestVisit) => {
      if (visit.last_entry_at && !visit.last_exit_at) return 0;
      if (!visit.last_entry_at) return 1;
      return 2;
    };

    return [...guestVisits]
      .filter((visit) => visit.workflow_status === 'active')
      .sort((first, second) => {
        const priorityDiff = getPriority(first) - getPriority(second);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        const firstMoment = new Date(first.last_entry_at ?? first.visit_starts_at).getTime();
        const secondMoment = new Date(second.last_entry_at ?? second.visit_starts_at).getTime();
        return secondMoment - firstMoment;
      });
  }, [guestVisits]);

  const guestsOnSiteCount = useMemo(
    () => activeGuestPasses.filter((visit) => Boolean(visit.last_entry_at) && !visit.last_exit_at).length,
    [activeGuestPasses],
  );

  return (
    <div className="space-y-3 xl:sticky xl:top-4 xl:max-h-[calc(100svh-7rem)] xl:overflow-y-auto xl:pr-1">
      <Card className="border-slate-200/80 bg-white/90 shadow-sm backdrop-blur">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-emerald-600" />
                Активные пропуска гостей
              </CardTitle>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">Пропусков: {activeGuestPasses.length}</Badge>
                <Badge variant="outline">На территории: {guestsOnSiteCount}</Badge>
                <span>Обновлено: {lastUpdatedAt ? formatDateTime(lastUpdatedAt) : '—'}</span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={!selectedYardId || loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Обновить
              </Button>

              <Button variant="ghost" size="sm" asChild>
                <Link href="/guests" prefetch>
                  Гости
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="grid gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Поиск по ФИО или ИИН"
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm">
              <span className="shrink-0 text-muted-foreground">Тип пропуска</span>
              <select
                value={permitKindFilter}
                onChange={(event) => setPermitKindFilter(event.target.value as 'all' | 'one_time' | 'multi_time')}
                className="w-full bg-transparent outline-none"
              >
                <option value="all">Все</option>
                <option value="one_time">Разовый</option>
                <option value="multi_time">Многоразовый</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!selectedYardId ? (
            <EmptyState
              title="Выберите КПП"
              description="Справа появится список активных гостевых пропусков для выбранного двора."
            />
          ) : loading && activeGuestPasses.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загружаем активные гостевые пропуска...
            </div>
          ) : activeGuestPasses.length === 0 ? (
            <EmptyState
              title="Ничего не найдено"
              description={search.trim() || permitKindFilter !== 'all'
                ? 'Попробуйте изменить поиск или тип пропуска.'
                : 'Для выбранного двора сейчас нет активных гостевых записей.'}
            />
          ) : (
            activeGuestPasses.map((visit) => {
              const permitLinks = getActivePermitLinks(visit);
              const personPermitCount = permitLinks.filter((link) => link.permit_subject_type === 'person').length;
              const vehiclePermitCount = permitLinks.filter((link) => link.permit_subject_type === 'vehicle').length;
              const presence = getPresenceMeta(visit);
              const needsCheckIn = !visit.last_entry_at || Boolean(visit.last_exit_at);
              const isProcessingPresence = processingPresenceVisitId === visit.id;

              return (
                <div key={visit.id} className="rounded-lg border px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{visit.guest_full_name}</div>
                      {visit.guest_iin ? <div className="truncate text-xs text-muted-foreground">ИИН: {visit.guest_iin}</div> : null}
                      <div className="truncate text-sm text-muted-foreground">{visit.guest_company_name || 'Компания не указана'}</div>
                    </div>

                    <Badge className={presence.badgeClassName}>{presence.label}</Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant="outline">{visit.permit_kind === 'one_time' ? 'Разовый' : 'Многоразовый'}</Badge>
                    {permitLinks.length > 0 ? <Badge variant="outline">Связок пропуска: {permitLinks.length}</Badge> : null}
                    {personPermitCount > 0 ? <Badge variant="secondary">Люди: {personPermitCount}</Badge> : null}
                    {vehiclePermitCount > 0 ? <Badge variant="secondary">ТС: {vehiclePermitCount}</Badge> : null}
                  </div>

                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 shrink-0" />
                      <span>{getVisitPlates(visit)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock3 className="h-4 w-4 shrink-0" />
                      <span>{formatDateTime(visit.visit_starts_at)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 shrink-0" />
                      <span>
                        Встречает: {visit.host_name}
                        {visit.host_phone ? ` • ${visit.host_phone}` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {presence.icon === 'entry' ? (
                        <LogIn className="h-4 w-4 shrink-0 text-emerald-600" />
                      ) : presence.icon === 'exit' ? (
                        <LogOut className="h-4 w-4 shrink-0 text-slate-600" />
                      ) : (
                        <Clock3 className="h-4 w-4 shrink-0 text-amber-600" />
                      )}
                      <span>
                        {presence.detailLabel}: <span className="font-medium text-foreground">{presence.detailValue}</span>
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end">
                    {needsCheckIn ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        title="Отметить приход"
                        onClick={() => void handlePresenceAction(visit.id, 'check-in')}
                        disabled={isProcessingPresence}
                      >
                        {isProcessingPresence ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4 text-green-600" />}
                        Отметить приход
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        title="Отметить уход"
                        onClick={() => void handlePresenceAction(visit.id, 'check-out')}
                        disabled={isProcessingPresence}
                      >
                        {isProcessingPresence ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4 text-amber-600" />}
                        Отметить уход
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GuardOperationsRail;