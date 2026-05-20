import PhotoGallery from '@/components/spectech/PhotoGallery';
import NewRequestModal from '@/components/spectech/NewRequestModal';
import { type SpectechRequestData } from '@/components/spectech/RequestCard';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, FileSpreadsheet, LayoutDashboard, RefreshCw, Search, TimerReset } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { XCircle } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Спецтехника', href: '/spectech/dashboard' },
    { title: 'Панель оператора', href: '/spectech/dashboard' },
];

const STATUS_FILTERS = [
    { value: '', label: 'Все' },
    { value: 'new', label: 'Новые' },
    { value: 'departure', label: 'Выезд' },
    { value: 'on_location', label: 'На объекте' },
    { value: 'work_started', label: 'Работы' },
    { value: 'completed', label: 'Выполнено' },
    { value: 'returned', label: 'Возврат' },
    { value: 'cancelled', label: 'Отменено' },
];

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
    new: { bg: '#F0F0F0', text: '#666666', border: '#CCCCCC' },
    departure: { bg: '#FFF4E6', text: '#E67E22', border: '#F0D5A8' },
    on_location: { bg: '#E8F4F8', text: '#0088CC', border: '#B3D9E6' },
    work_started: { bg: '#E8F0FF', text: '#0051B3', border: '#B3D9FF' },
    completed: { bg: '#E8F5E9', text: '#27AE60', border: '#A8D5BA' },
    returned: { bg: '#D4EDDA', text: '#1B5E20', border: '#A3D5A8' },
    cancelled: { bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA' },
};

const NEXT_STATUS: Record<string, { value: string; label: string }> = {
    new: { value: 'departure', label: 'Отправить в выезд' },
    departure: { value: 'on_location', label: 'Прибыл на объект' },
    on_location: { value: 'work_started', label: 'Начать работы' },
    work_started: { value: 'completed', label: 'Завершить работы' },
    completed: { value: 'returned', label: 'Техника вернулась' },
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

function getCurrentStage(request: SpectechRequestData): string {
    const timeline = request.timeline ?? [];
    const done = timeline.filter((s) => s.time);
    return done.length > 0 ? done[done.length - 1].title : 'Заявка';
}

function getInitiatorLabel(request: SpectechRequestData): string {
    return request.initiator_name || request.client_name || '—';
}

// ─── Gantt для панели оператора ─────────────────────────────────────────────

type GanttRange = 'day' | 'week' | 'month';

function getGanttBounds(range: GanttRange, anchor: Date): { start: number; end: number } {
    if (range === 'day') {
        return {
            start: new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 0, 0, 0).getTime(),
            end:   new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 23, 59, 59).getTime(),
        };
    }
    if (range === 'week') {
        const mon = new Date(anchor);
        mon.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
        mon.setHours(0, 0, 0, 0);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        sun.setHours(23, 59, 59, 999);
        return { start: mon.getTime(), end: sun.getTime() };
    }
    return {
        start: new Date(anchor.getFullYear(), anchor.getMonth(), 1, 0, 0, 0).getTime(),
        end:   new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 23, 59, 59).getTime(),
    };
}

function getGanttTicks(range: GanttRange, rangeStart: number, rangeEnd: number) {
    const total = rangeEnd - rangeStart;
    const ticks: { pct: number; label: string }[] = [];
    if (range === 'day') {
        for (let h = 0; h <= 24; h += 3) {
            const pct = ((new Date(rangeStart).setHours(h, 0, 0, 0) - rangeStart) / total) * 100;
            if (pct >= 0 && pct <= 100.1) ticks.push({ pct, label: `${String(h).padStart(2, '0')}:00` });
        }
    } else if (range === 'week') {
        const DAYS = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
        const cur = new Date(rangeStart);
        while (cur.getTime() <= rangeEnd) {
            ticks.push({ pct: ((cur.getTime() - rangeStart) / total) * 100, label: `${DAYS[cur.getDay()]} ${cur.getDate()}` });
            cur.setDate(cur.getDate() + 1);
        }
    } else {
        const cur = new Date(rangeStart);
        while (cur.getTime() <= rangeEnd) {
            ticks.push({ pct: ((cur.getTime() - rangeStart) / total) * 100, label: `${cur.getDate()}` });
            cur.setDate(cur.getDate() + 7);
        }
    }
    return ticks;
}

