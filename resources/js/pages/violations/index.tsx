import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import { useUser } from '@/components/UserContext';
import { type BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Охрана', href: '/check' },
    { title: 'Нарушители', href: '/violations' },
];

interface ViolationEvidence {
    id: number;
    media_kind: 'photo' | 'video';
    url: string | null;
    is_primary: boolean;
}

interface EvidencePreviewState {
    evidence: ViolationEvidence;
    title: string;
}

interface ViolationIncident {
    id: number;
    incident_uid: string;
    workflow_status: string;
    recognition_status: string;
    occurred_at: string | null;
    reported_at: string | null;
    reported_by_name: string | null;
    reported_by_user: string | null;
    category_name: string | null;
    type_name: string | null;
    employee_full_name: string | null;
    employee_department: string | null;
    employee_position: string | null;
    description: string | null;
    location_label: string | null;
    evidence_total_count: number;
    evidence_photo_count: number;
    evidence_video_count: number;
    recognition_similarity: number | null;
    review_note: string | null;
    rejection_reason: string | null;
    identity_requires_manual_review: boolean;
    employee_reference: ViolationEvidence | null;
    recognition_probe: ViolationEvidence | null;
    evidences: ViolationEvidence[];
}

interface ViolationType {
    id: number;
    category_id: number;
    key: string;
    name: string;
    description: string | null;
    sort_order: number;
    is_active: boolean;
}

interface ViolationCategory {
    id: number;
    key: string;
    name: string;
    description: string | null;
    sort_order: number;
    is_active: boolean;
    types: ViolationType[];
}

const incidentStatusLabels: Record<string, string> = {
    draft_processing: 'Обработка',
    pending_review: 'На проверке',
    unknown_manual: 'Ждёт идентификации',
    recognized_confirmed: 'Личность подтверждена',
    approved: 'Подтверждено',
    rejected: 'Отклонено',
    resolved: 'Рассмотрено',
    closed: 'Закрыто',
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
    const validationErrors = responseData?.errors;

    if (validationErrors && typeof validationErrors === 'object') {
        const firstMessage = Object.values(validationErrors)
            .flat()
            .find((message): message is string => typeof message === 'string' && message.trim() !== '');

        if (firstMessage) {
            return firstMessage;
        }
    }

    return responseData?.message ?? fallback;
};

function EvidencePreview({
    evidence,
    alt,
    onOpen,
}: {
    evidence?: ViolationEvidence | null;
    alt: string;
    onOpen: (evidence: ViolationEvidence) => void;
}) {
    if (!evidence?.url) {
        return null;
    }

    if (evidence.media_kind === 'video') {
        return <video src={evidence.url} controls className="mt-3 h-44 w-full rounded-lg bg-black object-cover" />;
    }

    return (
        <button
            type="button"
            onClick={() => onOpen(evidence)}
            className="mt-3 block w-full cursor-zoom-in overflow-hidden rounded-lg"
        >
            <img src={evidence.url} alt={alt} className="h-44 w-full rounded-lg object-cover transition hover:scale-[1.01]" />
        </button>
    );
}

