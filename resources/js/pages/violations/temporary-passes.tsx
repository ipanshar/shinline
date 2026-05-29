import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Head } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Охрана', href: '/check' },
    { title: 'Служба безопасности', href: '/violations' },
    { title: 'Временные пропуска', href: '/violations/temporary-passes' },
];

interface TemporaryWorkerItem {
    id: number;
    full_name: string;
    department: string | null;
    position: string | null;
    person_kind: string;
    temporary_pass_status: string | null;
    temporary_pass_issued_at: string | null;
    temporary_pass_expires_at: string | null;
    temporary_pass_duration_months: number | null;
    temporary_pass_created_by_name: string | null;
    temporary_pass_last_extended_at: string | null;
    face_reference_count: number;
    reference_image_url: string | null;
}

const statusLabels: Record<string, string> = {
    active: 'Активен',
    expired: 'Просрочен',
    expires_soon: 'Истекает скоро',
};

const formatDateTime = (value?: string | null) => {
    if (!value) {
        return '—';
    }

    return new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const getErrorMessage = (error: unknown, fallback: string) => {
    const responseData = (error as any)?.response?.data;
    return responseData?.message ?? fallback;
};

const badgeClassName = (status: string | null) => {
    if (status === 'active') {
        return 'bg-[#ECFDF3] text-[#027A48]';
    }

    if (status === 'expired') {
        return 'bg-[#FFF1F1] text-[#B42318]';
    }

    return 'bg-[#FFF7E6] text-[#8A5A00]';
};

export default function TemporaryPassesPage() {
    const [items, setItems] = useState<TemporaryWorkerItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchDraft, setSearchDraft] = useState('');
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const loadItems = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await axios.get<{ data: TemporaryWorkerItem[] }>('/violations/api/temporary-workers', {
                params: {
                    ...(search ? { search } : {}),
                    ...(status ? { status } : {}),
                },
            });
            setItems(Array.isArray(response.data.data) ? response.data.data : []);
        } catch (loadError) {
            setItems([]);
            setError(getErrorMessage(loadError, 'Не удалось загрузить временные пропуска.'));
        } finally {
            setLoading(false);
        }
    }, [search, status]);

    useEffect(() => {
        void loadItems();
    }, [loadItems]);

    const summary = useMemo(() => {
        return items.reduce(
            (acc, item) => {
                if (item.temporary_pass_status === 'active') {
                    acc.active += 1;
                }
                if (item.temporary_pass_status === 'expired') {
                    acc.expired += 1;
                }

                const expiresAt = item.temporary_pass_expires_at ? new Date(item.temporary_pass_expires_at) : null;
                if (expiresAt) {
                    const now = new Date();
                    const soonBorder = new Date();
                    soonBorder.setDate(soonBorder.getDate() + 14);

                    if (expiresAt > now && expiresAt <= soonBorder) {
                        acc.expiresSoon += 1;
                    }
                }

                return acc;
            },
            { active: 0, expired: 0, expiresSoon: 0 },
        );
    }, [items]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Временные пропуска" />

            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <section className="rounded-xl border border-[#E8E8E8] bg-white px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-col gap-2">
                            <h1 className="text-[15px] font-semibold text-[#1A1A1A]">Временные пропуска</h1>
                            <p className="text-[12px] text-[#6B6B6B]">
                                Здесь СБ просматривает временных подрядчиков, срок их пропусков и эталонные фото.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void loadItems()}
                            className="inline-flex h-9 items-center justify-center rounded-md border border-[#D7D7D7] px-4 text-sm font-medium text-[#333] transition hover:bg-[#F7F7F7]"
                        >
                            Обновить
                        </button>
                    </div>
                </section>

                <section className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-[#E8E8E8] bg-white px-5 py-4">
                        <div className="text-xs text-[#6B6B6B]">Активные</div>
                        <div className="mt-2 text-2xl font-semibold text-[#1A1A1A]">{summary.active}</div>
                    </div>
                    <div className="rounded-xl border border-[#E8E8E8] bg-white px-5 py-4">
                        <div className="text-xs text-[#6B6B6B]">Просроченные</div>
                        <div className="mt-2 text-2xl font-semibold text-[#B42318]">{summary.expired}</div>
                    </div>
                    <div className="rounded-xl border border-[#E8E8E8] bg-white px-5 py-4">
                        <div className="text-xs text-[#6B6B6B]">Истекают за 14 дней</div>
                        <div className="mt-2 text-2xl font-semibold text-[#8A5A00]">{summary.expiresSoon}</div>
                    </div>
                </section>

                <section className="rounded-xl border border-[#E8E8E8] bg-white px-5 py-4">
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            setSearch(searchDraft.trim());
                        }}
                        className="flex flex-col gap-3 lg:flex-row"
                    >
                        <input
                            value={searchDraft}
                            onChange={(event) => setSearchDraft(event.target.value)}
                            placeholder="Поиск по ФИО, отделу или должности"
                            className="h-10 flex-1 rounded-lg border border-[#D9D9D9] px-3 text-sm outline-none transition focus:border-red-500"
                        />
                        <select
                            value={status}
                            onChange={(event) => setStatus(event.target.value)}
                            className="h-10 rounded-lg border border-[#D9D9D9] px-3 text-sm outline-none transition focus:border-red-500 lg:w-56"
                        >
                            <option value="">Все статусы</option>
                            <option value="active">Активные</option>
                            <option value="expired">Просроченные</option>
                            <option value="expires_soon">Истекают скоро</option>
                        </select>
                        <button
                            type="submit"
                            className="inline-flex h-10 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-700"
                        >
                            Применить
                        </button>
                    </form>
                </section>

                <section className="rounded-xl border border-[#E8E8E8] bg-white px-5 py-4">
                    {error && (
                        <div className="mb-3 rounded-lg border border-[#F5D0D0] bg-[#FFF5F5] px-3 py-2 text-sm text-[#8B1E1E]">
                            {error}
                        </div>
                    )}

                    {loading && <div className="text-sm text-[#6B6B6B]">Загрузка временных пропусков...</div>}

                    {!loading && items.length === 0 && (
                        <div className="rounded-lg border border-dashed border-[#D7D7D7] px-4 py-8 text-center text-sm text-[#6B6B6B]">
                            Подходящие временные пропуска не найдены.
                        </div>
                    )}

                    <div className="grid gap-4 xl:grid-cols-2">
                        {items.map((item) => (
                            <article key={item.id} className="rounded-xl border border-[#ECECEC] p-4">
                                <div className="flex items-start gap-4">
                                    <button
                                        type="button"
                                        onClick={() => item.reference_image_url && setPreviewUrl(item.reference_image_url)}
                                        className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#F4F4F5]"
                                    >
                                        {item.reference_image_url ? (
                                            <img
                                                src={item.reference_image_url}
                                                alt={item.full_name}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-xs text-[#71717A]">Нет фото</div>
                                        )}
                                    </button>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="text-sm font-semibold text-[#1A1A1A]">{item.full_name}</h2>
                                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${badgeClassName(item.temporary_pass_status)}`}>
                                                {statusLabels[item.temporary_pass_status || ''] || 'Без статуса'}
                                            </span>
                                        </div>

                                        <div className="mt-3 grid gap-1 text-sm text-[#4B5563]">
                                            <div>Отдел: {item.department || '—'}</div>
                                            <div>Должность: {item.position || '—'}</div>
                                            <div>Выдан: {formatDateTime(item.temporary_pass_issued_at)}</div>
                                            <div>Действует до: {formatDateTime(item.temporary_pass_expires_at)}</div>
                                            <div>Срок: {item.temporary_pass_duration_months ? `${item.temporary_pass_duration_months} мес.` : '—'}</div>
                                            <div>Создал: {item.temporary_pass_created_by_name || '—'}</div>
                                            <div>Последнее продление: {formatDateTime(item.temporary_pass_last_extended_at)}</div>
                                            <div>Эталонных фото: {item.face_reference_count}</div>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            </div>

            {previewUrl && (
                <div
                    className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4"
                    onClick={() => setPreviewUrl(null)}
                >
                    <div className="grid w-full max-w-5xl gap-3" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between gap-3 text-white">
                            <div className="text-sm font-semibold">Эталонное фото</div>
                            <button
                                type="button"
                                onClick={() => setPreviewUrl(null)}
                                className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-[#111] transition hover:bg-[#F3F4F6]"
                            >
                                Закрыть
                            </button>
                        </div>
                        <img
                            src={previewUrl}
                            alt="Эталонное фото"
                            className="max-h-[86vh] w-full rounded-xl bg-[#111] object-contain"
                        />
                    </div>
                </div>
            )}
        </AppLayout>
    );
}
