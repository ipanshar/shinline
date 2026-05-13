import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import { type BreadcrumbItem } from '@/types';
import { Button } from '@/components/ui/button';
import PhotoGallery from '@/components/spectech/PhotoGallery';

interface UtilizationRequestItem {
    id: number;
    equipment_name: string;
    plate_number?: string | null;
    driver_name: string;
    requested_start: string;
    requested_end: string;
    terminal: string;
    zone: string;
    gate?: string | null;
    address: string;
    comment?: string | null;
    status: string;
    status_label: string;
    photos: string[];
    timeline: { title: string; time: string | null }[];
    source: string;
    client_name?: string | null;
    created_at?: string | null;
}

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Утилизация', href: '/utilization/requests' },
    { title: 'Экстренные выезды', href: '/utilization/requests' },
];

const STATUS_FILTERS = [
    { value: '', label: 'Все' },
    { value: 'new', label: 'Новые' },
    { value: 'reviewing', label: 'На рассмотрении' },
    { value: 'approved', label: 'Одобрены' },
    { value: 'in_progress', label: 'В работе' },
    { value: 'completed', label: 'Выполнены' },
    { value: 'rejected', label: 'Отклонены' },
];

const NEXT_STATUS: Record<string, { value: string; label: string } | null> = {
    new: { value: 'reviewing', label: 'Взять в рассмотрение' },
    reviewing: { value: 'approved', label: 'Одобрить' },
    approved: { value: 'in_progress', label: 'В работу' },
    in_progress: { value: 'completed', label: 'Завершить' },
    completed: null,
    rejected: null,
};

const formatDateTime = (value?: string | null): string => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export default function UtilizationRequestsPage() {
    const [items, setItems] = useState<UtilizationRequestItem[]>([]);
    const [statusFilter, setStatusFilter] = useState('');
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const params = statusFilter ? { status: statusFilter } : {};
            const response = await axios.get('/utilization/api/requests', { params });
            const data = response.data?.data ?? [];
            setItems(Array.isArray(data) ? data : []);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        void fetchItems();
    }, [fetchItems]);

    const sortedItems = useMemo(() => [...items].sort((a, b) => b.id - a.id), [items]);

    const changeStatus = useCallback(async (item: UtilizationRequestItem) => {
        const next = NEXT_STATUS[item.status];
        if (!next) {
            return;
        }

        setBusyId(item.id);
        try {
            const response = await axios.patch(`/utilization/api/requests/${item.id}/status`, {
                status: next.value,
            });
            const updated = response.data?.data;
            if (updated) {
                setItems((current) => current.map((row) => (row.id === item.id ? updated : row)));
            }
        } finally {
            setBusyId(null);
        }
    }, []);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Экстренные перемещения" />

            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <section className="rounded-xl border border-[#E8E8E8] bg-white px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h1 className="text-[15px] font-semibold text-[#1A1A1A]">Экстренные выезды</h1>
                            <p className="text-[12px] text-[#6B6B6B]">Отдельный модуль заявок из Telegram Mini App, видит только охрана.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={fetchItems} disabled={loading}>Обновить</Button>
                        </div>
                    </div>
                </section>

                <div className="flex flex-wrap gap-2">
                    {STATUS_FILTERS.map((filter) => (
                        <button
                            key={filter.value}
                            type="button"
                            onClick={() => setStatusFilter(filter.value)}
                            className={`px-3 h-8 rounded-full text-xs font-medium border transition-colors ${
                                statusFilter === filter.value
                                    ? 'bg-red-600 border-red-600 text-white'
                                    : 'border-[#E0E0E0] bg-white text-[#555] hover:bg-[#F5F5F5]'
                            }`}
                        >
                            {filter.label}
                        </button>
                    ))}
                </div>

                {loading && <div className="py-10 text-sm text-[#777]">Загрузка…</div>}

                {!loading && sortedItems.length === 0 && (
                    <div className="rounded-xl border border-[#E8E8E8] bg-white px-4 py-6 text-sm text-[#777]">
                        Заявок пока нет.
                    </div>
                )}

                {!loading && sortedItems.length > 0 && (
                    <div className="flex flex-col gap-3">
                        {sortedItems.map((item) => {
                            const next = NEXT_STATUS[item.status];
                            const expanded = expandedId === item.id;

                            return (
                                <div key={item.id} className="rounded-xl border border-[#E8E8E8] bg-white p-4">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <div className="text-sm font-semibold text-[#1A1A1A]">#{item.id} {item.equipment_name}</div>
                                            <div className="text-xs text-[#666]">Водитель: {item.driver_name}</div>
                                            <div className="text-xs text-[#666]">Период: {formatDateTime(item.requested_start)} — {formatDateTime(item.requested_end)}</div>
                                            <div className="text-xs text-[#666]">Локация: {item.terminal} / {item.zone}{item.gate ? ` / ${item.gate}` : ''}</div>
                                            <div className="text-xs text-[#666]">Адрес: {item.address}</div>
                                        </div>
                                        <div className="flex flex-col items-start gap-2 sm:items-end">
                                            <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                                                {item.status_label}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setExpandedId(expanded ? null : item.id)}
                                                className="text-xs text-[#666] underline"
                                            >
                                                {expanded ? 'Скрыть детали' : 'Показать детали'}
                                            </button>
                                        </div>
                                    </div>

                                    {expanded && (
                                        <div className="mt-3 border-t border-[#F0F0F0] pt-3">
                                            {item.comment && <p className="mb-2 text-xs text-[#555]">Комментарий: {item.comment}</p>}
                                            <p className="mb-2 text-xs text-[#888]">Источник: {item.source}</p>
                                            <p className="mb-2 text-xs text-[#888]">Создана: {formatDateTime(item.created_at)}</p>
                                            <PhotoGallery photos={item.photos ?? []} compact />
                                        </div>
                                    )}

                                    {next && (
                                        <div className="mt-3">
                                            <Button
                                                size="sm"
                                                className="bg-red-600 text-white hover:bg-red-700"
                                                disabled={busyId === item.id}
                                                onClick={() => void changeStatus(item)}
                                            >
                                                {busyId === item.id ? 'Обновление…' : next.label}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