export default function ViolationsPage() {
    const { user } = useUser();
    const canReview = Boolean(user?.isAdmin || user?.permissions?.includes('violations.review'));
    const canManageSettings = Boolean(user?.isAdmin || user?.permissions?.includes('violations.settings'));

    const [incidents, setIncidents] = useState<ViolationIncident[]>([]);
    const [catalog, setCatalog] = useState<ViolationCategory[]>([]);
    const [loadingIncidents, setLoadingIncidents] = useState(true);
    const [loadingCatalog, setLoadingCatalog] = useState(true);
    const [loadingUnknownIncidents, setLoadingUnknownIncidents] = useState(true);
    const [incidentsError, setIncidentsError] = useState<string | null>(null);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [unknownIncidentsError, setUnknownIncidentsError] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState('');
    const [searchDraft, setSearchDraft] = useState('');
    const [search, setSearch] = useState('');
    const [savingCategory, setSavingCategory] = useState(false);
    const [savingType, setSavingType] = useState(false);
    const [toggleBusyKey, setToggleBusyKey] = useState<string | null>(null);
    const [preview, setPreview] = useState<EvidencePreviewState | null>(null);
    const [unknownIncidents, setUnknownIncidents] = useState<ViolationIncident[]>([]);
    const [identityForms, setIdentityForms] = useState<Record<number, {
        employee_full_name: string;
        employee_department: string;
        employee_position: string;
        review_note: string;
    }>>({});
    const [savingIdentityIncidentId, setSavingIdentityIncidentId] = useState<number | null>(null);
    const [categoryForm, setCategoryForm] = useState({
        name: '',
        description: '',
        sort_order: '0',
    });
    const [typeForm, setTypeForm] = useState({
        category_id: '',
        name: '',
        description: '',
        sort_order: '0',
    });

    const loadCatalog = useCallback(async () => {
        setLoadingCatalog(true);
        setCatalogError(null);

        try {
            const response = await axios.get<{ data: ViolationCategory[] }>('/violations/api/catalog');
            setCatalog(Array.isArray(response.data.data) ? response.data.data : []);
        } catch (error: unknown) {
            setCatalog([]);
            setCatalogError(getErrorMessage(error, 'Не удалось загрузить каталог'));
        } finally {
            setLoadingCatalog(false);
        }
    }, []);

    const loadIncidents = useCallback(async () => {
        setLoadingIncidents(true);
        setIncidentsError(null);

        try {
            const params = {
                ...(statusFilter ? { status: statusFilter } : {}),
                ...(search ? { search } : {}),
            };

            const response = await axios.get<{ data: ViolationIncident[] }>('/violations/api/incidents', { params });
            setIncidents(Array.isArray(response.data.data) ? response.data.data : []);
        } catch (error: unknown) {
            setIncidents([]);
            setIncidentsError(getErrorMessage(error, 'Не удалось загрузить инциденты'));
        } finally {
            setLoadingIncidents(false);
        }
    }, [search, statusFilter]);

    const loadUnknownIncidents = useCallback(async () => {
        setLoadingUnknownIncidents(true);
        setUnknownIncidentsError(null);

        try {
            const response = await axios.get<{ data: ViolationIncident[] }>('/violations/api/incidents', {
                params: { status: 'unknown_manual', limit: 25 },
            });

            setUnknownIncidents(Array.isArray(response.data.data) ? response.data.data : []);
        } catch (error: unknown) {
            setUnknownIncidents([]);
            setUnknownIncidentsError(getErrorMessage(error, 'Не удалось загрузить очередь ручной идентификации'));
        } finally {
            setLoadingUnknownIncidents(false);
        }
    }, []);

    useEffect(() => {
        void loadCatalog();
    }, [loadCatalog]);

    useEffect(() => {
        void loadIncidents();
    }, [loadIncidents]);

    useEffect(() => {
        void loadUnknownIncidents();
    }, [loadUnknownIncidents]);

    useEffect(() => {
        setIdentityForms((current) => {
            const next = { ...current };

            unknownIncidents.forEach((incident) => {
                if (!next[incident.id]) {
                    next[incident.id] = {
                        employee_full_name: incident.employee_full_name || '',
                        employee_department: incident.employee_department || '',
                        employee_position: incident.employee_position || '',
                        review_note: '',
                    };
                }
            });

            return next;
        });
    }, [unknownIncidents]);

    useEffect(() => {
        if (typeForm.category_id || catalog.length === 0) {
            return;
        }

        setTypeForm((current) => ({ ...current, category_id: String(catalog[0].id) }));
    }, [catalog, typeForm.category_id]);

    const refreshAll = async () => {
        await Promise.all([loadIncidents(), loadCatalog(), loadUnknownIncidents()]);
    };

    const submitCategory = async (event: React.FormEvent) => {
        event.preventDefault();
        setSavingCategory(true);

        try {
            await axios.post('/violations/api/categories', {
                name: categoryForm.name.trim(),
                description: categoryForm.description.trim() || null,
                sort_order: Number(categoryForm.sort_order || 0),
            });

            setCategoryForm({ name: '', description: '', sort_order: '0' });
            await loadCatalog();
        } catch (error: unknown) {
            alert(getErrorMessage(error, 'Не удалось сохранить категорию'));
        } finally {
            setSavingCategory(false);
        }
    };

    const submitType = async (event: React.FormEvent) => {
        event.preventDefault();
        setSavingType(true);

        try {
            await axios.post('/violations/api/types', {
                category_id: Number(typeForm.category_id),
                name: typeForm.name.trim(),
                description: typeForm.description.trim() || null,
                sort_order: Number(typeForm.sort_order || 0),
            });

            setTypeForm((current) => ({
                ...current,
                name: '',
                description: '',
                sort_order: '0',
            }));
            await loadCatalog();
        } catch (error: unknown) {
            alert(getErrorMessage(error, 'Не удалось сохранить тип нарушения'));
        } finally {
            setSavingType(false);
        }
    };

    const toggleCategory = async (category: ViolationCategory) => {
        setToggleBusyKey(`category-${category.id}`);

        try {
            await axios.patch(`/violations/api/categories/${category.id}`, {
                name: category.name,
                key: category.key,
                description: category.description,
                sort_order: category.sort_order,
                is_active: !category.is_active,
            });

            await loadCatalog();
        } catch (error: unknown) {
            alert(getErrorMessage(error, 'Не удалось изменить статус категории'));
        } finally {
            setToggleBusyKey(null);
        }
    };

    const toggleType = async (type: ViolationType) => {
        setToggleBusyKey(`type-${type.id}`);

        try {
            await axios.patch(`/violations/api/types/${type.id}`, {
                category_id: type.category_id,
                name: type.name,
                key: type.key,
                description: type.description,
                sort_order: type.sort_order,
                is_active: !type.is_active,
            });

            await loadCatalog();
        } catch (error: unknown) {
            alert(getErrorMessage(error, 'Не удалось изменить статус типа нарушения'));
        } finally {
            setToggleBusyKey(null);
        }
    };

    const updateIdentityForm = (incidentId: number, field: 'employee_full_name' | 'employee_department' | 'employee_position' | 'review_note', value: string) => {
        setIdentityForms((current) => ({
            ...current,
            [incidentId]: {
                employee_full_name: current[incidentId]?.employee_full_name ?? '',
                employee_department: current[incidentId]?.employee_department ?? '',
                employee_position: current[incidentId]?.employee_position ?? '',
                review_note: current[incidentId]?.review_note ?? '',
                [field]: value,
            },
        }));
    };

    const submitIdentityResolution = async (incidentId: number) => {
        const form = identityForms[incidentId];

        if (!form?.employee_full_name?.trim()) {
            alert('Укажите ФИО сотрудника');
            return;
        }

        setSavingIdentityIncidentId(incidentId);

        try {
            await axios.post(`/violations/api/incidents/${incidentId}/resolve-identity`, {
                employee_full_name: form.employee_full_name.trim(),
                employee_department: form.employee_department.trim() || null,
                employee_position: form.employee_position.trim() || null,
                review_note: form.review_note.trim() || null,
            });

            await Promise.all([loadIncidents(), loadUnknownIncidents()]);
        } catch (error: unknown) {
            alert(getErrorMessage(error, 'Не удалось сохранить личность сотрудника'));
        } finally {
            setSavingIdentityIncidentId(null);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Нарушители" />

            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <section className="rounded-xl border border-[#E8E8E8] bg-white px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-col gap-2">
                            <h1 className="text-[15px] font-semibold text-[#1A1A1A]">Нарушители</h1>
                            <p className="text-[12px] text-[#6B6B6B]">
                                Очередь инцидентов из Telegram Mini App. Здесь охрана видит карточки нарушений, доказательства
                                и поддерживает справочник категорий и типов без миграций.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void refreshAll()}
                            className="inline-flex h-9 items-center justify-center rounded-md border border-[#D7D7D7] px-4 text-sm font-medium text-[#333] transition hover:bg-[#F7F7F7]"
                        >
                            Обновить
                        </button>
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
                            placeholder="Поиск по ФИО, отделу, категории или типу"
                            className="h-10 flex-1 rounded-lg border border-[#D9D9D9] px-3 text-sm outline-none transition focus:border-red-500"
                        />
                        <select
                            value={statusFilter}
                            onChange={(event) => setStatusFilter(event.target.value)}
                            className="h-10 rounded-lg border border-[#D9D9D9] px-3 text-sm outline-none transition focus:border-red-500 lg:w-56"
                        >
                            <option value="">Все статусы</option>
                            <option value="pending_review">На проверке</option>
                            <option value="unknown_manual">Ждёт идентификации</option>
                            <option value="approved">Подтверждено</option>
                            <option value="rejected">Отклонено</option>
                            <option value="resolved">Рассмотрено</option>
                            <option value="closed">Закрыто</option>
                        </select>
                        <button
                            type="submit"
                            className="inline-flex h-10 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-700"
                        >
                            Применить
                        </button>
                    </form>
                </section>

                {!canReview && !canManageSettings && (
                    <section className="rounded-xl border border-[#F5D0D0] bg-[#FFF5F5] px-5 py-4 text-sm text-[#8B1E1E]">
                        У вашей учётной записи нет прав на просмотр или настройку модуля нарушений.
                    </section>
                )}

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.95fr)]">
                    <section className="rounded-xl border border-[#E8E8E8] bg-white px-5 py-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-semibold text-[#1A1A1A]">Очередь инцидентов</h2>
                                <p className="text-xs text-[#6B6B6B]">Последние зафиксированные нарушения с фото и видео.</p>
                            </div>
                            <div className="text-xs text-[#6B6B6B]">Всего: {incidents.length}</div>
                        </div>

                        {incidentsError && (
                            <div className="mb-3 rounded-lg border border-[#F5D0D0] bg-[#FFF5F5] px-3 py-2 text-sm text-[#8B1E1E]">
                                {incidentsError}
                            </div>
                        )}

                        {loadingIncidents && <div className="text-sm text-[#6B6B6B]">Загрузка инцидентов...</div>}

                        {!loadingIncidents && incidents.length === 0 && (
                            <div className="rounded-lg border border-dashed border-[#D9D9D9] px-4 py-6 text-sm text-[#6B6B6B]">
                                По текущим фильтрам инциденты не найдены.
                            </div>
                        )}

                        <div className="space-y-3">
                            {incidents.map((incident) => {
                                const primaryEvidence = incident.evidences.find((evidence) => evidence.is_primary) ?? incident.evidences[0] ?? null;
                                const hasVisuals = Boolean(incident.employee_reference?.url || primaryEvidence?.url);

                                return (
                                    <article key={incident.id} className="rounded-xl border border-[#ECECEC] bg-[#FCFCFC] p-4">
                                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                            <div className="space-y-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="text-sm font-semibold text-[#1A1A1A]">
                                                        {incident.employee_full_name || 'Не указан нарушитель'}
                                                    </h3>
                                                    <span className="rounded-full bg-[#F3F4F6] px-2.5 py-1 text-[11px] font-medium text-[#374151]">
                                                        {incidentStatusLabels[incident.workflow_status] || incident.workflow_status}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-[#6B6B6B]">
                                                    {incident.category_name || '—'} / {incident.type_name || '—'}
                                                </div>
                                            </div>
                                            <div className="text-right text-xs text-[#6B6B6B]">
                                                <div>{formatDateTime(incident.occurred_at)}</div>
                                                <div>Сообщил: {incident.reported_by_name || incident.reported_by_user || '—'}</div>
                                            </div>
                                        </div>

                                        <div className="mt-3 grid gap-2 text-sm text-[#333] sm:grid-cols-2">
                                            <div>Отдел: {incident.employee_department || '—'}</div>
                                            <div>Должность: {incident.employee_position || '—'}</div>
                                            <div>Локация: {incident.location_label || '—'}</div>
                                            <div>Доказательства: {incident.evidence_photo_count} фото / {incident.evidence_video_count} видео</div>
                                        </div>

                                        {incident.description && (
                                            <p className="mt-3 text-sm leading-6 text-[#444]">{incident.description}</p>
                                        )}

                                        {hasVisuals && (
                                            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                                {incident.employee_reference?.url && (
                                                    <div>
                                                        <div className="text-xs font-medium uppercase tracking-[0.08em] text-[#6B6B6B]">Эталонное фото нарушителя</div>
                                                        <EvidencePreview
                                                            evidence={incident.employee_reference}
                                                            alt={incident.employee_full_name || 'Эталонное фото нарушителя'}
                                                            onOpen={(evidence) => setPreview({ evidence, title: incident.employee_full_name ? `Эталонное фото: ${incident.employee_full_name}` : 'Эталонное фото нарушителя' })}
                                                        />
                                                    </div>
                                                )}

                                                {primaryEvidence?.url && (
                                                    <div>
                                                        <div className="text-xs font-medium uppercase tracking-[0.08em] text-[#6B6B6B]">Улика по нарушению</div>
                                                        <EvidencePreview
                                                            evidence={primaryEvidence}
                                                            alt={incident.type_name || 'Доказательство'}
                                                            onOpen={(evidence) => setPreview({ evidence, title: incident.type_name || 'Доказательство' })}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {(incident.review_note || incident.rejection_reason) && (
                                            <div className="mt-3 rounded-lg border border-[#E9D8A6] bg-[#FFF8DB] px-3 py-2 text-sm text-[#6B5B1A]">
                                                {incident.review_note || incident.rejection_reason}
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    </section>

                    <div className="flex flex-col gap-4">
                        <section className="rounded-xl border border-[#E8E8E8] bg-white px-5 py-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-sm font-semibold text-[#1A1A1A]">Очередь ручной идентификации</h2>
                                    <p className="text-xs text-[#6B6B6B]">Сюда попадают нарушения, где Face ID не нашёл сотрудника.</p>
                                </div>
                                <div className="text-xs text-[#6B6B6B]">Всего: {unknownIncidents.length}</div>
                            </div>

                            {unknownIncidentsError && (
                                <div className="mb-3 rounded-lg border border-[#F5D0D0] bg-[#FFF5F5] px-3 py-2 text-sm text-[#8B1E1E]">
                                    {unknownIncidentsError}
                                </div>
                            )}

                            {loadingUnknownIncidents && <div className="text-sm text-[#6B6B6B]">Загрузка очереди...</div>}

                            {!loadingUnknownIncidents && unknownIncidents.length === 0 && (
                                <div className="rounded-lg border border-dashed border-[#D9D9D9] px-4 py-6 text-sm text-[#6B6B6B]">
                                    Неидентифицированных сотрудников сейчас нет.
                                </div>
                            )}

                            <div className="space-y-3">
                                {unknownIncidents.map((incident) => {
                                    const form = identityForms[incident.id] ?? {
                                        employee_full_name: '',
                                        employee_department: '',
                                        employee_position: '',
                                        review_note: '',
                                    };
                                    const previewEvidence = incident.recognition_probe ?? incident.evidences.find((evidence) => evidence.media_kind === 'photo') ?? null;

                                    return (
                                        <article key={incident.id} className="rounded-xl border border-[#ECECEC] bg-[#FCFCFC] p-4">
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-semibold text-[#1A1A1A]">Инцидент #{incident.id}</div>
                                                    <div className="mt-1 text-xs text-[#6B6B6B]">
                                                        {incident.category_name || '—'} / {incident.type_name || '—'}
                                                    </div>
                                                </div>
                                                <div className="text-right text-xs text-[#6B6B6B]">
                                                    <div>{formatDateTime(incident.occurred_at)}</div>
                                                    <div>Сообщил: {incident.reported_by_name || incident.reported_by_user || '—'}</div>
                                                </div>
                                            </div>

                                            {previewEvidence?.url && (
                                                <button
                                                    type="button"
                                                    onClick={() => setPreview({ evidence: previewEvidence, title: 'Фото для идентификации' })}
                                                    className="mt-3 block w-full cursor-zoom-in overflow-hidden rounded-lg"
                                                >
                                                    <img src={previewEvidence.url} alt="Фото для идентификации" className="h-44 w-full rounded-lg object-cover transition hover:scale-[1.01]" />
                                                </button>
                                            )}

                                            <div className="mt-3 grid gap-3">
                                                <input
                                                    value={form.employee_full_name}
                                                    onChange={(event) => updateIdentityForm(incident.id, 'employee_full_name', event.target.value)}
                                                    placeholder="ФИО сотрудника"
                                                    className="h-10 w-full rounded-lg border border-[#D9D9D9] px-3 text-sm outline-none transition focus:border-red-500"
                                                />
                                                <input
                                                    value={form.employee_department}
                                                    onChange={(event) => updateIdentityForm(incident.id, 'employee_department', event.target.value)}
                                                    placeholder="Отдел"
                                                    className="h-10 w-full rounded-lg border border-[#D9D9D9] px-3 text-sm outline-none transition focus:border-red-500"
                                                />
                                                <input
                                                    value={form.employee_position}
                                                    onChange={(event) => updateIdentityForm(incident.id, 'employee_position', event.target.value)}
                                                    placeholder="Должность"
                                                    className="h-10 w-full rounded-lg border border-[#D9D9D9] px-3 text-sm outline-none transition focus:border-red-500"
                                                />
                                                <textarea
                                                    value={form.review_note}
                                                    onChange={(event) => updateIdentityForm(incident.id, 'review_note', event.target.value)}
                                                    placeholder="Комментарий СБ"
                                                    className="min-h-[88px] w-full rounded-lg border border-[#D9D9D9] px-3 py-2 text-sm outline-none transition focus:border-red-500"
                                                />
                                                <button
                                                    type="button"
                                                    disabled={savingIdentityIncidentId === incident.id}
                                                    onClick={() => void submitIdentityResolution(incident.id)}
                                                    className="inline-flex h-10 items-center justify-center rounded-lg bg-[#111827] px-4 text-sm font-medium text-white transition hover:bg-[#1F2937] disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    {savingIdentityIncidentId === incident.id ? 'Сохранение...' : 'Сохранить сотрудника'}
                                                </button>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </section>

                        <section className="rounded-xl border border-[#E8E8E8] bg-white px-5 py-4">
                            <div className="mb-3">
                                <h2 className="text-sm font-semibold text-[#1A1A1A]">Каталог нарушений</h2>
                                <p className="text-xs text-[#6B6B6B]">Категории и типы, доступные в Mini App.</p>
                            </div>

                            {catalogError && (
                                <div className="mb-3 rounded-lg border border-[#F5D0D0] bg-[#FFF5F5] px-3 py-2 text-sm text-[#8B1E1E]">
                                    {catalogError}
                                </div>
                            )}

                            {loadingCatalog && <div className="text-sm text-[#6B6B6B]">Загрузка каталога...</div>}

                            <div className="space-y-3">
                                {catalog.map((category) => (
                                    <div key={category.id} className="rounded-xl border border-[#ECECEC] p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="text-sm font-semibold text-[#1A1A1A]">{category.name}</h3>
                                                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${category.is_active ? 'bg-[#ECFDF3] text-[#027A48]' : 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                                                        {category.is_active ? 'Активна' : 'Отключена'}
                                                    </span>
                                                </div>
                                                {category.description && <p className="mt-1 text-xs leading-5 text-[#6B6B6B]">{category.description}</p>}
                                            </div>
                                            {canManageSettings && (
                                                <button
                                                    type="button"
                                                    disabled={toggleBusyKey === `category-${category.id}`}
                                                    onClick={() => void toggleCategory(category)}
                                                    className="rounded-md border border-[#D7D7D7] px-3 py-1.5 text-xs font-medium text-[#333] transition hover:bg-[#F7F7F7] disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    {toggleBusyKey === `category-${category.id}` ? 'Сохранение...' : (category.is_active ? 'Отключить' : 'Включить')}
                                                </button>
                                            )}
                                        </div>

                                        <div className="mt-3 space-y-2">
                                            {category.types.length === 0 && <div className="text-xs text-[#6B6B6B]">Типов пока нет.</div>}
                                            {category.types.map((type) => (
                                                <div key={type.id} className="rounded-lg bg-[#F8F8F8] px-3 py-2">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-medium text-[#1A1A1A]">{type.name}</div>
                                                            {type.description && <div className="mt-1 text-xs leading-5 text-[#6B6B6B]">{type.description}</div>}
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${type.is_active ? 'bg-[#ECFDF3] text-[#027A48]' : 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                                                                {type.is_active ? 'Активен' : 'Отключён'}
                                                            </span>
                                                            {canManageSettings && (
                                                                <button
                                                                    type="button"
                                                                    disabled={toggleBusyKey === `type-${type.id}`}
                                                                    onClick={() => void toggleType(type)}
                                                                    className="rounded-md border border-[#D7D7D7] px-3 py-1 text-[11px] font-medium text-[#333] transition hover:bg-[#F0F0F0] disabled:cursor-not-allowed disabled:opacity-50"
                                                                >
                                                                    {toggleBusyKey === `type-${type.id}` ? '...' : (type.is_active ? 'Отключить' : 'Включить')}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {canManageSettings && (
                            <section className="rounded-xl border border-[#E8E8E8] bg-white px-5 py-4">
                                <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-1">
                                    <form onSubmit={submitCategory} className="space-y-3">
                                        <div>
                                            <h2 className="text-sm font-semibold text-[#1A1A1A]">Новая категория</h2>
                                            <p className="text-xs text-[#6B6B6B]">Добавляйте новые группы нарушений без изменения схемы.</p>
                                        </div>
                                        <input
                                            value={categoryForm.name}
                                            onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))}
                                            placeholder="Например, Пропускной режим"
                                            className="h-10 w-full rounded-lg border border-[#D9D9D9] px-3 text-sm outline-none transition focus:border-red-500"
                                            required
                                        />
                                        <textarea
                                            value={categoryForm.description}
                                            onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))}
                                            placeholder="Описание категории"
                                            className="min-h-[88px] w-full rounded-lg border border-[#D9D9D9] px-3 py-2 text-sm outline-none transition focus:border-red-500"
                                        />
                                        <input
                                            type="number"
                                            value={categoryForm.sort_order}
                                            onChange={(event) => setCategoryForm((current) => ({ ...current, sort_order: event.target.value }))}
                                            placeholder="Порядок сортировки"
                                            className="h-10 w-full rounded-lg border border-[#D9D9D9] px-3 text-sm outline-none transition focus:border-red-500"
                                        />
                                        <button
                                            type="submit"
                                            disabled={savingCategory || !categoryForm.name.trim()}
                                            className="inline-flex h-10 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {savingCategory ? 'Сохранение...' : 'Добавить категорию'}
                                        </button>
                                    </form>

                                    <form onSubmit={submitType} className="space-y-3">
                                        <div>
                                            <h2 className="text-sm font-semibold text-[#1A1A1A]">Новый тип нарушения</h2>
                                            <p className="text-xs text-[#6B6B6B]">Тип сразу появится в выборе Mini App.</p>
                                        </div>
                                        <select
                                            value={typeForm.category_id}
                                            onChange={(event) => setTypeForm((current) => ({ ...current, category_id: event.target.value }))}
                                            className="h-10 w-full rounded-lg border border-[#D9D9D9] px-3 text-sm outline-none transition focus:border-red-500"
                                            required
                                        >
                                            <option value="">Выберите категорию</option>
                                            {catalog.map((category) => (
                                                <option key={category.id} value={category.id}>{category.name}</option>
                                            ))}
                                        </select>
                                        <input
                                            value={typeForm.name}
                                            onChange={(event) => setTypeForm((current) => ({ ...current, name: event.target.value }))}
                                            placeholder="Например, Без каски"
                                            className="h-10 w-full rounded-lg border border-[#D9D9D9] px-3 text-sm outline-none transition focus:border-red-500"
                                            required
                                        />
                                        <textarea
                                            value={typeForm.description}
                                            onChange={(event) => setTypeForm((current) => ({ ...current, description: event.target.value }))}
                                            placeholder="Описание типа нарушения"
                                            className="min-h-[88px] w-full rounded-lg border border-[#D9D9D9] px-3 py-2 text-sm outline-none transition focus:border-red-500"
                                        />
                                        <input
                                            type="number"
                                            value={typeForm.sort_order}
                                            onChange={(event) => setTypeForm((current) => ({ ...current, sort_order: event.target.value }))}
                                            placeholder="Порядок сортировки"
                                            className="h-10 w-full rounded-lg border border-[#D9D9D9] px-3 text-sm outline-none transition focus:border-red-500"
                                        />
                                        <button
                                            type="submit"
                                            disabled={savingType || !typeForm.name.trim() || !typeForm.category_id}
                                            className="inline-flex h-10 items-center justify-center rounded-lg bg-[#111827] px-4 text-sm font-medium text-white transition hover:bg-[#1F2937] disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {savingType ? 'Сохранение...' : 'Добавить тип'}
                                        </button>
                                    </form>
                                </div>
                            </section>
                        )}
                    </div>
                </div>
            </div>
            {preview?.evidence.url && (
                <div
                    className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-4"
                    onClick={() => setPreview(null)}
                >
                    <div className="grid w-full max-w-5xl gap-3" onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center justify-between gap-3 text-white">
                            <div className="text-sm font-semibold">{preview.title}</div>
                            <button
                                type="button"
                                onClick={() => setPreview(null)}
                                className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-[#111] transition hover:bg-[#F3F4F6]"
                            >
                                Закрыть
                            </button>
                        </div>
                        <img
                            src={preview.evidence.url}
                            alt={preview.title}
                            className="max-h-[86vh] w-full rounded-xl bg-[#111] object-contain"
                        />
                    </div>
                </div>
            )}
        </AppLayout>
    );
}
