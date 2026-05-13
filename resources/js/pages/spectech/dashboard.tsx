import PhotoGallery from '@/components/spectech/PhotoGallery';
import { type SpectechRequestData } from '@/components/spectech/RequestCard';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import { ChevronDown, ChevronUp, LayoutDashboard, RefreshCw, Search, TimerReset } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

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
];

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
    new: { bg: '#F0F0F0', text: '#666666', border: '#CCCCCC' },
    departure: { bg: '#FFF4E6', text: '#E67E22', border: '#F0D5A8' },
    on_location: { bg: '#E8F4F8', text: '#0088CC', border: '#B3D9E6' },
    work_started: { bg: '#E8F0FF', text: '#0051B3', border: '#B3D9FF' },
    completed: { bg: '#E8F5E9', text: '#27AE60', border: '#A8D5BA' },
    returned: { bg: '#D4EDDA', text: '#1B5E20', border: '#A3D5A8' },
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

export default function SpectechDashboard() {
    const [requests, setRequests] = useState<SpectechRequestData[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [updatingId, setUpdatingId] = useState<number | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [message, setMessage] = useState('');

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

    const stats = [
        { label: 'Всего', value: requests.length, color: 'text-foreground' },
        {
            label: 'Активных',
            value: requests.filter((r) => !['completed', 'returned'].includes(r.status)).length,
            color: 'text-red-600',
        },
        { label: 'Выполнено', value: requests.filter((r) => r.status === 'completed').length, color: 'text-green-700' },
        { label: 'Возвращено', value: requests.filter((r) => r.status === 'returned').length, color: 'text-gray-500' },
    ];

    const sorted = useMemo(() => [...requests].sort((a, b) => b.id - a.id), [requests]);

    const filteredRequests = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return sorted;

        return sorted.filter((req) => {
            const haystack = [String(req.id), req.client_name ?? '', req.equipment_name, req.address, req.status_label, getCurrentStage(req)]
                .join(' ')
                .toLowerCase();

            return haystack.includes(q);
        });
    }, [searchQuery, sorted]);

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

                    {!loading && filteredRequests.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse text-left text-[12.5px]">
                                <thead>
                                    <tr className="border-b border-[#E8E8E8] text-[#6B6B6B]">
                                        <th className="px-3 py-2">ID</th>
                                        <th className="px-3 py-2">Клиент</th>
                                        <th className="px-3 py-2">Техника</th>
                                        <th className="px-3 py-2">Период</th>
                                        <th className="px-3 py-2">Этап</th>
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

                                        return (
                                            <React.Fragment key={req.id}>
                                                <tr
                                                    className={`border-b border-[#E8E8E8] text-[#2C2C2C] hover:bg-[#FAFAFA] ${updatingId === req.id ? 'opacity-60' : ''}`}
                                                >
                                                    <td className="px-3 py-2">#{req.id}</td>
                                                    <td className="px-3 py-2">{req.client_name || '—'}</td>
                                                    <td className="px-3 py-2">{req.equipment_name}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap">
                                                        {req.requested_start && req.requested_end
                                                            ? `${formatDateTime(req.requested_start)} — ${formatDateTime(req.requested_end)}`
                                                            : `${formatDate(req.start_date)} — ${formatDate(req.end_date)}`}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                            <span
                                                                className="rounded border px-2 py-1 text-[11px] font-medium"
                                                                style={{ background: st.bg, color: st.text, borderColor: st.border }}
                                                            >
                                                                {getCurrentStage(req)}
                                                            </span>
                                                            {isFrozen && (
                                                                <span className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
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
                                                            Лента
                                                        </button>
                                                    </td>
                                                </tr>

                                                {isExpanded && (
                                                    <tr className="border-b border-[#E8E8E8] bg-[#FCFCFC]">
                                                        <td className="px-3 py-3" colSpan={7}>
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
            </div>
        </AppLayout>
    );
}
