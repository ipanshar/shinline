import NewRequestModal from '@/components/spectech/NewRequestModal';
import PhotoGallery from '@/components/spectech/PhotoGallery';
import { type SpectechRequestData } from '@/components/spectech/RequestCard';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import { CalendarClock, ChevronDown, ChevronUp, ClipboardList, Plus, RefreshCw, Search } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Спецтехника', href: '/spectech/requests' },
    { title: 'Мои заявки', href: '/spectech/requests' },
];

const STATUS_FILTERS = [
    { value: '', label: 'Все' },
    { value: 'new', label: 'Новые' },
    { value: 'departure', label: 'Выезд' },
    { value: 'on_location', label: 'На объекте' },
    { value: 'work_started', label: 'Работы начаты' },
    { value: 'completed', label: 'Выполнено' },
    { value: 'returned', label: 'Возврат' },
];

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
    new: { bg: '#F0F0F0', text: '#666666', border: '#CCCCCC' },
    departure: { bg: '#FFF4E6', text: '#E67E22', border: '#F0D5A8' },
    on_location: { bg: '#E8F4F8', text: '#0088CC', border: '#B3D9E6' },
    work_started: { bg: '#E8F0FF', text: '#0051B3', border: '#B3D9FF' },
    completed: { bg: '#E8F5E9', text: '#27AE60', border: '#A8D5BA' },
    returned: { bg: '#D4EDDA', text: '#1B5E20', border: '#A3D5A8' },
};

function formatDate(dateValue?: string | null): string {
    if (!dateValue) return '—';
    const date = new Date(dateValue);
    return Number.isNaN(date.getTime()) ? dateValue : date.toLocaleDateString('ru-RU');
}

function formatDateTime(dateValue?: string | null): string {
    if (!dateValue) return 'Не зафиксировано';
    const date = new Date(dateValue);
    return Number.isNaN(date.getTime()) ? dateValue : date.toLocaleString('ru-RU');
}

function formatDuration(dateStart?: string | null, dateEnd?: string | null): string {
    if (!dateStart || !dateEnd) return '—';

    const start = new Date(dateStart).getTime();
    const end = new Date(dateEnd).getTime();

    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
        return '—';
    }

    const hours = (end - start) / (1000 * 60 * 60);
    if (hours < 1) {
        return `${Math.round(hours * 60)} мин`;
    }

    return `${String(Math.round(hours * 10) / 10).replace('.', ',')} ч`;
}

function getDurationHours(dateStart?: string | null, dateEnd?: string | null): number | null {
    if (!dateStart || !dateEnd) return null;

    const start = new Date(dateStart).getTime();
    const end = new Date(dateEnd).getTime();

    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
        return null;
    }

    return (end - start) / (1000 * 60 * 60);
}

function getDurationBadgeClass(hours: number | null): string {
    if (hours === null) return 'border-gray-200 bg-gray-50 text-gray-600';
    if (hours <= 2) return 'border-green-200 bg-green-50 text-green-700';
    if (hours <= 8) return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-red-200 bg-red-50 text-red-700';
}

function getCurrentStage(request: SpectechRequestData): string {
    const timeline = request.timeline ?? [];
    const done = timeline.filter((s) => s.time);
    return done.length > 0 ? done[done.length - 1].title : 'Заявка';
}

