import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Car, Clock, Loader2, LogOut, MapPin, Maximize2, Phone, RefreshCw, Search, User } from 'lucide-react';

type VisitorFilter = 'on_territory' | 'left' | 'all' | 'with_task';

type ExitPermitSummary = {
  id: number;
  valid_until?: string | null;
  comment?: string | null;
};

type HistoryVisitor = {
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
  entrance_checkpoint_name?: string | null;
  exit_device_name?: string | null;
  exit_checkpoint_name?: string | null;
  has_permit?: boolean;
  permit_type?: 'one_time' | 'permanent' | null;
  permit_status?: 'active' | 'expired' | null;
  permit_end_date?: string | null;
  exit_permit_required?: boolean;
  has_active_exit_permit?: boolean;
  exit_permit?: ExitPermitSummary | null;
  comment?: string | null;
  capture_picture_url?: string | null;
};

type VisitorPagination = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
};

type VisitorsHistoryPanelProps = {
  yardId?: number | null;
  title?: string;
  variant?: 'desktop' | 'mobile';
  onExitVisitor?: (visitorId: number) => Promise<void>;
  onVisitorsChanged?: () => void | Promise<void>;
};

const EMPTY_PAGINATION: VisitorPagination = {
  current_page: 1,
  last_page: 1,
  per_page: 50,
  total: 0,
  from: null,
  to: null,
};

const FILTER_OPTIONS: Array<{ key: VisitorFilter; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'on_territory', label: 'На территории' },
  { key: 'with_task', label: 'С заданиями' },
  { key: 'left', label: 'Покинули' },
];

const SEARCH_DEBOUNCE_MS = 350;

const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');

  return token ? { Authorization: `Bearer ${token}` } : {};
};

const normalizeSearchText = (value?: string | null) =>
  (value ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '');

const buildSearchableVisitorText = (visitor: HistoryVisitor) => normalizeSearchText([
  visitor.plate_number,
  visitor.user_name,
  visitor.user_phone,
  visitor.truck_model_name,
  visitor.name,
  visitor.description,
  visitor.entrance_checkpoint_name,
  visitor.exit_permit?.comment,
]
  .filter(Boolean)
  .join(' '));

const formatDateTime = (dateStr?: string | null) => {
  if (!dateStr) {
    return null;
  }

  const date = new Date(dateStr);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return {
    date: date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time: date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
  };
};

const isUnauthorizedActiveVisitor = (visitor: HistoryVisitor) => !visitor.exit_date && visitor.has_permit === false;

const hasExpiredPermit = (visitor: HistoryVisitor) => visitor.has_permit === false && visitor.permit_status === 'expired';

const getPermitBadgeClass = (visitor: HistoryVisitor) => {
  if (hasExpiredPermit(visitor)) {
    return 'border border-red-200 bg-red-50 text-red-700';
  }

  if (!visitor.has_permit) {
    return 'border border-red-200 bg-red-50 text-red-700';
  }

  return visitor.permit_type === 'one_time'
    ? 'bg-blue-100 text-blue-700'
    : 'bg-emerald-100 text-emerald-700';
};

const getPermitBadgeLabel = (visitor: HistoryVisitor) => {
  if (hasExpiredPermit(visitor)) {
    return visitor.permit_type === 'one_time'
      ? 'Разовое разрешение истекло'
      : 'Разрешение истекло';
  }

  if (!visitor.has_permit) {
    return 'Без разрешения';
  }

  return visitor.permit_type === 'one_time'
    ? 'Разрешение: разовое'
    : 'Разрешение: постоянное';
};

const getTerritoryBadgeClass = (visitor: HistoryVisitor) => (
  isUnauthorizedActiveVisitor(visitor)
    ? 'bg-red-600 text-white'
    : visitor.exit_date
      ? 'bg-red-100 text-red-700'
      : 'bg-emerald-100 text-emerald-700'
);

const getTerritoryBadgeLabel = (visitor: HistoryVisitor) => (
  isUnauthorizedActiveVisitor(visitor)
    ? 'Несанкционированный въезд'
    : visitor.exit_date
      ? 'Покинул территорию'
      : 'На территории'
);

const hasMeaningfulTruckOwner = (truckOwner?: string | null) => {
  const normalized = (truckOwner ?? '').trim().toLowerCase();

  return normalized !== '' && normalized !== 'не указано' && normalized !== 'неизвестно';
};

