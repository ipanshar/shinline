import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import { type BreadcrumbItem } from '@/types';
import { Plus, ClipboardList, RefreshCw, ChevronDown, ChevronUp, Search, CalendarClock } from 'lucide-react';
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

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
    new:          { bg: '#F0F0F0', text: '#666666', border: '#CCCCCC' },
    departure:    { bg: '#FFF4E6', text: '#E67E22', border: '#F0D5A8' },
    on_location:  { bg: '#E8F4F8', text: '#0088CC', border: '#B3D9E6' },
    work_started: { bg: '#E8F0FF', text: '#0051B3', border: '#B3D9FF' },
    completed:    { bg: '#E8F5E9', text: '#27AE60', border: '#A8D5BA' },
    returned:     { bg: '#D4EDDA', text: '#1B5E20', border: '#A3D5A8' },
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
            if (res.data?.status && Array.isArray(res.data.data)) {
                setRequests(res.data.data);
            }
        } catch {
            // Ошибка уже логируется общим axios-интерсептором, если он настроен.
        }
        finally { setLoading(false); }
    }, [statusFilter]);

    useEffect(() => { fetchRequests(); }, [fetchRequests]);

    const sorted = useMemo(
        () => [...requests].sort((a, b) => b.id - a.id),
        [requests],
    );

    const filteredRequests = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return sorted;

        return sorted.filter((req) => {
            const haystack = [
                String(req.id),
                req.equipment_name,
                req.address,
                req.comment ?? '',
                req.status_label,
                getCurrentStage(req),
            ].join(' ').toLowerCase();

            return haystack.includes(q);
        });
    }, [searchQuery, sorted]);

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
                            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => setModalOpen(true)}>
                                <Plus className="h-4 w-4 mr-1" />
                                Создать заявку
                            </Button>
                        </div>
                    </div>
                </section>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {stats.map((item) => (
                        <div key={item.label} className="rounded-lg border border-border bg-card p-3">
                            <div className="text-[11px] text-muted-foreground">{item.label}</div>
                            <div className={`mt-1 text-2xl font-semibold ${item.tone}`}>{item.value}</div>
                        </div>
                    ))}
                </div>

                {toast && (
                    <div className="rounded-md border border-[#E8E8E8] bg-[#FFF0F0] px-4 py-2.5 text-[12.5px] text-[#D32F2F]">
                        {toast}
                    </div>
                )}

                <div className="relative max-w-xl">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Поиск по ID, технике, адресу, комментарию"
                        className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none ring-0 transition focus:border-red-300"
                    />
                </div>

                <div className="flex gap-2 flex-wrap">
                    {STATUS_FILTERS.map((f) => (
                        <button
                            key={f.value}
                            onClick={() => setStatusFilter(f.value)}
                            className={`px-3 h-7 rounded-full text-xs font-medium border transition-colors ${
                                statusFilter === f.value
                                    ? 'bg-red-600 border-red-600 text-white'
                                    : 'border-border bg-background hover:bg-muted'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                <section className="rounded-lg border border-[#E8E8E8] bg-white p-[14px]">
                    {loading && <p className="text-[12.5px] text-[#6B6B6B]">Загрузка...</p>}

                    {!loading && filteredRequests.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                            <ClipboardList className="h-12 w-12 opacity-30" />
                            <span>{searchQuery ? 'Ничего не найдено по текущему запросу.' : 'Пока нет заявок. Создайте первую заявку.'}</span>
                        </div>
                    )}

                    {!loading && filteredRequests.length > 0 && (
                        <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse text-left text-[12.5px]">
                                <thead>
                                    <tr className="border-b border-[#E8E8E8] text-[#6B6B6B]">
                                        <th className="px-3 py-2">ID</th>
                                        <th className="px-3 py-2">Техника</th>
                                        <th className="px-3 py-2">Статус</th>
                                        <th className="px-3 py-2">Период</th>
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

                                        return (
                                            <React.Fragment key={req.id}>
                                                <tr className="border-b border-[#E8E8E8] text-[#2C2C2C] hover:bg-[#FAFAFA]">
                                                    <td className="px-3 py-2">#{req.id}</td>
                                                    <td className="px-3 py-2">{req.equipment_name}</td>
                                                    <td className="px-3 py-2">{req.status_label}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap">
                                                        {formatDate(req.start_date)} - {formatDate(req.end_date)}
                                                    </td>
                                                    <td className="px-3 py-2 whitespace-nowrap">
                                                        <span className="inline-flex items-center gap-1 text-[#6B6B6B]">
                                                            <CalendarClock className="h-3.5 w-3.5" />
                                                            {formatDate(req.created_at)}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 max-w-[260px] truncate" title={req.address}>{req.address}</td>
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
                                                            className="inline-flex items-center gap-1 h-8 rounded-md border border-[#E0E0E0] bg-white px-3 text-[12px] text-[#1A1A1A] hover:bg-[#FAFAFA]"
                                                        >
                                                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                                            Детали
                                                        </button>
                                                    </td>
                                                </tr>

                                                {isExpanded && (
                                                    <tr className="border-b border-[#E8E8E8] bg-[#FCFCFC]">
                                                        <td className="px-3 py-3" colSpan={8}>
                                                            <div className="grid gap-4 md:grid-cols-2">
                                                                <div>
                                                                    <div className="text-xs font-semibold mb-2 text-[#1A1A1A]">Лента времени</div>
                                                                    <div className="space-y-1.5">
                                                                        {(req.timeline ?? []).map((step, idx) => (
                                                                            <div key={`${step.title}-${idx}`} className="flex items-start gap-2 text-xs">
                                                                                <span className={`mt-1 h-2 w-2 rounded-full ${step.time ? 'bg-red-600' : 'bg-gray-300'}`} />
                                                                                <div>
                                                                                    <div className="text-[#1A1A1A]">{step.title}</div>
                                                                                    <div className="text-[#6B6B6B]">{formatDateTime(step.time)}</div>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <div className="text-xs font-semibold mb-2 text-[#1A1A1A]">Комментарий и фото</div>
                                                                    <p className="text-xs text-[#2C2C2C] mb-2">{req.comment || 'Без комментария'}</p>
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

                {/* Модал создания */}
                <NewRequestModal
                    open={modalOpen}
                    onClose={() => setModalOpen(false)}
                    onCreated={handleCreated}
                />
            </div>
        </AppLayout>
    );
}