export default function SpectechRequests() {
    const [requests, setRequests] = useState<SpectechRequestData[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [toast, setToast] = useState('');
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [durationSort, setDurationSort] = useState<'default' | 'short' | 'long'>('default');

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        try {
            const params = statusFilter ? { status: statusFilter } : {};
            const res = await axios.get('/spectech/api/requests', { params });
            if (res.data?.status && Array.isArray(res.data.data)) {
                setRequests(res.data.data);
            }
        } catch {
            // Ошибка уже логируется общим axios-интерсептором, если он настроен.
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const sorted = useMemo(() => [...requests].sort((a, b) => b.id - a.id), [requests]);

    const filteredRequests = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const searched = !q
            ? sorted
            : sorted.filter((req) => {
                  const haystack = [
                      String(req.id),
                      req.equipment_name,
                      req.address,
                      req.comment ?? '',
                      req.status_label,
                      getCurrentStage(req),
                      req.schedule_id ? `#${req.schedule_id}` : '',
                  ]
                      .join(' ')
                      .toLowerCase();

                  return haystack.includes(q);
              });

        if (durationSort === 'default') return searched;

        return [...searched].sort((a, b) => {
            const aHours = getDurationHours(a.requested_start ?? a.start_date, a.requested_end ?? a.end_date) ?? 0;
            const bHours = getDurationHours(b.requested_start ?? b.start_date, b.requested_end ?? b.end_date) ?? 0;
            return durationSort === 'short' ? aHours - bHours : bHours - aHours;
        });
    }, [durationSort, searchQuery, sorted]);

    const stats = useMemo(() => {
        const active = requests.filter((r) => !['completed', 'returned'].includes(r.status)).length;
        const completed = requests.filter((r) => r.status === 'completed').length;

        return [
            { label: 'Всего заявок', value: requests.length, tone: 'text-foreground' },
            { label: 'В работе', value: active, tone: 'text-red-600' },
            { label: 'Выполнено', value: completed, tone: 'text-green-700' },
        ];
    }, [requests]);

    const handleCreated = async () => {
        await fetchRequests();
        setToast('Заявка успешно создана.');
        window.setTimeout(() => setToast(''), 2500);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Мои заявки" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <section className="rounded-xl border border-[#E8E8E8] bg-gradient-to-r from-white to-[#FFF8F8] px-4 py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <ClipboardList className="h-5 w-5 text-red-600" />
                                <p className="text-[13px] font-semibold text-[#1A1A1A]">Мои заявки на спецтехнику</p>
                            </div>
                            <p className="text-xs text-[#6B6B6B]">Следите за статусами и быстро находите нужную заявку через поиск.</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" size="sm" onClick={fetchRequests} disabled={loading}>
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button size="sm" className="w-full bg-red-600 text-white hover:bg-red-700 sm:w-auto" onClick={() => setModalOpen(true)}>
                                <Plus className="mr-1 h-4 w-4" />
                                Создать заявку
                            </Button>
                        </div>
                    </div>
                </section>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {stats.map((item) => (
                        <div key={item.label} className="border-border bg-card rounded-lg border p-3">
                            <div className="text-muted-foreground text-[11px]">{item.label}</div>
                            <div className={`mt-1 text-2xl font-semibold ${item.tone}`}>{item.value}</div>
                        </div>
                    ))}
                </div>

                {toast && <div className="rounded-md border border-[#E8E8E8] bg-[#FFF0F0] px-4 py-2.5 text-[12.5px] text-[#D32F2F]">{toast}</div>}

                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <div className="relative min-w-0 flex-1 md:max-w-xl">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                        <input
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Поиск по ID, технике, адресу, комментарию"
                            className="border-input bg-background h-10 w-full rounded-md border pr-3 pl-9 text-sm ring-0 transition outline-none focus:border-red-300"
                        />
                    </div>
                    <select
                        value={durationSort}
                        onChange={(e) => setDurationSort(e.target.value as 'default' | 'short' | 'long')}
                        className="border-input bg-background h-10 w-full rounded-md border px-3 text-sm transition outline-none focus:border-red-300 md:w-auto"
                    >
                        <option value="default">Сортировка: по умолчанию</option>
                        <option value="short">Сначала короткие</option>
                        <option value="long">Сначала длинные</option>
                    </select>
                </div>

                <div className="flex flex-wrap gap-2">
                    {STATUS_FILTERS.map((f) => (
                        <button
                            key={f.value}
                            onClick={() => setStatusFilter(f.value)}
                            className={`h-7 rounded-full border px-3 text-xs font-medium transition-colors ${
                                statusFilter === f.value ? 'border-red-600 bg-red-600 text-white' : 'border-border bg-background hover:bg-muted'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                <section className="rounded-lg border border-[#E8E8E8] bg-white p-[14px]">
                    {loading && <p className="text-[12.5px] text-[#6B6B6B]">Загрузка...</p>}

                    {!loading && filteredRequests.length === 0 && (
                        <div className="text-muted-foreground flex flex-col items-center justify-center gap-3 py-16">
                            <ClipboardList className="h-12 w-12 opacity-30" />
                            <span>{searchQuery ? 'Ничего не найдено по текущему запросу.' : 'Пока нет заявок. Создайте первую заявку.'}</span>
                        </div>
                    )}

                    {!loading && filteredRequests.length > 0 && (
                        <>
                            <div className="space-y-3 lg:hidden">
                                {filteredRequests.map((req) => {
                                    const st = STATUS_STYLES[req.status] || STATUS_STYLES.new;
                                    const isExpanded = expandedId === req.id;
                                    const durationHours = getDurationHours(req.requested_start ?? req.start_date, req.requested_end ?? req.end_date);

                                    return (
                                        <article key={req.id} className="rounded-xl border border-[#E8E8E8] bg-white p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-[#1A1A1A]">
                                                        #{req.id} {req.equipment_name}
                                                    </p>
                                                    <p className="mt-1 text-xs text-[#6B6B6B]">
                                                        {req.requested_start && req.requested_end
                                                            ? `${formatDateTime(req.requested_start)} - ${formatDateTime(req.requested_end)}`
                                                            : `${formatDate(req.start_date)} - ${formatDate(req.end_date)}`}
                                                    </p>
                                                </div>
                                                <span
                                                    className="shrink-0 rounded border px-2 py-1 text-[11px] font-medium"
                                                    style={{ background: st.bg, color: st.text, borderColor: st.border }}
                                                >
                                                    {req.status_label}
                                                </span>
                                            </div>

                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <span
                                                    className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${getDurationBadgeClass(durationHours)}`}
                                                >
                                                    {formatDuration(req.requested_start ?? req.start_date, req.requested_end ?? req.end_date)}
                                                </span>
                                                {req.schedule_id ? (
                                                    <span
                                                        className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${req.from_scheduling ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
                                                    >
                                                        {req.from_scheduling
                                                            ? `Из планирования #${req.schedule_id}`
                                                            : `Планирование #${req.schedule_id}`}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center rounded border border-[#E8E8E8] bg-[#FAFAFA] px-2 py-0.5 text-[11px] text-[#8A8A8A]">
                                                        Без связи
                                                    </span>
                                                )}
                                            </div>

                                            <div className="mt-3 space-y-2 text-xs text-[#2C2C2C]">
                                                <div>
                                                    <span className="font-medium">Адрес:</span>{' '}
                                                    <span className="break-words text-[#6B6B6B]">{req.address || '—'}</span>
                                                </div>
                                                <div>
                                                    <span className="font-medium">Текущий этап:</span>{' '}
                                                    <span
                                                        className="inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium"
                                                        style={{ background: st.bg, color: st.text, borderColor: st.border }}
                                                    >
                                                        {getCurrentStage(req)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1 text-[#6B6B6B]">
                                                    <CalendarClock className="h-3.5 w-3.5" />
                                                    {formatDate(req.created_at)}
                                                </div>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => setExpandedId(isExpanded ? null : req.id)}
                                                className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1 rounded-md border border-[#E0E0E0] bg-white px-3 text-[12px] text-[#1A1A1A] hover:bg-[#FAFAFA]"
                                            >
                                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                Детали
                                            </button>

                                            {isExpanded && (
                                                <div className="mt-3 grid gap-4 border-t border-[#EFEFEF] pt-3 md:grid-cols-2">
                                                    <div>
                                                        <div className="mb-2 text-xs font-semibold text-[#1A1A1A]">Лента времени</div>
                                                        <div className="space-y-1.5">
                                                            {(req.timeline ?? []).map((step, idx) => (
                                                                <div key={`${step.title}-${idx}`} className="flex items-start gap-2 text-xs">
                                                                    <span
                                                                        className={`mt-1 h-2 w-2 rounded-full ${step.time ? 'bg-red-600' : 'bg-gray-300'}`}
                                                                    />
                                                                    <div className="min-w-0">
                                                                        <div className="text-[#1A1A1A]">{step.title}</div>
                                                                        <div className="break-words text-[#6B6B6B]">{formatDateTime(step.time)}</div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="mb-2 text-xs font-semibold text-[#1A1A1A]">Комментарий и фото</div>
                                                        <p className="mb-2 text-xs text-[#6B6B6B]">
                                                            Время:{' '}
                                                            <span
                                                                className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${getDurationBadgeClass(durationHours)}`}
                                                            >
                                                                {formatDuration(
                                                                    req.requested_start ?? req.start_date,
                                                                    req.requested_end ?? req.end_date,
                                                                )}
                                                            </span>
                                                        </p>
                                                        <p className="mb-2 text-xs break-words text-[#2C2C2C]">{req.comment || 'Без комментария'}</p>
                                                        <PhotoGallery photos={req.photos ?? []} compact />
                                                    </div>
                                                </div>
                                            )}
                                        </article>
                                    );
                                })}
                            </div>

                            <div className="hidden overflow-x-auto lg:block">
                                <table className="min-w-full border-collapse text-left text-[12.5px]">
                                    <thead>
                                        <tr className="border-b border-[#E8E8E8] text-[#6B6B6B]">
                                            <th className="px-3 py-2">ID</th>
                                            <th className="px-3 py-2">Техника</th>
                                            <th className="px-3 py-2">Связь</th>
                                            <th className="px-3 py-2">Статус</th>
                                            <th className="px-3 py-2">Период</th>
                                            <th className="px-3 py-2">Время</th>
                                            <th className="px-3 py-2">Создана</th>
                                            <th className="px-3 py-2">Адрес</th>
                                            <th className="px-3 py-2">Текущий этап</th>
                                            <th className="px-3 py-2">Лента</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredRequests.map((req) => {
                                            const st = STATUS_STYLES[req.status] || STATUS_STYLES.new;
                                            const isExpanded = expandedId === req.id;

                                            const durationHours = getDurationHours(
                                                req.requested_start ?? req.start_date,
                                                req.requested_end ?? req.end_date,
                                            );

                                            return (
                                                <React.Fragment key={req.id}>
                                                    <tr className="border-b border-[#E8E8E8] text-[#2C2C2C] hover:bg-[#FAFAFA]">
                                                        <td className="px-3 py-2">#{req.id}</td>
                                                        <td className="px-3 py-2">{req.equipment_name}</td>
                                                        <td className="px-3 py-2">
                                                            {req.schedule_id ? (
                                                                <span
                                                                    className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${req.from_scheduling ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
                                                                >
                                                                    {req.from_scheduling
                                                                        ? `Из планирования #${req.schedule_id}`
                                                                        : `Планирование #${req.schedule_id}`}
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-[#9A9A9A]">Без связи</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2">{req.status_label}</td>
                                                        <td className="px-3 py-2 whitespace-nowrap">
                                                            {req.requested_start && req.requested_end
                                                                ? `${formatDateTime(req.requested_start)} - ${formatDateTime(req.requested_end)}`
                                                                : `${formatDate(req.start_date)} - ${formatDate(req.end_date)}`}
                                                        </td>
                                                        <td className="px-3 py-2 whitespace-nowrap">
                                                            <span
                                                                className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${getDurationBadgeClass(durationHours)}`}
                                                            >
                                                                {formatDuration(
                                                                    req.requested_start ?? req.start_date,
                                                                    req.requested_end ?? req.end_date,
                                                                )}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2 whitespace-nowrap">
                                                            <span className="inline-flex items-center gap-1 text-[#6B6B6B]">
                                                                <CalendarClock className="h-3.5 w-3.5" />
                                                                {formatDate(req.created_at)}
                                                            </span>
                                                        </td>
                                                        <td className="max-w-[260px] truncate px-3 py-2" title={req.address}>
                                                            {req.address}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <span
                                                                className="rounded border px-2 py-1 text-[11px] font-medium"
                                                                style={{ background: st.bg, color: st.text, borderColor: st.border }}
                                                            >
                                                                {getCurrentStage(req)}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setExpandedId(isExpanded ? null : req.id)}
                                                                className="inline-flex h-8 items-center gap-1 rounded-md border border-[#E0E0E0] bg-white px-3 text-[12px] text-[#1A1A1A] hover:bg-[#FAFAFA]"
                                                            >
                                                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                                Детали
                                                            </button>
                                                        </td>
                                                    </tr>

                                                    {isExpanded && (
                                                        <tr className="border-b border-[#E8E8E8] bg-[#FCFCFC]">
                                                            <td className="px-3 py-3" colSpan={10}>
                                                                <div className="grid gap-4 md:grid-cols-2">
                                                                    <div>
                                                                        <div className="mb-2 text-xs font-semibold text-[#1A1A1A]">Лента времени</div>
                                                                        <div className="space-y-1.5">
                                                                            {(req.timeline ?? []).map((step, idx) => (
                                                                                <div
                                                                                    key={`${step.title}-${idx}`}
                                                                                    className="flex items-start gap-2 text-xs"
                                                                                >
                                                                                    <span
                                                                                        className={`mt-1 h-2 w-2 rounded-full ${step.time ? 'bg-red-600' : 'bg-gray-300'}`}
                                                                                    />
                                                                                    <div>
                                                                                        <div className="text-[#1A1A1A]">{step.title}</div>
                                                                                        <div className="text-[#6B6B6B]">
                                                                                            {formatDateTime(step.time)}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <div className="mb-2 text-xs font-semibold text-[#1A1A1A]">
                                                                            Комментарий и фото
                                                                        </div>
                                                                        <p className="mb-2 text-xs text-[#6B6B6B]">
                                                                            Время:{' '}
                                                                            <span
                                                                                className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${getDurationBadgeClass(durationHours)}`}
                                                                            >
                                                                                {formatDuration(
                                                                                    req.requested_start ?? req.start_date,
                                                                                    req.requested_end ?? req.end_date,
                                                                                )}
                                                                            </span>
                                                                        </p>
                                                                        <p className="mb-2 text-xs text-[#2C2C2C]">
                                                                            {req.comment || 'Без комментария'}
                                                                        </p>
                                                                        <PhotoGallery photos={req.photos ?? []} compact />
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </section>

                {/* Модал создания */}
                <NewRequestModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
            </div>
        </AppLayout>
    );
}