export default function VisitorsHistoryPanel({
  yardId = null,
  title = 'История посещений',
  variant = 'desktop',
  onExitVisitor,
  onVisitorsChanged,
}: VisitorsHistoryPanelProps) {
  const [visitors, setVisitors] = useState<HistoryVisitor[]>([]);
  const [pagination, setPagination] = useState<VisitorPagination>(EMPTY_PAGINATION);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<VisitorFilter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [serverSearchVisitors, setServerSearchVisitors] = useState<HistoryVisitor[]>([]);
  const [serverSearchTotal, setServerSearchTotal] = useState(0);
  const [serverSearching, setServerSearching] = useState(false);
  const [processingVisitorId, setProcessingVisitorId] = useState<number | null>(null);
  const [previewVisitor, setPreviewVisitor] = useState<HistoryVisitor | null>(null);
  const [failedImageVisitorIds, setFailedImageVisitorIds] = useState<Set<number>>(new Set());
  const isSearchActive = search.trim().length > 0;

  const fetchVisitors = useCallback(async (targetPage: number, targetFilter: VisitorFilter) => {
    if (!yardId) {
      setVisitors([]);
      setPagination(EMPTY_PAGINATION);
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post('/security/getvisitors', {
        yard_id: yardId,
        filter: targetFilter,
        page: targetPage,
        per_page: 50,
        include_capture_picture: true,
      }, {
        headers: getAuthHeaders(),
      });

      setVisitors(response.data?.data ?? []);
      setPagination(response.data?.pagination ?? { ...EMPTY_PAGINATION, current_page: targetPage });
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        setVisitors([]);
        setPagination({ ...EMPTY_PAGINATION, current_page: targetPage });
        return;
      }

      console.error('Ошибка при загрузке истории посещений:', error);
      toast.error('Не удалось загрузить историю посещений');
    } finally {
      setLoading(false);
    }
  }, [yardId]);

  const requestServerSearchVisitors = useCallback(async (searchValue: string, targetFilter: VisitorFilter) => {
    const trimmedSearch = searchValue.trim();

    if (!yardId || trimmedSearch === '') {
      return {
        visitors: [] as HistoryVisitor[],
        total: 0,
      };
    }

    try {
      const response = await axios.post('/security/getvisitors', {
        yard_id: yardId,
        filter: targetFilter,
        page: 1,
        per_page: 50,
        include_capture_picture: true,
        search: trimmedSearch,
      }, {
        headers: getAuthHeaders(),
      });

      const loadedVisitors = response.data?.data ?? [];

      return {
        visitors: loadedVisitors,
        total: response.data?.pagination?.total ?? loadedVisitors.length,
      };
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return {
          visitors: [] as HistoryVisitor[],
          total: 0,
        };
      }

      console.error('Ошибка серверного поиска истории посещений:', error);

      return {
        visitors: [] as HistoryVisitor[],
        total: 0,
      };
    }
  }, [yardId]);

  useEffect(() => {
    setVisitors([]);
    setPagination(EMPTY_PAGINATION);
    setPage(1);
    setFilter('all');
    setSearch('');
    setServerSearchVisitors([]);
    setServerSearchTotal(0);
    setServerSearching(false);
    setFailedImageVisitorIds(new Set());
  }, [yardId]);

  useEffect(() => {
    void fetchVisitors(page, filter);
  }, [fetchVisitors, filter, page]);

  useEffect(() => {
    if (!yardId) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void fetchVisitors(page, filter);
    }, 15000);

    return () => window.clearInterval(interval);
  }, [fetchVisitors, filter, page, yardId]);

  useEffect(() => {
    if (!yardId || !isSearchActive) {
      setServerSearchVisitors([]);
      setServerSearchTotal(0);
      setServerSearching(false);
      return undefined;
    }

    let isActive = true;
    setServerSearching(true);

    const timeoutId = window.setTimeout(() => {
      void requestServerSearchVisitors(search, filter)
        .then((result) => {
          if (!isActive) {
            return;
          }

          setServerSearchVisitors(result.visitors);
          setServerSearchTotal(result.total);
        })
        .finally(() => {
          if (isActive) {
            setServerSearching(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [filter, isSearchActive, requestServerSearchVisitors, search, yardId]);

  const localFilteredVisitors = useMemo(() => {
    const normalizedSearch = normalizeSearchText(search);

    if (!normalizedSearch) {
      return visitors;
    }

    return visitors.filter((visitor) => buildSearchableVisitorText(visitor).includes(normalizedSearch));
  }, [search, visitors]);

  const displayedVisitors = useMemo(() => {
    if (!isSearchActive) {
      return visitors;
    }

    const mergedVisitors: HistoryVisitor[] = [];
    const seenIds = new Set<number>();

    for (const visitor of localFilteredVisitors) {
      if (seenIds.has(visitor.id)) {
        continue;
      }

      seenIds.add(visitor.id);
      mergedVisitors.push(visitor);
    }

    for (const visitor of serverSearchVisitors) {
      if (seenIds.has(visitor.id)) {
        continue;
      }

      seenIds.add(visitor.id);
      mergedVisitors.push(visitor);
    }

    return mergedVisitors;
  }, [isSearchActive, localFilteredVisitors, serverSearchVisitors, visitors]);

  const additionalServerMatches = useMemo(() => {
    if (!isSearchActive) {
      return 0;
    }

    const localIds = new Set(localFilteredVisitors.map((visitor) => visitor.id));

    return serverSearchVisitors.filter((visitor) => !localIds.has(visitor.id)).length;
  }, [isSearchActive, localFilteredVisitors, serverSearchVisitors]);

  const handleRefresh = () => {
    void fetchVisitors(page, filter);

    if (!isSearchActive) {
      return;
    }

    setServerSearching(true);

    void requestServerSearchVisitors(search, filter)
      .then((result) => {
        setServerSearchVisitors(result.visitors);
        setServerSearchTotal(result.total);
      })
      .finally(() => setServerSearching(false));
  };

  const handleImageLoadError = useCallback((visitorId: number) => {
    setFailedImageVisitorIds((previousIds) => {
      if (previousIds.has(visitorId)) {
        return previousIds;
      }

      const nextIds = new Set(previousIds);
      nextIds.add(visitorId);
      return nextIds;
    });
  }, []);

  const handleExitFallback = useCallback(async (visitorId: number) => {
    const headers = getAuthHeaders();

    try {
      await axios.post('/security/exitvisitor', { id: visitorId }, { headers });
      toast.success('Выезд зафиксирован');
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.data?.code === 'exit_permit_required') {
        const reason = window.prompt('У этого визита нет разрешения на выезд. Укажите причину ручного выпуска:')?.trim() ?? '';

        if (reason.length < 3) {
          toast.error('Для ручного выпуска без разрешения нужна причина');
          throw error;
        }

        await axios.post('/security/exitvisitor', {
          id: visitorId,
          override_exit_permit: true,
          override_reason: reason,
        }, { headers });

        toast.success('Выезд зафиксирован вручную');
        return;
      }

      toast.error(axios.isAxiosError(error) ? (error.response?.data?.message || 'Ошибка при выходе') : 'Ошибка при выходе');
      throw error;
    }
  }, []);

  const handleExitVisitor = async (visitorId: number) => {
    setProcessingVisitorId(visitorId);

    try {
      if (onExitVisitor) {
        await onExitVisitor(visitorId);
      } else {
        await handleExitFallback(visitorId);
      }

      await fetchVisitors(page, filter);

      if (isSearchActive) {
        const result = await requestServerSearchVisitors(search, filter);
        setServerSearchVisitors(result.visitors);
        setServerSearchTotal(result.total);
      }

      await onVisitorsChanged?.();
    } catch (error: unknown) {
      if (!onExitVisitor) {
        console.error('Ошибка при завершении визита из истории:', error);
      }
    } finally {
      setProcessingVisitorId(null);
    }
  };

  const listClassName = variant === 'desktop' ? 'grid gap-2 xl:grid-cols-2' : 'space-y-3';
  const listContainerClassName = variant === 'desktop'
    ? 'px-3 py-3 sm:px-4'
    : 'max-h-[60vh] overflow-y-auto px-3 py-3';
  const compactBadgeClassName = variant === 'desktop' ? 'px-1.5 py-0 text-[10px] leading-4' : '';
  const imageLayoutClassName = variant === 'desktop'
    ? 'flex flex-col md:flex-row'
    : 'grid gap-0';
  const imagePanelClassName = variant === 'desktop'
    ? 'border-b bg-muted/30 md:w-[42%] md:max-w-[12rem] md:flex-none md:border-r md:border-b-0 xl:max-w-[13.5rem]'
    : 'border-b bg-muted/30';
  const imageWrapperClassName = variant === 'desktop'
    ? 'group relative flex min-h-40 items-center justify-center overflow-hidden bg-slate-950/95'
    : 'group relative flex min-h-52 items-center justify-center overflow-hidden bg-slate-950/95';
  const imageClassName = variant === 'desktop'
    ? 'block max-h-[15rem] w-full object-contain p-1.5'
    : 'block max-h-[20rem] w-full object-contain p-1.5';
  const emptyImageClassName = variant === 'desktop'
    ? 'flex min-h-40 items-center justify-center gap-2 px-3 text-center text-xs text-muted-foreground'
    : 'flex min-h-52 items-center justify-center gap-2 px-3 text-center text-sm text-muted-foreground';

  if (!yardId) {
    return (
      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-4 py-3 sm:px-6">
          <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 py-6 text-sm text-muted-foreground sm:px-6">
          Выберите двор или КПП, чтобы загрузить историю посещений.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="gap-0 py-0">
        <CardHeader className="border-b px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
              <Badge variant="outline">{isSearchActive ? displayedVisitors.length : pagination.total}</Badge>
            </div>

            <Button type="button" variant="outline" size="sm" className="h-8 self-start md:self-auto" onClick={handleRefresh} disabled={loading || serverSearching}>
              {loading || serverSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Обновить
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="border-b px-3 py-3 sm:px-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-sm">
                {serverSearching ? (
                  <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                ) : (
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                )}
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value.toUpperCase())}
                  placeholder="Найти по номеру, водителю, телефону, заданию"
                  className="pl-9"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {FILTER_OPTIONS.map((option) => (
                  <Button
                    key={option.key}
                    type="button"
                    size="sm"
                    variant={filter === option.key ? 'default' : 'outline'}
                    className="h-8"
                    onClick={() => {
                      setFilter(option.key);
                      setPage(1);
                    }}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {isSearchActive && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>На текущей странице: {localFilteredVisitors.length}</span>
                <span>Добавлено с сервера: {additionalServerMatches}</span>
                <span>Всего найдено на сервере: {serverSearchTotal}</span>
                {serverSearching && (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Ищем на сервере...
                  </span>
                )}
              </div>
            )}
          </div>

          <div className={listContainerClassName}>
            {loading && visitors.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                Загрузка истории посещений...
              </div>
            ) : isSearchActive && serverSearching && localFilteredVisitors.length === 0 && serverSearchVisitors.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                Ищем совпадения на сервере...
              </div>
            ) : displayedVisitors.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <Car className="h-8 w-8 opacity-50" />
                {isSearchActive ? 'По запросу ничего не найдено' : 'Записей для выбранного фильтра пока нет'}
              </div>
            ) : (
              <div className={listClassName}>
                {displayedVisitors.map((visitor) => {
                  const entryTime = formatDateTime(visitor.entry_date);
                  const exitTime = formatDateTime(visitor.exit_date);
                  const permitEndTime = formatDateTime(visitor.permit_end_date);
                  const exitPermitComment = visitor.exit_permit?.comment?.trim();
                  const hasWorkingCapturePicture = Boolean(visitor.capture_picture_url) && !failedImageVisitorIds.has(visitor.id);
                  const capturePictureUrl = hasWorkingCapturePicture ? visitor.capture_picture_url ?? undefined : undefined;
                  const expiredPermitLabel = visitor.permit_type === 'one_time'
                    ? 'Разовое разрешение действовало до'
                    : 'Разрешение действовало до';

                  return (
                    <div key={visitor.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                      <div className={imageLayoutClassName}>
                        <div className={imagePanelClassName}>
                          {hasWorkingCapturePicture ? (
                            <div className={imageWrapperClassName}>
                              <img
                                src={capturePictureUrl}
                                alt={`ТС ${visitor.plate_number}`}
                                loading="lazy"
                                className={imageClassName}
                                onError={() => handleImageLoadError(visitor.id)}
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="absolute right-2 top-2 h-8 gap-1.5 bg-background/90 text-xs shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/75"
                                onClick={() => setPreviewVisitor(visitor)}
                              >
                                <Maximize2 className="h-3.5 w-3.5" />
                                Открыть
                              </Button>
                            </div>
                          ) : (
                            <div className={emptyImageClassName}>
                              <Car className="h-4 w-4" />
                              Фото ТС недоступно или не загрузилось
                            </div>
                          )}
                        </div>

                        <div className={variant === 'desktop' ? 'min-w-0 flex-1 space-y-2 p-2.5' : 'space-y-3 p-3'}>
                          <div className={variant === 'desktop' ? 'flex items-start justify-between gap-2' : 'flex items-start justify-between gap-3'}>
                            <div className={variant === 'desktop' ? 'min-w-0 space-y-1.5' : 'min-w-0 space-y-2'}>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={variant === 'desktop' ? 'font-mono text-base font-bold tracking-[0.08em] text-foreground' : 'font-mono text-lg font-bold tracking-[0.12em] text-foreground'}>{visitor.plate_number}</span>
                                <Badge className={`${getTerritoryBadgeClass(visitor)} ${compactBadgeClassName}`.trim()}>{getTerritoryBadgeLabel(visitor)}</Badge>
                                <Badge className={`${getPermitBadgeClass(visitor)} ${compactBadgeClassName}`.trim()}>{getPermitBadgeLabel(visitor)}</Badge>
                                {!visitor.exit_date && visitor.exit_permit_required && (
                                  <Badge className={`${visitor.has_active_exit_permit ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'} ${compactBadgeClassName}`.trim()}>
                                    {visitor.has_active_exit_permit ? 'Выезд разрешён' : 'Нужно разрешение на выезд'}
                                  </Badge>
                                )}
                              </div>

                              {visitor.name && (
                                <div className={variant === 'desktop' ? 'line-clamp-2 text-xs text-muted-foreground' : 'text-sm text-muted-foreground'}>
                                  Задание: {visitor.name}
                                </div>
                              )}

                              {hasExpiredPermit(visitor) && permitEndTime && (
                                <div className={variant === 'desktop' ? 'rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-800' : 'rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-sm text-red-800'}>
                                  {expiredPermitLabel}: {permitEndTime.date}, {permitEndTime.time}
                                </div>
                              )}
                            </div>

                            {!visitor.exit_date && (
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                className={variant === 'desktop' ? 'h-7 shrink-0 px-2 text-xs' : 'h-8 shrink-0'}
                                onClick={() => void handleExitVisitor(visitor.id)}
                                disabled={processingVisitorId === visitor.id}
                              >
                                {processingVisitorId === visitor.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                                Выезд
                              </Button>
                            )}
                          </div>

                          <div className={variant === 'desktop' ? 'grid gap-1.5 text-[11px] sm:grid-cols-2' : 'grid gap-2 text-xs sm:grid-cols-2'}>
                            <div className={variant === 'desktop' ? 'rounded-lg border bg-background/70 px-2 py-1 text-foreground' : 'rounded-lg border bg-background/70 px-2 py-1.5 text-foreground'}>
                              <div className={variant === 'desktop' ? 'text-[9px] uppercase tracking-[0.06em] text-muted-foreground' : 'text-[10px] uppercase tracking-[0.08em] text-muted-foreground'}>Въезд</div>
                              <div className={variant === 'desktop' ? 'mt-0.5 flex items-center gap-1' : 'mt-1 flex items-center gap-1.5'}>
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{entryTime ? `${entryTime.date}, ${entryTime.time}` : 'Нет данных'}</span>
                              </div>
                            </div>

                            <div className={variant === 'desktop' ? 'rounded-lg border bg-background/70 px-2 py-1 text-foreground' : 'rounded-lg border bg-background/70 px-2 py-1.5 text-foreground'}>
                              <div className={variant === 'desktop' ? 'text-[9px] uppercase tracking-[0.06em] text-muted-foreground' : 'text-[10px] uppercase tracking-[0.08em] text-muted-foreground'}>Выезд</div>
                              <div className={variant === 'desktop' ? 'mt-0.5 flex items-center gap-1' : 'mt-1 flex items-center gap-1.5'}>
                                <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{exitTime ? `${exitTime.date}, ${exitTime.time}` : 'Пока на территории'}</span>
                              </div>
                            </div>
                          </div>

                          <div className={variant === 'desktop' ? 'space-y-1.5 text-xs' : 'space-y-2 text-sm'}>
                            {visitor.truck_model_name && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Car className={variant === 'desktop' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                                <span>{visitor.truck_model_name}</span>
                              </div>
                            )}

                            {hasMeaningfulTruckOwner(visitor.truck_own) && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <MapPin className={variant === 'desktop' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                                <span>Владелец: {visitor.truck_own}</span>
                              </div>
                            )}

                            {visitor.user_name && (
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <User className={variant === 'desktop' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                                <span className={variant === 'desktop' ? 'line-clamp-1' : ''}>{visitor.user_name}</span>
                              </div>
                            )}

                            {visitor.user_phone && (
                              <a href={`tel:${visitor.user_phone}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                                <Phone className={variant === 'desktop' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                                <span>{visitor.user_phone}</span>
                              </a>
                            )}
                          </div>

                          <div className={variant === 'desktop' ? 'space-y-0.5 text-[11px] text-muted-foreground' : 'space-y-1 text-xs text-muted-foreground'}>
                            <div>
                              {visitor.entrance_device_name
                                ? `Въезд: ${visitor.entrance_device_name}${visitor.entrance_checkpoint_name ? ` • КПП ${visitor.entrance_checkpoint_name}` : ''}`
                                : `Въезд: ручное подтверждение${visitor.entrance_checkpoint_name ? ` • КПП ${visitor.entrance_checkpoint_name}` : ''}`}
                            </div>

                            {(visitor.exit_date || visitor.exit_device_name || visitor.exit_checkpoint_name) && (
                              <div>
                                {visitor.exit_device_name
                                  ? `Выезд: ${visitor.exit_device_name}${visitor.exit_checkpoint_name ? ` • КПП ${visitor.exit_checkpoint_name}` : ''}`
                                  : `Выезд: зафиксирован вручную${visitor.exit_checkpoint_name ? ` • КПП ${visitor.exit_checkpoint_name}` : ''}`}
                              </div>
                            )}

                            {visitor.comment && (
                              <div className={variant === 'desktop' ? 'line-clamp-2 text-muted-foreground' : 'text-muted-foreground'}>
                                <span className="font-medium text-foreground">Цель визита:</span> {visitor.comment}
                              </div>
                            )}

                            {visitor.description && visitor.description !== visitor.comment && (
                              <div className={variant === 'desktop' ? 'line-clamp-2 text-muted-foreground' : 'text-muted-foreground'}>
                                <span className="font-medium text-foreground">Описание:</span> {visitor.description}
                              </div>
                            )}

                            {exitPermitComment && (
                              <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-2 py-1 text-amber-800">
                                Комментарий к разрешению на выезд: {exitPermitComment}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {pagination.last_page > 1 && !isSearchActive && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm text-muted-foreground">
                <span>
                  Показано {pagination.from ?? 0}-{pagination.to ?? 0} из {pagination.total}
                </span>

                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((previousPage) => Math.max(1, previousPage - 1))}>
                    Назад
                  </Button>
                  <span>
                    Страница {pagination.current_page} из {pagination.last_page}
                  </span>
                  <Button type="button" variant="outline" size="sm" disabled={page >= pagination.last_page || loading} onClick={() => setPage((previousPage) => Math.min(pagination.last_page, previousPage + 1))}>
                    Вперёд
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(previewVisitor?.capture_picture_url)} onOpenChange={(open) => !open && setPreviewVisitor(null)}>
        <DialogContent className="max-w-6xl border-slate-800 bg-slate-950 p-2 text-slate-100 sm:p-4">
          <DialogHeader className="px-1 pb-1 text-left sm:px-2">
            <DialogTitle>
              Фото ТС {previewVisitor?.plate_number ?? ''}
            </DialogTitle>
          </DialogHeader>

          {previewVisitor?.capture_picture_url && (
            <div className="flex items-center justify-center overflow-auto rounded-lg bg-black/40 p-1 sm:p-2">
              <img
                src={previewVisitor.capture_picture_url ?? undefined}
                alt={`Фото ТС ${previewVisitor.plate_number}`}
                className="max-h-[82vh] w-auto max-w-full rounded-md object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}