const GanttView: React.FC<{ requests: SpectechRequestData[]; range: GanttRange; anchor: Date }> = ({ requests, range, anchor }) => {
    const [tooltip, setTooltip] = useState<{ lines: string[]; x: number; y: number } | null>(null);

    const { start: rangeStart, end: rangeEnd } = useMemo(() => getGanttBounds(range, anchor), [range, anchor]);
    const total = rangeEnd - rangeStart;
    const nowPct = ((Date.now() - rangeStart) / total) * 100;
    const ticks = useMemo(() => getGanttTicks(range, rangeStart, rangeEnd), [range, rangeStart, rangeEnd]);

    const inRange = (r: SpectechRequestData) =>
        r.requested_start && r.requested_end &&
        r.status !== 'cancelled' &&
        new Date(r.requested_end).getTime() >= rangeStart &&
        new Date(r.requested_start).getTime() <= rangeEnd;

    const active = useMemo(() => requests.filter(inRange), [requests, rangeStart, rangeEnd]);

    const clampLeft  = (iso: string) => Math.max(0, Math.min(100, ((new Date(iso).getTime() - rangeStart) / total) * 100));
    const clampWidth = (s: string, e: string) => {
        const l = (new Date(s).getTime() - rangeStart) / total * 100;
        const r = (new Date(e).getTime() - rangeStart) / total * 100;
        return Math.max(0.5, Math.min(100, r) - Math.max(0, l));
    };

    const grouped = useMemo(() => {
        const map = new Map<number, { label: string; plateNumber: string | null; items: SpectechRequestData[] }>();
        for (const r of active) {
            const entry = map.get(r.equipment_id) ?? {
                label: r.equipment_name,
                plateNumber: r.plate_number ?? null,
                items: [],
            };
            if (!entry.plateNumber && r.plate_number) {
                entry.plateNumber = r.plate_number;
            }
            entry.items.push(r);
            map.set(r.equipment_id, entry);
        }
        return map;
    }, [active]);

    const LABEL_W = 132;
    const ROW_H = 36;

    return (
        <div className="relative select-none" onMouseLeave={() => setTooltip(null)}>
            {tooltip && (
                <div
                    className="fixed z-50 max-w-[240px] rounded-xl border border-slate-200 bg-white shadow-xl px-3 py-2 text-xs pointer-events-none"
                    style={{ left: tooltip.x + 14, top: tooltip.y - 6 }}
                >
                    {tooltip.lines.map((ln, i) => (
                        <div key={i} className={i === 0 ? 'font-semibold text-slate-800' : 'text-slate-500 mt-0.5'}>{ln}</div>
                    ))}
                </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200">
                <div style={{ minWidth: 600 }}>
                    {/* Time axis */}
                    <div className="flex border-b border-slate-200 bg-slate-50" style={{ paddingLeft: LABEL_W }}>
                        <div className="relative flex-1" style={{ height: 28 }}>
                            {ticks.map((tick, i) => (
                                <span
                                    key={i}
                                    className="absolute bottom-1 text-[10px] text-slate-400 whitespace-nowrap -translate-x-1/2"
                                    style={{ left: `${tick.pct}%` }}
                                >
                                    {tick.label}
                                </span>
                            ))}
                            {nowPct >= 0 && nowPct <= 100 && (
                                <div className="absolute inset-y-0 w-px bg-red-400" style={{ left: `${nowPct}%` }} />
                            )}
                        </div>
                    </div>

                    {active.length === 0 && (
                        <div className="py-10 text-center text-sm text-slate-400">Нет заявок на выбранный период</div>
                    )}

                    {Array.from(grouped.entries()).map(([equipId, { label, plateNumber, items }]) => (
                        <div key={equipId}>
                            <div className="flex items-center gap-2 bg-slate-50/80 border-b border-t border-slate-100 px-2" style={{ minHeight: 28 }}>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</span>
                                {plateNumber && (
                                    <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                        {plateNumber}
                                    </span>
                                )}
                            </div>
                            {items.map((req) => {
                                const st = STATUS_STYLES[req.status] ?? STATUS_STYLES.new;
                                const left  = clampLeft(req.requested_start!);
                                const width = clampWidth(req.requested_start!, req.requested_end!);
                                return (
                                    <div
                                        key={req.id}
                                        className="flex items-center border-b border-slate-100 hover:bg-blue-50/20 transition-colors"
                                        style={{ minHeight: ROW_H }}
                                    >
                                        <div
                                            className="flex-shrink-0 px-2 text-right border-r border-slate-100"
                                            style={{ width: LABEL_W }}
                                            title={`${req.equipment_name}${req.plate_number ? ` · ${req.plate_number}` : ''}`}
                                        >
                                            <div className="text-[11px] text-slate-500">#{req.id}</div>
                                            {req.plate_number && (
                                                <div className="truncate text-[10px] font-semibold text-slate-700">{req.plate_number}</div>
                                            )}
                                        </div>
                                        <div className="relative flex-1" style={{ minHeight: ROW_H }}>
                                            {ticks.map((tick, i) => (
                                                <div
                                                    key={i}
                                                    className="absolute inset-y-0 border-l border-slate-100"
                                                    style={{ left: `${tick.pct}%` }}
                                                />
                                            ))}
                                            {nowPct >= 0 && nowPct <= 100 && (
                                                <div className="absolute inset-y-0 w-px bg-red-400/50 z-10" style={{ left: `${nowPct}%` }} />
                                            )}
                                            <div
                                                className="absolute top-2 bottom-2 rounded-md flex items-center px-2 overflow-hidden cursor-pointer hover:brightness-95 transition-all"
                                                style={{
                                                    left: `${left}%`,
                                                    width: `${width}%`,
                                                    background: st.bg,
                                                    color: st.text,
                                                    borderLeft: `3px solid ${st.border}`,
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                                                }}
                                                onMouseEnter={e => {
                                                    const r = e.currentTarget.getBoundingClientRect();
                                                        setTooltip({
                                                            x: r.left, y: r.top,
                                                            lines: [
                                                                `#${req.id} · ${req.status_label}`,
                                                                `${req.equipment_name}${req.plate_number ? ` · ${req.plate_number}` : ''}`,
                                                                getInitiatorLabel(req),
                                                                `${formatDateTime(req.requested_start)} → ${formatDateTime(req.requested_end)}`,
                                                                ...(req.address ? [`📍 ${req.address}`] : []),
                                                                ...(req.driver_name ? [`👤 ${req.driver_name}`] : []),
                                                            ],
                                                        });
                                                }}
                                                onMouseLeave={() => setTooltip(null)}
                                            >
                                                <span className="truncate text-[10px] font-semibold">
                                                    {req.plate_number ? `${req.plate_number} · ` : ''}{getInitiatorLabel(req) !== '—' ? getInitiatorLabel(req) : req.equipment_name}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Legend */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
                {Object.entries(STATUS_STYLES).map(([key, col]) => {
                    const lbl = STATUS_FILTERS.find(f => f.value === key)?.label ?? key;
                    return (
                        <div key={key} className="flex items-center gap-1">
                            <div className="w-3 h-3 rounded-sm" style={{ background: col.bg, borderLeft: `2px solid ${col.border}` }} />
                            <span>{lbl}</span>
                        </div>
                    );
                })}
                <div className="flex items-center gap-1">
                    <div className="w-0.5 h-3 bg-red-400 rounded-full" />
                    <span>Сейчас</span>
                </div>
            </div>
        </div>
    );
};

export default function SpectechDashboard() {
    const [requests, setRequests] = useState<SpectechRequestData[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [updatingId, setUpdatingId] = useState<number | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [message, setMessage] = useState('');
    const [viewMode, setViewMode] = useState<'list'|'gantt'>('list');
    const [ganttRange, setGanttRange] = useState<GanttRange>('week');
    const [ganttAnchor, setGanttAnchor] = useState<Date>(new Date());

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
        void fetchRequests();
    }, [fetchRequests]);

    const handleStatusChange = async (id: number, newStatus: string) => {
        setUpdatingId(id);
        try {
            await axios.patch(`/spectech/api/requests/${id}/status`, { status: newStatus });
            await fetchRequests();
        } catch (error: any) {
            const responseMessage = error?.response?.data?.message;
            if (typeof responseMessage === 'string' && responseMessage.trim()) {
                setMessage(responseMessage);
            }
            await fetchRequests();
        } finally {
            setUpdatingId(null);
        }
    };

    const [modalOpen, setModalOpen] = useState(false);
    const [editingRequest, setEditingRequest] = useState<SpectechRequestData | null>(null);

    const handleSaved = async (saved?: SpectechRequestData) => {
        const wasEditing = editingRequest !== null;

        if (saved) {
            setRequests((prev) => {
                const exists = prev.some((item) => item.id === saved.id);
                return exists ? prev.map((i) => (i.id === saved.id ? saved : i)) : [saved, ...prev];
            });
            setExpandedId(saved.id);
        }

        setEditingRequest(null);
        setModalOpen(false);
        await fetchRequests();
    };

    const openCreateModal = () => { setEditingRequest(null); setModalOpen(true); };
    const openEditModal = (request: SpectechRequestData) => { setEditingRequest(request); setModalOpen(true); };

    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [cancellingRequest, setCancellingRequest] = useState<SpectechRequestData | null>(null);
    const [cancelLoading, setCancelLoading] = useState(false);
    const [cancelReason, setCancelReason] = useState('');

    const openCancelModal = (request: SpectechRequestData) => {
        setCancellingRequest(request);
        setCancelReason('');
        setCancelModalOpen(true);
    };

    const handleCancel = async (reason: string) => {
        if (!cancellingRequest) return;
        setCancelLoading(true);
        setUpdatingId(cancellingRequest.id);
        try {
            await axios.patch(`/spectech/api/requests/${cancellingRequest.id}/cancel`, { reason });
            await fetchRequests();
            setCancelModalOpen(false);
            setCancellingRequest(null);
            setCancelReason('');
        } catch (e: any) {
            setMessage(e?.response?.data?.message || 'Ошибка при отмене');
        } finally {
            setUpdatingId(null);
            setCancelLoading(false);
        }
    };


    const stats = [
        { label: 'Всего', value: requests.length, color: 'text-foreground' },
        {
            label: 'Активных',
            value: requests.filter((r) => !['completed', 'returned', 'cancelled'].includes(r.status)).length,
            color: 'text-red-600',
        },
        { label: 'Выполнено', value: requests.filter((r) => r.status === 'completed').length, color: 'text-green-700' },
        { label: 'Возвращено', value: requests.filter((r) => r.status === 'returned').length, color: 'text-gray-500' },
        { label: 'Отменено', value: requests.filter((r) => r.status === 'cancelled').length, color: 'text-red-700' },
    ];

    const sorted = useMemo(() => [...requests].sort((a, b) => b.id - a.id), [requests]);

    const filteredRequests = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return sorted;

        return sorted.filter((req) => {
            const haystack = [String(req.id), req.client_name ?? '', req.initiator_name ?? '', req.initiator_phone ?? '', req.equipment_name, req.address, req.status_label, getCurrentStage(req)]
                .join(' ')
                .toLowerCase();

            return haystack.includes(q);
        });
    }, [searchQuery, sorted]);

    const periodLabel = useMemo(() => {
        if (ganttRange === 'day') return ganttAnchor.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        if (ganttRange === 'week') {
            const mon = new Date(ganttAnchor);
            mon.setDate(ganttAnchor.getDate() - ((ganttAnchor.getDay() + 6) % 7));
            mon.setHours(0,0,0,0);
            const sun = new Date(mon);
            sun.setDate(mon.getDate() + 6);
            return `${mon.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} — ${sun.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}`;
        }
        return ganttAnchor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    }, [ganttRange, ganttAnchor]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Панель оператора - Спецтехника" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <section className="rounded-xl border border-[#E8E8E8] bg-gradient-to-r from-white to-[#FFF8F8] px-4 py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <LayoutDashboard className="h-5 w-5 text-red-600" />
                                <p className="text-[13px] font-semibold text-[#1A1A1A]">Панель оператора спецтехники</p>
                            </div>
                            <p className="text-xs text-[#6B6B6B]">Управляйте статусами заявок и отслеживайте прогресс работ в одном месте.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => void fetchRequests()} disabled={loading}>
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                            <a
                                href="/spectech/reports"
                                className="inline-flex h-8 items-center gap-2 rounded-md border border-[#E0E0E0] bg-white px-3 text-xs text-[#1A1A1A] hover:bg-[#FAFAFA]"
                            >
                                <FileSpreadsheet className="h-4 w-4 text-red-600" />
                                Отчёт
                            </a>
                            <div className="flex items-center gap-2">
                            <div className="flex rounded-md border border-[#E0E0E0] overflow-hidden">
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`h-8 px-2.5 flex items-center gap-1 text-xs transition-colors ${viewMode === 'list' ? 'bg-red-600 text-white' : 'bg-white text-[#555] hover:bg-[#F5F5F5]'}`}
                                >
                                    Список
                                </button>
                                <button
                                    onClick={() => setViewMode('gantt')}
                                    className={`h-8 px-2.5 flex items-center gap-1 text-xs border-l border-[#E0E0E0] transition-colors ${viewMode === 'gantt' ? 'bg-red-600 text-white' : 'bg-white text-[#555] hover:bg-[#F5F5F5]'}`}
                                >
                                    Gantt
                                </button>
                            </div>

                            {viewMode === 'gantt' && (
                                <div className="flex items-center gap-2 ml-2">
                                    <button
                                        onClick={() => setGanttRange('day')}
                                        className={`h-8 px-2 text-xs ${ganttRange === 'day' ? 'bg-red-600 text-white' : 'bg-white hover:bg-slate-50'}`}
                                    >День</button>
                                    <button
                                        onClick={() => setGanttRange('week')}
                                        className={`h-8 px-2 text-xs ${ganttRange === 'week' ? 'bg-red-600 text-white' : 'bg-white hover:bg-slate-50'}`}
                                    >Неделя</button>
                                    <button
                                        onClick={() => setGanttRange('month')}
                                        className={`h-8 px-2 text-xs ${ganttRange === 'month' ? 'bg-red-600 text-white' : 'bg-white hover:bg-slate-50'}`}
                                    >Месяц</button>

                                    <div className="flex items-center gap-1 ml-3">
                                        <button onClick={() => { const d = new Date(ganttAnchor); if (ganttRange === 'day') d.setDate(d.getDate()-1); if (ganttRange === 'week') d.setDate(d.getDate()-7); if (ganttRange === 'month') d.setMonth(d.getMonth()-1); setGanttAnchor(d); }} className="h-8 w-8 rounded-md border border-slate-200 bg-white">
                                            <ChevronLeft size={14} />
                                        </button>
                                                    <div className="text-sm font-medium text-slate-700 px-2">{periodLabel}</div>
                                        <button onClick={() => { const d = new Date(ganttAnchor); if (ganttRange === 'day') d.setDate(d.getDate()+1); if (ganttRange === 'week') d.setDate(d.getDate()+7); if (ganttRange === 'month') d.setMonth(d.getMonth()+1); setGanttAnchor(d); }} className="h-8 w-8 rounded-md border border-slate-200 bg-white">
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            )}

                        </div>
                        </div>
                    </div>
                </section>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {stats.map((s) => (
                        <div key={s.label} className="border-border bg-card rounded-lg border p-3">
                            <div className="text-muted-foreground text-[11px]">{s.label}</div>
                            <div className={`mt-1 text-2xl font-semibold ${s.color}`}>{s.value}</div>
                        </div>
                    ))}
                </div>

                {message && <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-800">{message}</div>}

                <div className="relative max-w-xl">
                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Поиск по ID, клиенту, технике, адресу"
                        className="border-input bg-background h-10 w-full rounded-md border pr-3 pl-9 text-sm ring-0 transition outline-none focus:border-red-300"
                    />
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
                        <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-14">
                            <TimerReset className="h-10 w-10 opacity-40" />
                            <p className="text-[12.5px]">{searchQuery ? 'Заявки по запросу не найдены.' : 'Заявок пока нет.'}</p>
                        </div>
                    )}

                    {!loading && viewMode === 'gantt' && (
                        <div className="mb-3">
                            <GanttView requests={filteredRequests} range={ganttRange} anchor={ganttAnchor} />
                        </div>
                    )}

                    {!loading && viewMode === 'list' && filteredRequests.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse text-left text-[12.5px]">
                                <thead>
                                    <tr className="border-b border-[#E8E8E8] text-[#6B6B6B]">
                                        <th className="px-3 py-2">ID</th>
                                        <th className="px-3 py-2">Инициатор заказа</th>
                                        <th className="px-3 py-2">Техника</th>
                                        <th className="px-3 py-2">Период</th>
                                        <th className="px-3 py-2">Статус</th>
                                        <th className="px-3 py-2">Действие</th>
                                        <th className="px-3 py-2">Детали</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRequests.map((req) => {
                                        const st = STATUS_STYLES[req.status] || STATUS_STYLES.new;
                                        const next = NEXT_STATUS[req.status];
                                        const isExpanded = expandedId === req.id;
                                        const isFrozen = !!req.status_frozen;
                                        const canFinalizeFrozen =
                                            isFrozen && ['new', 'departure', 'on_location', 'work_started'].includes(req.status);
                                        const isFinalStatus = req.status === 'returned';
                                        const isCancelled = req.status === 'cancelled';
                                        const canEditOrCancel = !['completed', 'returned', 'cancelled'].includes(req.status);
                                        const hasPlanningConflict = (req.conflict_info ?? []).length > 0;

                                        return (
                                            <React.Fragment key={req.id}>
                                                <tr
                                                    className={`border-b border-[#E8E8E8] text-[#2C2C2C] hover:bg-[#FAFAFA] ${updatingId === req.id ? 'opacity-60' : ''}`}
                                                >
                                                    <td className="px-3 py-2">#{req.id}</td>
                                                    <td className="px-3 py-2">{getInitiatorLabel(req)}</td>
                                                    <td className="px-3 py-2">{req.equipment_name}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap">
                                                        {req.requested_start && req.requested_end
                                                            ? `${formatDateTime(req.requested_start)} — ${formatDateTime(req.requested_end)}`
                                                            : `${formatDate(req.start_date)} — ${formatDate(req.end_date)}`}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="flex flex-col gap-1">
                                                            <span
                                                                className="w-fit rounded border px-2 py-1 text-[11px] font-medium"
                                                                style={{ background: st.bg, color: st.text, borderColor: st.border }}
                                                            >
                                                                {req.status_label}
                                                            </span>
                                                            <span className="text-[11px] text-[#6B6B6B]">{getCurrentStage(req)}</span>
                                                            {req.cancellation_reason && (
                                                                <span className="text-[11px] text-red-700">Причина: {req.cancellation_reason}</span>
                                                            )}
                                                            {hasPlanningConflict && (
                                                                <span className="w-fit rounded border border-orange-200 bg-orange-50 px-2 py-1 text-[11px] font-medium text-orange-700">
                                                                    Конфликт планирования
                                                                </span>
                                                            )}
                                                            {isFrozen && (
                                                                <span className="w-fit rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                                                                    Заморожено
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {canFinalizeFrozen ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleStatusChange(req.id, 'returned')}
                                                                disabled={updatingId === req.id}
                                                                className="h-8 rounded-md bg-amber-600 px-3 text-[12px] font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                                                            >
                                                                Завершить как возврат
                                                            </button>
                                                        ) : isCancelled ? (
                                                            <span className="text-xs text-red-700">Отменена</span>
                                                        ) : isFinalStatus ? (
                                                            <span className="text-xs text-[#6B6B6B]">Готово</span>
                                                        ) : isFrozen ? (
                                                            <span className="inline-flex h-8 items-center rounded-md border border-amber-200 bg-amber-50 px-3 text-[12px] font-medium text-amber-700">
                                                                Заморожено
                                                            </span>
                                                        ) : next ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleStatusChange(req.id, next.value)}
                                                                disabled={updatingId === req.id}
                                                                className="h-8 rounded-md bg-[#D32F2F] px-3 text-[12px] font-medium text-white hover:bg-[#C02020] disabled:opacity-60"
                                                            >
                                                                {next.label}
                                                            </button>
                                                        ) : (
                                                            <span className="text-xs text-[#6B6B6B]">Готово</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedId(isExpanded ? null : req.id)}
                                                            className="inline-flex h-8 items-center gap-1 rounded-md border border-[#E0E0E0] bg-white px-3 text-[12px] text-[#1A1A1A] hover:bg-[#FAFAFA]"
                                                        >
                                                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                            Открыть
                                                        </button>
                                                    </td>
                                                </tr>

                                                {isExpanded && (
                                                    <tr className="border-b border-[#E8E8E8] bg-[#FCFCFC]">
                                                        <td className="px-3 py-3" colSpan={7}>
                                                            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                                                                <div>
                                                                    <div className="mb-2 text-xs font-semibold text-[#1A1A1A]">Информация по заявке</div>
                                                                    <div className="grid gap-2 text-xs text-[#2C2C2C] sm:grid-cols-2">
                                                                        <div className="rounded-md border border-[#ECECEC] bg-white px-3 py-2">
                                                                            <div className="text-[11px] text-[#888]">Инициатор</div>
                                                                            <div className="font-medium">{getInitiatorLabel(req)}</div>
                                                                            {req.initiator_phone && <div className="mt-0.5 text-[11px] text-[#666]">{req.initiator_phone}</div>}
                                                                            {req.source_label && <div className="mt-0.5 text-[11px] text-blue-700">{req.source_label}</div>}
                                                                        </div>
                                                                        <div className="rounded-md border border-[#ECECEC] bg-white px-3 py-2">
                                                                            <div className="text-[11px] text-[#888]">Техника</div>
                                                                            <div className="font-medium">{req.equipment_name}</div>
                                                                            {req.plate_number && <div className="mt-0.5 text-[11px] text-[#666]">{req.plate_number}</div>}
                                                                        </div>
                                                                        <div className="rounded-md border border-[#ECECEC] bg-white px-3 py-2">
                                                                            <div className="text-[11px] text-[#888]">Период</div>
                                                                            <div className="font-medium">
                                                                                {req.requested_start && req.requested_end
                                                                                    ? `${formatDateTime(req.requested_start)} — ${formatDateTime(req.requested_end)}`
                                                                                    : `${formatDate(req.start_date)} — ${formatDate(req.end_date)}`}
                                                                            </div>
                                                                        </div>
                                                                        <div className="rounded-md border border-[#ECECEC] bg-white px-3 py-2">
                                                                            <div className="text-[11px] text-[#888]">Водитель</div>
                                                                            <div className="font-medium">{req.driver_name || '—'}</div>
                                                                            {req.driver_phone && <div className="mt-0.5 text-[11px] text-[#666]">{req.driver_phone}</div>}
                                                                        </div>
                                                                        <div className="rounded-md border border-[#ECECEC] bg-white px-3 py-2 sm:col-span-2">
                                                                            <div className="text-[11px] text-[#888]">Локация</div>
                                                                            <div className="font-medium">
                                                                                {req.terminal} / {req.zone}{req.gate ? ` / ${req.gate}` : ''}
                                                                            </div>
                                                                            <div className="mt-0.5 text-[11px] text-[#666]">{req.address || '—'}</div>
                                                                        </div>
                                                                    </div>

                                                                    {req.status === 'cancelled' && (
                                                                        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                                                                            <div className="font-semibold">
                                                                                Заявка отменена{req.cancelled_by ? `: ${req.cancelled_by === 'operator' ? 'оператором' : 'заказчиком'}` : ''}
                                                                            </div>
                                                                            <div className="mt-1">{req.cancellation_reason || 'Причина не указана'}</div>
                                                                        </div>
                                                                    )}

                                                                    {hasPlanningConflict && (
                                                                        <div className="mt-3 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
                                                                            <div className="font-semibold">Техника занята на выбранный период</div>
                                                                            <div className="mt-1">Заявка принята, требуется регулировка диспетчером.</div>
                                                                            <div className="mt-2 space-y-1">
                                                                                {(req.conflict_info ?? []).map((conflict, idx) => (
                                                                                    <div key={`${conflict.truck_name}-${idx}`}>
                                                                                        <span className="font-medium">
                                                                                            {conflict.truck_name}{conflict.plate_number ? ` (${conflict.plate_number})` : ''}
                                                                                        </span>
                                                                                        {conflict.free_at && <span> · свободна с {conflict.free_at}</span>}
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    <div className="mt-4 mb-2 text-xs font-semibold text-[#1A1A1A]">Лента времени</div>
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
                                                                                    <div className="text-[#6B6B6B]">{formatDateTime(step.time)}</div>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <div className="mb-2 text-xs font-semibold text-[#1A1A1A]">
                                                                        Комментарий и фото
                                                                    </div>
                                                                    {req.status_frozen && (
                                                                        <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                                                            {req.status_frozen_reason || 'Время заявки истекло'}
                                                                        </div>
                                                                    )}
                                                                    <p className="mb-2 text-xs text-[#2C2C2C]">{req.comment || 'Без комментария'}</p>
                                                                    <PhotoGallery photos={req.photos ?? []} compact />

                                                                    {canEditOrCancel && (
                                                                        <div className="mt-3 flex gap-2">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => openEditModal(req)}
                                                                                className="h-8 rounded-md border px-3 text-[12px]"
                                                                            >
                                                                                Редактировать
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => openCancelModal(req)}
                                                                                className="h-8 rounded-md bg-red-600 px-3 text-[12px] text-white hover:bg-red-700"
                                                                            >
                                                                                Отменить заявку
                                                                            </button>
                                                                        </div>
                                                                    )}

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
                    )}
                </section>

                <NewRequestModal
                    open={modalOpen}
                    onClose={() => setModalOpen(false)}
                    onSaved={handleSaved}
                    initialRequest={editingRequest}
                    isOperator
                />

                <Dialog open={cancelModalOpen} onOpenChange={(v) => {
                    if (!v) {
                        setCancelModalOpen(false);
                        setCancellingRequest(null);
                        setCancelReason('');
                    }
                }}>
                    <DialogContent className="max-w-md p-0 gap-0">
                        <DialogHeader className="border-b px-5 py-4">
                            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
                                <XCircle className="h-4 w-4 text-red-600" />
                                Отмена заявки
                            </DialogTitle>
                        </DialogHeader>
                        <div className="px-5 py-4 flex flex-col gap-3">
                            <p className="text-xs text-[#666]">Укажите причину отмены. Это поможет улучшить работу сервиса.</p>
                            <textarea
                                value={cancelReason}
                                onChange={(e) => setCancelReason(e.target.value)}
                                rows={3}
                                placeholder="Причина отмены..."
                                className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm focus:border-red-300 focus:ring-2 focus:ring-red-100 outline-none resize-none"
                            />
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" size="sm" onClick={() => {
                                    setCancelModalOpen(false);
                                    setCancellingRequest(null);
                                    setCancelReason('');
                                }} disabled={cancelLoading}>Назад</Button>
                                <Button
                                    size="sm"
                                    className="bg-red-600 hover:bg-red-700 text-white"
                                    onClick={() => {
                                        if (!cancelReason.trim()) return;
                                        void handleCancel(cancelReason.trim());
                                    }}
                                    disabled={cancelLoading || !cancelReason.trim()}
                                >
                                    {cancelLoading ? 'Отмена...' : 'Отменить заявку'}
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </AppLayout>
    );
}
