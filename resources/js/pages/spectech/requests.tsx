import NewRequestModal from '@/components/spectech/NewRequestModal';
import PhotoGallery from '@/components/spectech/PhotoGallery';
import { type SpectechRequestData } from '@/components/spectech/RequestCard';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import { Calendar, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, Clock, Link2, MapPin, Plus, RefreshCw, Search, Truck } from 'lucide-react';
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

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    new: { bg: '#F5F5F5', text: '#555555', border: '#DDDDDD', dot: '#999' },
    departure: { bg: '#FFF4E6', text: '#B45309', border: '#FDE68A', dot: '#F59E0B' },
    on_location: { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', dot: '#3B82F6' },
    work_started: { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE', dot: '#7C3AED' },
    completed: { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0', dot: '#22C55E' },
    returned: { bg: '#F0FDF4', text: '#166534', border: '#86EFAC', dot: '#16A34A' },
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
    const done = (request.timeline ?? []).filter((s) => s.time);
    return done.length > 0 ? done[done.length - 1].title : 'Заявка создана';
}

// ─── Карточка заявки ──────────────────────────────────────────────────────────

const RequestItem: React.FC<{
    req: SpectechRequestData;
    expanded: boolean;
    onToggle: () => void;
}> = ({ req, expanded, onToggle }) => {
    const st = STATUS_STYLES[req.status] ?? STATUS_STYLES.new;
    const timeline = req.timeline ?? [];
    const doneCount = timeline.filter((s) => s.time).length;
    const progressPct = timeline.length > 0 ? Math.round((doneCount / timeline.length) * 100) : 0;
    const isFrozen = !!req.status_frozen;

    const period =
        req.requested_start && req.requested_end
            ? `${formatDateTime(req.requested_start)} — ${formatDateTime(req.requested_end)}`
            : `${formatDate(req.start_date)} — ${formatDate(req.end_date)}`;

    return (
        <div className="rounded-xl border border-[#E8E8E8] bg-white shadow-sm transition-shadow hover:shadow-md">
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
                <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="truncate text-[13px] font-semibold text-[#1A1A1A]">{req.equipment_name}</span>
                        {req.plate_number && (
                            <span className="flex-shrink-0 rounded border border-[#E0E0E0] px-1.5 py-0.5 text-[11px] text-[#888]">
                                {req.plate_number}
                            </span>
                        )}
                        <span className="ml-auto flex-shrink-0">
                            <span className="flex flex-wrap justify-end gap-1">
                                <span
                                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                                    style={{ background: st.bg, color: st.text, borderColor: st.border }}
                                >
                                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: st.dot }} />
                                    {req.status_label}
                                </span>
                                {isFrozen && (
                                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                                        Заморожено
                                    </span>
                                )}
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
                            <span className="flex max-w-[260px] items-center gap-1 truncate">
                                <MapPin className="h-3 w-3 flex-shrink-0" />
                                {req.address}
                            </span>
                        )}
                        {req.schedule_id && (
                            <span className="flex items-center gap-1">
                                <Link2 className="h-3 w-3 flex-shrink-0 text-blue-500" />
                                <span className="text-blue-600">Планирование #{req.schedule_id}</span>
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Прогресс и ID ── */}
            <div className="flex items-center gap-3 px-4 pb-3">
                <span className="flex-shrink-0 text-[11px] text-[#AAA]">#{req.id}</span>
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[#F0F0F0]">
                    <div
                        className="absolute top-0 left-0 h-full rounded-full transition-all"
                        style={{ width: `${progressPct}%`, background: st.dot }}
                    />
                </div>
                <span className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1 text-[11px] text-[#888]">
                    <span>{getCurrentStage(req)}</span>
                    {isFrozen && <span className="text-amber-700">• Заморожено</span>}
                </span>
                <button
                    type="button"
                    onClick={onToggle}
                    className="flex flex-shrink-0 items-center gap-1 rounded-md border border-[#E8E8E8] px-2 py-1 text-[11px] text-[#666] hover:bg-[#FAFAFA] hover:text-[#1A1A1A]"
                >
                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    Детали
                </button>
            </div>

            {/* ── Раскрытые детали ── */}
            {expanded && (
                <div className="rounded-b-xl border-t border-[#F0F0F0] bg-[#FAFAFA] px-4 py-4">
                    <div className="grid gap-6 sm:grid-cols-2">
                        {/* Лента */}
                        <div>
                            <p className="mb-2 text-[11px] font-semibold tracking-wide text-[#999] uppercase">Этапы выполнения</p>
                            <div className="space-y-2">
                                {timeline.map((step, i) => (
                                    <div key={i} className="flex items-start gap-2.5">
                                        <div
                                            className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
                                                step.time ? 'border-green-300 bg-green-50' : 'border-[#E0E0E0] bg-white'
                                            }`}
                                        >
                                            {step.time ? (
                                                <CheckCircle2 className="h-3 w-3 text-green-600" />
                                            ) : (
                                                <Clock className="h-3 w-3 text-[#CCC]" />
                                            )}
                                        </div>
                                        <div>
                                            <div className={`text-[12px] ${step.time ? 'font-medium text-[#1A1A1A]' : 'text-[#999]'}`}>
                                                {step.title}
                                            </div>
                                            {step.time && <div className="text-[11px] text-[#6B6B6B]">{formatDateTime(step.time)}</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Комментарий + фото */}
                        <div>
                            <p className="mb-2 text-[11px] font-semibold tracking-wide text-[#999] uppercase">Комментарий</p>
                            {isFrozen && (
                                <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                                    {req.status_frozen_reason || 'Время заявки истекло'}
                                </div>
                            )}
                            <p className="mb-3 text-[12.5px] text-[#444]">{req.comment || '—'}</p>
                            {(req.photos ?? []).length > 0 && (
                                <>
                                    <p className="mb-2 text-[11px] font-semibold tracking-wide text-[#999] uppercase">Фото</p>
                                    <PhotoGallery photos={req.photos ?? []} compact />
                                </>
                            )}
                            <div className="mt-3 text-[11px] text-[#999]">Создана: {formatDate(req.created_at)}</div>
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
    const [modalOpen, setModalOpen] = useState(false);
    const [toast, setToast] = useState('');
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        try {
            const params = statusFilter ? { status: statusFilter } : {};
            const res = await axios.get('/spectech/api/requests', { params });
            const data = res.data?.data ?? res.data;
            if (Array.isArray(data)) {
                setRequests(data);
            }
        } catch {
            /* handled */
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);

    const sorted = useMemo(() => [...requests].sort((a, b) => b.id - a.id), [requests]);

    const visible = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return sorted;
        return sorted.filter((req) =>
            [String(req.id), req.equipment_name, req.address, req.comment ?? '', req.status_label].join(' ').toLowerCase().includes(q),
        );
    }, [searchQuery, sorted]);

    const stats = useMemo(() => {
        const active = requests.filter((r) => !['completed', 'returned'].includes(r.status)).length;
        const completed = requests.filter((r) => r.status === 'completed').length;
        const linked = requests.filter((r) => r.schedule_id).length;
        return [
            { label: 'Всего заявок', value: requests.length, color: 'text-[#1A1A1A]', bg: 'bg-white' },
            { label: 'В работе', value: active, color: 'text-red-600', bg: 'bg-red-50' },
            { label: 'Из планирования', value: linked, color: 'text-blue-700', bg: 'bg-blue-50' },
            { label: 'Выполнено', value: completed, color: 'text-green-700', bg: 'bg-green-50' },
        ];
    }, [requests]);

    const showToast = (msg: string) => {
        setToast(msg);
        window.setTimeout(() => setToast(''), 2500);
    };

    const handleCreated = async (newRequest?: any) => {
        // Сразу добавляем в список (оптимистичное обновление)
        if (newRequest) {
            setRequests((prev) => [newRequest, ...prev]);
        }
        showToast('Заявка успешно создана');
        // Фоновое обновление для синхронизации с сервером
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
                            <div className="mb-0.5 flex items-center gap-2">
                                <ClipboardList className="h-5 w-5 text-red-600" />
                                <h1 className="text-[14px] font-semibold text-[#1A1A1A]">Заявки на спецтехнику</h1>
                            </div>
                            <p className="text-[12px] text-[#6B6B6B]">Следите за статусами, ищите по любому полю.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={fetchRequests} disabled={loading}>
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button size="sm" className="bg-red-600 text-white hover:bg-red-700" onClick={() => setModalOpen(true)}>
                                <Plus className="mr-1 h-4 w-4" />
                                Новая заявка
                            </Button>
                        </div>
                    </div>
                </section>

                {/* ── Статистика ── */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {stats.map((s) => (
                        <div key={s.label} className={`rounded-xl border border-[#E8E8E8] ${s.bg} p-3`}>
                            <div className="mb-1 text-[11px] text-[#888]">{s.label}</div>
                            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                        </div>
                    ))}
                </div>

                {/* ── Toast ── */}
                {toast && (
                    <div className="fixed right-4 bottom-4 z-50 rounded-md border border-[#E8E8E8] bg-white px-4 py-2.5 text-[13px] text-[#1A1A1A] shadow-lg">
                        {toast}
                    </div>
                )}

                {/* ── Поиск и фильтры ── */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative max-w-sm flex-1">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Поиск по ID, технике, адресу…"
                            className="h-9 w-full rounded-lg border border-[#E0E0E0] bg-white pr-3 pl-9 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                        />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {STATUS_FILTERS.map((f) => (
                            <button
                                key={f.value}
                                onClick={() => setStatusFilter(f.value)}
                                className={`h-7 rounded-full border px-3 text-xs font-medium transition-colors ${
                                    statusFilter === f.value
                                        ? 'border-red-600 bg-red-600 text-white'
                                        : 'border-[#E0E0E0] bg-white text-[#555] hover:bg-[#F5F5F5]'
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Список ── */}
                {loading && (
                    <div className="flex items-center justify-center py-16 text-sm text-[#888]">
                        <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Загрузка...
                    </div>
                )}

                {!loading && visible.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-3 py-20 text-[#AAA]">
                        <ClipboardList className="h-12 w-12 opacity-30" />
                        <p className="text-sm">{searchQuery ? 'Ничего не найдено.' : 'Заявок пока нет. Создайте первую!'}</p>
                    </div>
                )}

                {!loading && visible.length > 0 && (
                    <div className="flex flex-col gap-3">
                        {visible.map((req) => (
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
                <NewRequestModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
            </div>
        </AppLayout>
    );
}
