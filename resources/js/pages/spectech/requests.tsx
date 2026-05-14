import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import { type BreadcrumbItem } from '@/types';
import {
    Plus, ClipboardList, RefreshCw, ChevronDown, ChevronUp,
    Search, Truck, MapPin, Calendar, CheckCircle2, Clock, LayoutGrid, List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type SpectechRequestData } from '@/components/spectech/RequestCard';
import PhotoGallery from '@/components/spectech/PhotoGallery';
import NewRequestModal from '@/components/spectech/NewRequestModal';

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

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    new:          { bg: '#F5F5F5', text: '#555555', border: '#DDDDDD', dot: '#999' },
    departure:    { bg: '#FFF4E6', text: '#B45309', border: '#FDE68A', dot: '#F59E0B' },
    on_location:  { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', dot: '#3B82F6' },
    work_started: { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE', dot: '#7C3AED' },
    completed:    { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0', dot: '#22C55E' },
    returned:     { bg: '#F0FDF4', text: '#166534', border: '#86EFAC', dot: '#16A34A' },
};

function formatDate(v?: string | null): string {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(v?: string | null): string {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getCurrentStage(request: SpectechRequestData): string {
    const done = (request.timeline ?? []).filter(s => s.time);
    return done.length > 0 ? done[done.length - 1].title : 'Заявка создана';
}

// ─── Gantt ─────────────────────────────────────────────────────────────────────

const GANTT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    new:          { bg: '#F5F5F5', text: '#555555', border: '#DDDDDD' },
    departure:    { bg: '#FFF4E6', text: '#B45309', border: '#FDE68A' },
    on_location:  { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' },
    work_started: { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE' },
    completed:    { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
    returned:     { bg: '#F0FDF4', text: '#166534', border: '#86EFAC' },
};

const GanttView: React.FC<{ requests: SpectechRequestData[] }> = ({ requests }) => {
    const active = useMemo(
        () => requests.filter(r => r.requested_start && r.requested_end),
        [requests],
    );

    if (active.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-[#AAA]">
                <Calendar className="h-12 w-12 opacity-30" />
                <p className="text-sm">Нет заявок с указанным периодом</p>
            </div>
        );
    }

    const starts = active.map(r => new Date(r.requested_start!).getTime());
    const ends   = active.map(r => new Date(r.requested_end!).getTime());
    const rangeStart = Math.min(...starts);
    const rangeEnd   = Math.max(...ends);
    const total      = rangeEnd - rangeStart || 1;

    const getLeft  = (iso: string) => ((new Date(iso).getTime() - rangeStart) / total) * 100;
    const getWidth = (s: string, e: string) => Math.max(((new Date(e).getTime() - new Date(s).getTime()) / total) * 100, 2);

    const grouped = new Map<string, SpectechRequestData[]>();
    for (const r of active) {
        const key = r.equipment_name;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(r);
    }

    return (
        <div className="overflow-x-auto rounded-xl border border-[#E8E8E8] bg-white p-4">
            <div className="min-w-[600px]">
                <div className="relative h-6 mb-2 ml-36 border-b border-[#E8E8E8]">
                    {[0, 25, 50, 75, 100].map(pct => {
                        const t = new Date(rangeStart + (total * pct) / 100);
                        return (
                            <span key={pct} className="absolute -translate-x-1/2 text-[10px] text-[#AAA]" style={{ left: `${pct}%` }}>
                                {t.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                            </span>
                        );
                    })}
                </div>
                {Array.from(grouped.entries()).map(([name, items]) => (
                    <div key={name} className="flex items-center mb-2 gap-2">
                        <div className="w-36 flex-shrink-0 text-[11px] text-right text-[#666] truncate pr-2">{name}</div>
                        <div className="flex-1 relative h-8 bg-[#F9F9F9] rounded border border-[#EBEBEB] overflow-hidden">
                            {items.map(r => {
                                const col   = GANTT_COLORS[r.status] ?? GANTT_COLORS.new;
                                const left  = getLeft(r.requested_start!);
                                const width = getWidth(r.requested_start!, r.requested_end!);
                                return (
                                    <div
                                        key={r.id}
                                        title={`#${r.id} ${r.status_label}\n${formatDateTime(r.requested_start)} – ${formatDateTime(r.requested_end)}\n${r.address ?? ''}`}
                                        className="absolute top-0.5 bottom-0.5 rounded text-[10px] flex items-center px-1.5 overflow-hidden cursor-default"
                                        style={{ left: `${left}%`, width: `${width}%`, background: col.bg, color: col.text, borderLeft: `2px solid ${col.border}` }}
                                    >
                                        <span className="truncate">#{r.id} {r.status_label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── Карточка заявки ──────────────────────────────────────────────────────────

const RequestItem: React.FC<{
    req: SpectechRequestData;
    expanded: boolean;
    onToggle: () => void;
}> = ({ req, expanded, onToggle }) => {
    const st = STATUS_STYLES[req.status] ?? STATUS_STYLES.new;
    const timeline = req.timeline ?? [];
    const doneCount = timeline.filter(s => s.time).length;
    const progressPct = timeline.length > 0 ? Math.round((doneCount / timeline.length) * 100) : 0;

    const period = req.requested_start && req.requested_end
        ? `${formatDateTime(req.requested_start)} — ${formatDateTime(req.requested_end)}`
        : `${formatDate(req.start_date)} — ${formatDate(req.end_date)}`;

    return (
        <div className="rounded-xl border border-[#E8E8E8] bg-white shadow-sm hover:shadow-md transition-shadow">
            {/* ── Шапка карточки ── */}
            <div className="flex items-start gap-3 p-4">
                {/* Иконка статуса */}
                <div
                    className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ background: st.bg, border: `1px solid ${st.border}` }}
                >
                    <Truck className="h-4 w-4" style={{ color: st.dot }} />
                </div>

                {/* Основная инфо */}
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-[13px] font-semibold text-[#1A1A1A] truncate">{req.equipment_name}</span>
                        {req.plate_number && (
                            <span className="text-[11px] text-[#888] border border-[#E0E0E0] rounded px-1.5 py-0.5 flex-shrink-0">
                                {req.plate_number}
                            </span>
                        )}
                        <span className="flex-shrink-0 ml-auto">
                            <span
                                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                                style={{ background: st.bg, color: st.text, borderColor: st.border }}
                            >
                                <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: st.dot }} />
                                {req.status_label}
                            </span>
                        </span>
                    </div>

                    {/* Мета-инфо */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[#6B6B6B]">
                        <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 flex-shrink-0" />
                            {period}
                        </span>
                        {req.address && (
                            <span className="flex items-center gap-1 truncate max-w-[260px]">
                                <MapPin className="h-3 w-3 flex-shrink-0" />
                                {req.address}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Прогресс и ID ── */}
            <div className="px-4 pb-3 flex items-center gap-3">
                <span className="text-[11px] text-[#AAA] flex-shrink-0">#{req.id}</span>
                <div className="flex-1 relative h-1.5 rounded-full bg-[#F0F0F0] overflow-hidden">
                    <div
                        className="absolute left-0 top-0 h-full rounded-full transition-all"
                        style={{ width: `${progressPct}%`, background: st.dot }}
                    />
                </div>
                <span className="text-[11px] text-[#888] flex-shrink-0">{getCurrentStage(req)}</span>
                <button
                    type="button"
                    onClick={onToggle}
                    className="flex-shrink-0 flex items-center gap-1 text-[11px] text-[#666] hover:text-[#1A1A1A] border border-[#E8E8E8] rounded-md px-2 py-1 hover:bg-[#FAFAFA]"
                >
                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    Детали
                </button>
            </div>

            {/* ── Раскрытые детали ── */}
            {expanded && (
                <div className="border-t border-[#F0F0F0] bg-[#FAFAFA] px-4 py-4 rounded-b-xl">
                    <div className="grid gap-6 sm:grid-cols-2">
                        {/* Лента */}
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#999] mb-2">Этапы выполнения</p>
                            <div className="space-y-2">
                                {timeline.map((step, i) => (
                                    <div key={i} className="flex items-start gap-2.5">
                                        <div className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
                                            step.time
                                                ? 'border-green-300 bg-green-50'
                                                : 'border-[#E0E0E0] bg-white'
                                        }`}>
                                            {step.time
                                                ? <CheckCircle2 className="h-3 w-3 text-green-600" />
                                                : <Clock className="h-3 w-3 text-[#CCC]" />}
                                        </div>
                                        <div>
                                            <div className={`text-[12px] ${step.time ? 'text-[#1A1A1A] font-medium' : 'text-[#999]'}`}>
                                                {step.title}
                                            </div>
                                            {step.time && (
                                                <div className="text-[11px] text-[#6B6B6B]">{formatDateTime(step.time)}</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Комментарий + фото */}
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#999] mb-2">Комментарий</p>
                            <p className="text-[12.5px] text-[#444] mb-3">{req.comment || '—'}</p>
                            <p className="text-[12px] text-[#444] mb-2">
                                Водитель: {req.driver_name || '—'}{req.driver_phone ? ` · ${req.driver_phone}` : ''}
                            </p>
                            {req.source_label && (
                                <div className="mb-3">
                                    <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                                        {req.source_label}
                                    </span>
                                </div>
                            )}
                            {(req.photos ?? []).length > 0 && (
                                <>
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#999] mb-2">Фото</p>
                                    <PhotoGallery photos={req.photos ?? []} compact />
                                </>
                            )}
                            <div className="mt-3 text-[11px] text-[#999]">
                                Создана: {formatDate(req.created_at)}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Страница ─────────────────────────────────────────────────────────────────

export default function SpectechRequests() {
    const [requests, setRequests] = useState<SpectechRequestData[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [telegramOnly, setTelegramOnly] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [toast, setToast] = useState('');
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'gantt'>('list');

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        try {
            const params = statusFilter ? { status: statusFilter } : {};
            const res = await axios.get('/spectech/api/requests', { params });
            const data = res.data?.data ?? res.data;
            if (Array.isArray(data)) {
                setRequests(data);
            }
        } catch { /* handled */ }
        finally { setLoading(false); }
    }, [statusFilter]);

    useEffect(() => { fetchRequests(); }, [fetchRequests]);

    const sorted = useMemo(() => [...requests].sort((a, b) => b.id - a.id), [requests]);

    const visible = useMemo(() => {
        const base = telegramOnly ? sorted.filter((req) => req.is_telegram_miniapp) : sorted;
        const q = searchQuery.trim().toLowerCase();
        if (!q) return base;
        return base.filter(req =>
            [String(req.id), req.equipment_name, req.address, req.comment ?? '', req.status_label, req.driver_name ?? '', req.source_label ?? '']
                .join(' ').toLowerCase().includes(q)
        );
    }, [searchQuery, sorted, telegramOnly]);

    const stats = useMemo(() => {
        const active    = requests.filter(r => !['completed', 'returned'].includes(r.status)).length;
        const completed = requests.filter(r => r.status === 'completed').length;
        return [
            { label: 'Всего заявок', value: requests.length, color: 'text-[#1A1A1A]', bg: 'bg-white' },
            { label: 'В работе',     value: active,          color: 'text-red-600',    bg: 'bg-red-50' },
            { label: 'Выполнено',    value: completed,       color: 'text-green-700',  bg: 'bg-green-50' },
        ];
    }, [requests]);

    const showToast = (msg: string) => {
        setToast(msg);
        window.setTimeout(() => setToast(''), 2500);
    };

    const handleCreated = async (newRequest?: any) => {
        if (newRequest) {
            setRequests(prev => [newRequest, ...prev]);
        }
        showToast('Заявка успешно создана');
        fetchRequests();
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Мои заявки" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">

                {/* ── Хедер ── */}
                <section className="rounded-xl border border-[#E8E8E8] bg-gradient-to-r from-white to-[#FFF8F8] px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <ClipboardList className="h-5 w-5 text-red-600" />
                                <h1 className="text-[14px] font-semibold text-[#1A1A1A]">Заявки на спецтехнику</h1>
                            </div>
                            <p className="text-[12px] text-[#6B6B6B]">Следите за статусами, ищите по любому полю.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={fetchRequests} disabled={loading}>
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                            {/* Переключатель вид */}
                            <div className="flex rounded-md border border-[#E0E0E0] overflow-hidden">
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`h-8 px-2.5 flex items-center gap-1 text-xs transition-colors ${viewMode === 'list' ? 'bg-red-600 text-white' : 'bg-white text-[#555] hover:bg-[#F5F5F5]'}`}
                                >
                                    <List className="h-3.5 w-3.5" /> Список
                                </button>
                                <button
                                    onClick={() => setViewMode('gantt')}
                                    className={`h-8 px-2.5 flex items-center gap-1 text-xs border-l border-[#E0E0E0] transition-colors ${viewMode === 'gantt' ? 'bg-red-600 text-white' : 'bg-white text-[#555] hover:bg-[#F5F5F5]'}`}
                                >
                                    <LayoutGrid className="h-3.5 w-3.5" /> Gantt
                                </button>
                            </div>
                            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => setModalOpen(true)}>
                                <Plus className="h-4 w-4 mr-1" />
                                Новая заявка
                            </Button>
                        </div>
                    </div>
                </section>

                {/* ── Статистика ── */}
                <div className="grid grid-cols-3 gap-3">
                    {stats.map(s => (
                        <div key={s.label} className={`rounded-xl border border-[#E8E8E8] ${s.bg} p-3`}>
                            <div className="text-[11px] text-[#888] mb-1">{s.label}</div>
                            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                        </div>
                    ))}
                </div>

                {/* ── Toast ── */}
                {toast && (
                    <div className="fixed bottom-4 right-4 z-50 rounded-md border border-[#E8E8E8] bg-white shadow-lg px-4 py-2.5 text-[13px] text-[#1A1A1A]">
                        {toast}
                    </div>
                )}

                {/* ── Поиск и фильтры (только в режиме списка) ── */}
                {viewMode === 'list' && (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Поиск по ID, технике, адресу…"
                                className="h-9 w-full rounded-lg border border-[#E0E0E0] bg-white pl-9 pr-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                            />
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            <button
                                type="button"
                                onClick={() => setTelegramOnly((current) => !current)}
                                className={`px-3 h-7 rounded-full text-xs font-medium border transition-colors ${
                                    telegramOnly
                                        ? 'bg-blue-600 border-blue-600 text-white'
                                        : 'border-[#E0E0E0] bg-white text-[#555] hover:bg-[#F5F5F5]'
                                }`}
                            >
                                Telegram Mini App
                            </button>
                            {STATUS_FILTERS.map(f => (
                                <button
                                    key={f.value}
                                    onClick={() => setStatusFilter(f.value)}
                                    className={`px-3 h-7 rounded-full text-xs font-medium border transition-colors ${
                                        statusFilter === f.value
                                            ? 'bg-red-600 border-red-600 text-white'
                                            : 'border-[#E0E0E0] bg-white text-[#555] hover:bg-[#F5F5F5]'
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Контент ── */}
                {loading && (
                    <div className="flex items-center justify-center py-16 text-sm text-[#888]">
                        <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Загрузка...
                    </div>
                )}

                {!loading && viewMode === 'gantt' && (
                    <GanttView requests={requests} />
                )}

                {!loading && viewMode === 'list' && visible.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-[#AAA]">
                        <ClipboardList className="h-12 w-12 opacity-30" />
                        <p className="text-sm">
                            {searchQuery ? 'Ничего не найдено.' : 'Заявок пока нет. Создайте первую!'}
                        </p>
                    </div>
                )}

                {!loading && viewMode === 'list' && visible.length > 0 && (
                    <div className="flex flex-col gap-3">
                        {visible.map(req => (
                            <RequestItem
                                key={req.id}
                                req={req}
                                expanded={expandedId === req.id}
                                onToggle={() => setExpandedId(expandedId === req.id ? null : req.id)}
                            />
                        ))}
                    </div>
                )}

                {/* ── Модал ── */}
                <NewRequestModal
                    open={modalOpen}
                    onClose={() => setModalOpen(false)}
                    onCreated={handleCreated}
                />
            </div>
        </AppLayout>
    );
}

