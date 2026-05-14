import RequestCard, { type SpectechRequestData } from '@/components/spectech/RequestCard';
import { Head } from '@inertiajs/react';
import axios from 'axios';
import { FormEvent, useCallback, useEffect, useState } from 'react';

axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

declare global {
    interface Window {
        Telegram?: {
            WebApp?: {
                initData: string;
                initDataUnsafe?: {
                    user?: {
                        id: number;
                        first_name?: string;
                        last_name?: string;
                        username?: string;
                    };
                };
                ready: () => void;
                expand: () => void;
                close?: () => void;
                themeParams?: Record<string, string>;
                MainButton?: {
                    setText: (text: string) => void;
                    show: () => void;
                    hide: () => void;
                    onClick: (cb: () => void) => void;
                    offClick: (cb: () => void) => void;
                };
            };
        };
    }
}

interface YardOption {
    id: number;
    name: string;
}

interface VisitVehicle {
    id?: number;
    plate_number: string;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    comment?: string | null;
}

interface SessionPayload {
    chat_id: string;
    approval_status: 'none' | 'awaiting_review' | 'approved' | 'rejected' | 'blocked';
    rejection_reason: string | null;
    profile: {
        full_name: string | null;
        phone: string | null;
        username: string | null;
        first_name: string | null;
        last_name: string | null;
    };
    user: { id: number; name: string; phone: string | null } | null;
    can_manage_spectech: boolean;
    yards: YardOption[];
}

interface VisitItem {
    id: number;
    yard_id: number;
    guest_full_name: string;
    guest_phone: string;
    guest_position: string;
    guest_company_name: string | null;
    guest_iin: string | null;
    visit_starts_at: string;
    visit_ends_at: string | null;
    permit_kind: string;
    workflow_status: string;
    comment: string | null;
    vehicles: VisitVehicle[];
    yard?: { id: number; name: string };
}

const STATUS_LABELS: Record<SessionPayload['approval_status'], string> = {
    none: 'Не зарегистрирован',
    awaiting_review: 'Ожидает подтверждения',
    approved: 'Подтверждён',
    rejected: 'Отклонён',
    blocked: 'Заблокирован',
};

const visitStatusLabels: Record<string, string> = {
    active: 'Активный',
    closed: 'Закрыт',
    canceled: 'Отозван',
};

const spectechStatusOptions = [
    { value: '', label: 'Все статусы' },
    { value: 'new', label: 'Новые' },
    { value: 'departure', label: 'Выезд' },
    { value: 'on_location', label: 'На объекте' },
    { value: 'work_started', label: 'Работы начаты' },
    { value: 'completed', label: 'Выполнено' },
    { value: 'returned', label: 'Возврат' },
];

const nextSpectechStatus: Record<string, string> = {
    new: 'departure',
    departure: 'on_location',
    on_location: 'work_started',
    work_started: 'completed',
    completed: 'returned',
};

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>{children}</div>
);

const btn: React.CSSProperties = {
    width: '100%',
    padding: 12,
    margin: '8px 0',
    border: 'none',
    borderRadius: 8,
    background: '#2481cc',
    color: 'white',
    fontSize: 16,
    cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = { ...btn, background: '#e0e0e0', color: '#222' };

const smallButtonStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
};

const input: React.CSSProperties = {
    width: '100%',
    padding: 10,
    margin: '6px 0',
    borderRadius: 8,
    border: '1px solid #ccc',
    fontSize: 16,
    boxSizing: 'border-box',
};

const emptyVisitVehicle = (): VisitVehicle => ({
    plate_number: '',
    brand: null,
    model: null,
    color: null,
    comment: null,
});

const toDateTimeLocalValue = (value?: string | null) => {
    if (!value) {
        return '';
    }

    const date = new Date(value);
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);

    return localDate.toISOString().slice(0, 16);
};

const normalizeVisitVehicles = (vehicles?: VisitVehicle[]) => {
    if (!vehicles || vehicles.length === 0) {
        return [emptyVisitVehicle()];
    }

    return vehicles.map((vehicle) => ({ ...emptyVisitVehicle(), ...vehicle }));
};

const getErrorMessage = (error: unknown, fallback: string) => {
    if (!axios.isAxiosError(error)) {
        return fallback;
    }

    const validationErrors = error.response?.data?.errors;

    if (validationErrors && typeof validationErrors === 'object') {
        const firstMessage = Object.values(validationErrors)
            .flat()
            .find((message): message is string => typeof message === 'string' && message.trim() !== '');

        if (firstMessage) {
            return firstMessage;
        }
    }

    const responseMessage = error.response?.data?.message;

    return typeof responseMessage === 'string' && responseMessage.trim() !== '' ? responseMessage : fallback;
};

function StatusBadge({ status, reason }: { status: SessionPayload['approval_status']; reason: string | null }) {
    const colors: Record<typeof status, string> = {
        none: '#888',
        awaiting_review: '#d4a017',
        approved: '#2e8b2e',
        rejected: '#c0392b',
        blocked: '#7d2424',
    } as never;

    return (
        <div style={{ padding: 8, borderRadius: 8, background: colors[status], color: 'white', marginBottom: 12 }}>
            Статус: {STATUS_LABELS[status]}
            {reason && status === 'rejected' && <div style={{ fontSize: 13 }}>Причина: {reason}</div>}
        </div>
    );
}

function RegistrationForm({
    initData,
    initial,
    onDone,
}: {
    initData: string;
    initial: SessionPayload['profile'];
    onDone: () => void | Promise<void>;
}) {
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    const defaultName = initial.full_name ?? [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ');
    const [fullName, setFullName] = useState(defaultName ?? '');
    const [phone, setPhone] = useState(initial.phone ?? '');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        try {
            await axios.post('/api/telegram/miniapp/register', {
                init_data: initData,
                full_name: fullName,
                phone,
            });
            await onDone();
        } catch (e: unknown) {
            setErr(getErrorMessage(e, 'Ошибка отправки'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit}>
            <label>ФИО</label>
            <input style={input} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            <label>Телефон</label>
            <input style={input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7..." required />
            {err && <p style={{ color: 'crimson' }}>{err}</p>}
            <button type="submit" disabled={busy} style={btn}>
                {busy ? 'Отправка…' : 'Отправить заявку'}
            </button>
        </form>
    );
}

function Dashboard({
    session,
    onCreate,
    onVisits,
    onOperatorSpectech,
}: {
    session: SessionPayload;
    onCreate: () => void;
    onVisits: () => void;
    onOperatorSpectech: () => void;
}) {
    return (
        <>
            <p>Добро пожаловать, {session.user?.name ?? session.profile.full_name}!</p>
            <p>Доступные площадки: {session.yards.length === 0 ? 'нет' : session.yards.map((y) => y.name).join(', ')}</p>
            <button style={btn} onClick={onCreate} disabled={session.yards.length === 0}>
                Создать гостевой визит
            </button>
            <button style={btnSecondary} onClick={onVisits}>
                Мои визиты
            </button>
            {session.can_manage_spectech && (
                <button style={btnSecondary} onClick={onOperatorSpectech}>
                    Панель оператора спецтехники
                </button>
            )}
        </>
    );
}

function CreateVisitForm({
    initData,
    yards,
    onDone,
    onCancel,
    visit,
}: {
    initData: string;
    yards: YardOption[];
    onDone: () => void | Promise<void>;
    onCancel: () => void;
    visit?: VisitItem | null;
}) {
    const [yardId, setYardId] = useState<number | ''>(visit?.yard_id ?? yards[0]?.id ?? '');
    const [guestName, setGuestName] = useState(visit?.guest_full_name ?? '');
    const [guestPhone, setGuestPhone] = useState(visit?.guest_phone ?? '');
    const [guestPosition, setGuestPosition] = useState(visit?.guest_position ?? '');
    const [company, setCompany] = useState(visit?.guest_company_name ?? '');
    const [guestIin, setGuestIin] = useState(visit?.guest_iin ?? '');
    const [startsAt, setStartsAt] = useState(() =>
        visit?.visit_starts_at ? toDateTimeLocalValue(visit.visit_starts_at) : new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
    );
    const [endsAt, setEndsAt] = useState(() => toDateTimeLocalValue(visit?.visit_ends_at));
    const [permitKind, setPermitKind] = useState<'one_time' | 'multi_time'>((visit?.permit_kind as 'one_time' | 'multi_time') ?? 'one_time');
    const [comment, setComment] = useState(visit?.comment ?? '');
    const [vehicles, setVehicles] = useState<VisitVehicle[]>(() => normalizeVisitVehicles(visit?.vehicles));
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        setYardId(visit?.yard_id ?? yards[0]?.id ?? '');
        setGuestName(visit?.guest_full_name ?? '');
        setGuestPhone(visit?.guest_phone ?? '');
        setGuestPosition(visit?.guest_position ?? '');
        setCompany(visit?.guest_company_name ?? '');
        setGuestIin(visit?.guest_iin ?? '');
        setStartsAt(
            visit?.visit_starts_at ? toDateTimeLocalValue(visit.visit_starts_at) : new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
        );
        setEndsAt(toDateTimeLocalValue(visit?.visit_ends_at));
        setPermitKind((visit?.permit_kind as 'one_time' | 'multi_time') ?? 'one_time');
        setComment(visit?.comment ?? '');
        setVehicles(normalizeVisitVehicles(visit?.vehicles));
        setErr(null);
    }, [visit, yards]);

    const updateVehicle = (index: number, plateNumber: string) => {
        setVehicles((current) =>
            current.map((vehicle, vehicleIndex) => (vehicleIndex === index ? { ...vehicle, plate_number: plateNumber.toUpperCase() } : vehicle)),
        );
    };

    const addVehicle = () => {
        setVehicles((current) => [...current, emptyVisitVehicle()]);
    };

    const removeVehicle = (index: number) => {
        setVehicles((current) => {
            const next = current.filter((_, vehicleIndex) => vehicleIndex !== index);
            return next.length > 0 ? next : [emptyVisitVehicle()];
        });
    };

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!yardId) return;
        if (comment.trim() === '') {
            setErr('Укажите цель визита');
            return;
        }
        if (permitKind === 'multi_time' && endsAt.trim() === '') {
            setErr('Для многоразового пропуска укажите дату окончания');
            return;
        }

        setBusy(true);
        setErr(null);
        try {
            await axios.post(visit ? '/api/telegram/miniapp/visits/update' : '/api/telegram/miniapp/visits', {
                init_data: initData,
                id: visit?.id,
                yard_id: yardId,
                guest_full_name: guestName.trim(),
                guest_phone: guestPhone.trim(),
                guest_position: guestPosition.trim(),
                guest_company_name: company.trim() || null,
                guest_iin: guestIin.trim() || null,
                visit_starts_at: startsAt,
                visit_ends_at: permitKind === 'multi_time' ? endsAt || null : null,
                permit_kind: permitKind,
                comment: comment.trim(),
                vehicles: vehicles
                    .filter((vehicle) => vehicle.plate_number.trim() !== '')
                    .map((vehicle) => ({
                        id: vehicle.id,
                        plate_number: vehicle.plate_number.trim(),
                        brand: vehicle.brand ?? null,
                        model: vehicle.model ?? null,
                        color: vehicle.color ?? null,
                        comment: vehicle.comment ?? null,
                    })),
            });
            await onDone();
        } catch (e: unknown) {
            setErr(getErrorMessage(e, visit ? 'Ошибка обновления визита' : 'Ошибка создания визита'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit}>
            <h3>{visit ? 'Редактировать визит' : 'Новый визит'}</h3>
            <label>Площадка</label>
            <select style={input} value={yardId} onChange={(e) => setYardId(Number(e.target.value))} required>
                {yards.map((y) => (
                    <option key={y.id} value={y.id}>
                        {y.name}
                    </option>
                ))}
            </select>
            <label>ФИО гостя</label>
            <input style={input} value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
            <label>Телефон гостя</label>
            <input style={input} value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} required />
            <label>Должность</label>
            <input style={input} value={guestPosition} onChange={(e) => setGuestPosition(e.target.value)} required />
            <label>Компания</label>
            <input style={input} value={company} onChange={(e) => setCompany(e.target.value)} />
            <label>ИИН</label>
            <input style={input} value={guestIin} onChange={(e) => setGuestIin(e.target.value)} />
            <label>Дата и время начала</label>
            <input style={input} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            <label>Тип пропуска</label>
            <select style={input} value={permitKind} onChange={(e) => setPermitKind(e.target.value as 'one_time' | 'multi_time')}>
                <option value="one_time">Разовый</option>
                <option value="multi_time">Многоразовый</option>
            </select>
            {permitKind === 'multi_time' && (
                <>
                    <label>Дата окончания</label>
                    <input style={input} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
                </>
            )}
            <label>Транспорт гостя</label>
            {vehicles.map((vehicle, index) => (
                <div key={`${vehicle.id ?? 'new'}-${index}`} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <input
                        style={{ ...input, margin: 0 }}
                        value={vehicle.plate_number}
                        onChange={(e) => updateVehicle(index, e.target.value)}
                        placeholder={`Гос. номер ТС #${index + 1}`}
                    />
                    <button
                        type="button"
                        style={{ ...smallButtonStyle, background: '#f3d4d4', color: '#7d2424' }}
                        onClick={() => removeVehicle(index)}
                    >
                        Убрать
                    </button>
                </div>
            ))}
            <button type="button" style={{ ...smallButtonStyle, background: '#e0e0e0', color: '#222', marginBottom: 12 }} onClick={addVehicle}>
                Добавить ТС
            </button>
            <label>Цель визита</label>
            <textarea style={{ ...input, minHeight: 60 }} value={comment} onChange={(e) => setComment(e.target.value)} required />
            {err && <p style={{ color: 'crimson' }}>{err}</p>}
            <button type="submit" disabled={busy} style={btn}>
                {busy ? (visit ? 'Сохранение…' : 'Создание…') : visit ? 'Сохранить изменения' : 'Создать визит'}
            </button>
            <button type="button" style={btnSecondary} onClick={onCancel}>
                Отмена
            </button>
        </form>
    );
}

function VisitList({
    visits,
    onBack,
    onEdit,
    onCancelVisit,
}: {
    visits: VisitItem[];
    onBack: () => void;
    onEdit: (visit: VisitItem) => void;
    onCancelVisit: (visit: VisitItem) => Promise<void>;
}) {
    const [busyVisitId, setBusyVisitId] = useState<number | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const handleCancel = async (visit: VisitItem) => {
        if (!window.confirm(`Отозвать гостевой пропуск для ${visit.guest_full_name}?`)) {
            return;
        }

        setBusyVisitId(visit.id);
        setErr(null);

        try {
            await onCancelVisit(visit);
        } catch (error: unknown) {
            setErr(getErrorMessage(error, 'Не удалось отозвать пропуск'));
        } finally {
            setBusyVisitId(null);
        }
    };

    return (
        <>
            <h3>Мои визиты</h3>
            {err && <p style={{ color: 'crimson' }}>{err}</p>}
            {visits.length === 0 && <p>Визитов пока нет.</p>}
            {visits.map((visit) => (
                <div key={visit.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, margin: '8px 0' }}>
                    <strong>{visit.guest_full_name}</strong>
                    <div>Площадка: {visit.yard?.name ?? '—'}</div>
                    <div>Начало: {new Date(visit.visit_starts_at).toLocaleString()}</div>
                    {visit.visit_ends_at && <div>Окончание: {new Date(visit.visit_ends_at).toLocaleString()}</div>}
                    <div>Тип: {visit.permit_kind === 'multi_time' ? 'Многоразовый' : 'Разовый'}</div>
                    {visit.comment && <div>Цель визита: {visit.comment}</div>}
                    {visit.vehicles.length > 0 && <div>ТС: {visit.vehicles.map((vehicle) => vehicle.plate_number).join(', ')}</div>}
                    <div>Статус: {visitStatusLabels[visit.workflow_status] ?? visit.workflow_status}</div>
                    {visit.workflow_status === 'active' && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button
                                type="button"
                                style={{ ...smallButtonStyle, background: '#2481cc', color: '#fff' }}
                                onClick={() => onEdit(visit)}
                                disabled={busyVisitId === visit.id}
                            >
                                Редактировать
                            </button>
                            <button
                                type="button"
                                style={{ ...smallButtonStyle, background: '#f3d4d4', color: '#7d2424' }}
                                onClick={() => handleCancel(visit)}
                                disabled={busyVisitId === visit.id}
                            >
                                {busyVisitId === visit.id ? 'Отзыв…' : 'Отозвать'}
                            </button>
                        </div>
                    )}
                </div>
            ))}
            <button style={btnSecondary} onClick={onBack}>
                ← Назад
            </button>
        </>
    );
}

function SpectechOperatorList({
    requests,
    loading,
    error,
    statusFilter,
    onStatusFilterChange,
    onRefresh,
    onAdvanceStatus,
    onBack,
}: {
    requests: SpectechRequestData[];
    loading: boolean;
    error: string | null;
    statusFilter: string;
    onStatusFilterChange: (value: string) => void;
    onRefresh: () => void;
    onAdvanceStatus: (requestId: number, status: string) => Promise<void>;
    onBack: () => void;
}) {
    const [busyRequestId, setBusyRequestId] = useState<number | null>(null);

    const handleAdvanceStatus = async (requestId: number, currentStatus: string) => {
        const nextStatus = nextSpectechStatus[currentStatus];
        if (!nextStatus) {
            return;
        }

        setBusyRequestId(requestId);

        try {
            await onAdvanceStatus(requestId, nextStatus);
        } finally {
            setBusyRequestId(null);
        }
    };

    return (
        <>
            <h3>Панель оператора спецтехники</h3>
            <p style={{ color: '#666' }}>Здесь видны все заявки на спецтехнику, и ими можно управлять как в панели оператора.</p>
            <label>Фильтр по статусу</label>
            <select style={input} value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
                {spectechStatusOptions.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            <button type="button" style={btnSecondary} onClick={onRefresh} disabled={loading}>
                {loading ? 'Обновление…' : 'Обновить список'}
            </button>
            {error && <p style={{ color: 'crimson' }}>{error}</p>}
            {!loading && requests.length === 0 && <p>Заявок пока нет.</p>}
            <div style={{ display: 'grid', gap: 12 }}>
                {requests.map((request) => (
                    <div
                        key={request.id}
                        style={{
                            opacity: busyRequestId === request.id ? 0.65 : 1,
                            pointerEvents: busyRequestId === request.id ? 'none' : 'auto',
                        }}
                    >
                        <RequestCard request={request} isOperator onStatusChange={() => handleAdvanceStatus(request.id, request.status)} />
                    </div>
                ))}
            </div>
            <button style={btnSecondary} onClick={onBack}>
                ← Назад
            </button>
        </>
    );
}

export default function TelegramMiniApp() {
    const [initData, setInitData] = useState<string>('');
    const [session, setSession] = useState<SessionPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<'home' | 'register' | 'create' | 'edit' | 'visits' | 'spectech-operator'>('home');
    const [visits, setVisits] = useState<VisitItem[]>([]);
    const [selectedVisit, setSelectedVisit] = useState<VisitItem | null>(null);
    const [spectechRequests, setSpectechRequests] = useState<SpectechRequestData[]>([]);
    const [spectechLoading, setSpectechLoading] = useState(false);
    const [spectechError, setSpectechError] = useState<string | null>(null);
    const [spectechStatusFilter, setSpectechStatusFilter] = useState('');

    useEffect(() => {
        const initTelegram = async () => {
            try {
                let waitCount = 0;
                while (!window.Telegram && waitCount < 10) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                    waitCount++;
                }

                const tg = window.Telegram?.WebApp;
                if (!tg) {
                    setLoading(false);
                    setError('Telegram WebApp SDK не доступен. Откройте это из Telegram бота.');
                    console.error('[TG] WebApp SDK not found after waiting');
                    return;
                }

                tg.ready?.();
                tg.expand?.();
                document.body.style.margin = '0';
                document.body.style.padding = '0';
                document.body.style.backgroundColor = '#fff';

                const data = tg.initData ?? '';
                console.log('[TG] initData:', data ? data.substring(0, 50) + '...' : 'empty');
                setInitData(data);

                if (!data) {
                    setLoading(false);
                    setError('Mini App доступен только из Telegram.');
                    console.warn('[TG] No initData available');
                    return;
                }

                const response = await axios.post(
                    '/api/telegram/miniapp/session',
                    { init_data: data },
                    {
                        headers: {
                            'X-Telegram-Init-Data': data,
                            'Content-Type': 'application/json',
                        },
                    },
                );
                console.log('[TG] Session loaded:', response.data.data);
                setSession(response.data.data);
            } catch (err: unknown) {
                console.error('[TG] Initialization error:', err);
                setError(getErrorMessage(err, 'Ошибка инициализации'));
            } finally {
                setLoading(false);
            }
        };

        initTelegram();
    }, []);

    const reload = useCallback(async () => {
        if (!initData) return;
        const response = await axios.post('/api/telegram/miniapp/session', { init_data: initData });
        setSession(response.data.data);
    }, [initData]);

    const loadVisits = useCallback(() => {
        if (!initData) return Promise.resolve();

        return axios
            .get('/api/telegram/miniapp/visits', {
                params: { init_data: initData },
                headers: { 'X-Telegram-Init-Data': initData },
            })
            .then((response) => setVisits(response.data.data))
            .catch(() => setVisits([]));
    }, [initData]);

    useEffect(() => {
        if (view !== 'visits' || !initData) return;
        void loadVisits();
    }, [view, initData, loadVisits]);

    const loadOperatorSpectechRequests = useCallback(async () => {
        if (!initData || !session?.can_manage_spectech) {
            return;
        }

        setSpectechLoading(true);
        setSpectechError(null);

        try {
            const response = await axios.get('/api/telegram/miniapp/operator/spectech/requests', {
                params: {
                    init_data: initData,
                    ...(spectechStatusFilter ? { status: spectechStatusFilter } : {}),
                },
                headers: { 'X-Telegram-Init-Data': initData },
            });

            setSpectechRequests(response.data.data ?? []);
        } catch (err: unknown) {
            setSpectechRequests([]);
            setSpectechError(getErrorMessage(err, 'Не удалось загрузить заявки спецтехники'));
        } finally {
            setSpectechLoading(false);
        }
    }, [initData, session?.can_manage_spectech, spectechStatusFilter]);

    useEffect(() => {
        if (view !== 'spectech-operator' || !initData || !session?.can_manage_spectech) {
            return;
        }

        void loadOperatorSpectechRequests();
    }, [view, initData, session?.can_manage_spectech, loadOperatorSpectechRequests]);

    const handleVisitSaved = useCallback(async () => {
        await loadVisits();
        setSelectedVisit(null);
        setView('visits');
    }, [loadVisits]);

    const cancelVisit = useCallback(
        async (visit: VisitItem) => {
            await axios.post(
                '/api/telegram/miniapp/visits/cancel',
                {
                    init_data: initData,
                    id: visit.id,
                },
                {
                    headers: { 'X-Telegram-Init-Data': initData },
                },
            );

            await loadVisits();
        },
        [initData, loadVisits],
    );

    const advanceSpectechStatus = useCallback(
        async (requestId: number, status: string) => {
            await axios.patch(
                `/api/telegram/miniapp/operator/spectech/requests/${requestId}/status`,
                {
                    init_data: initData,
                    status,
                },
                {
                    headers: { 'X-Telegram-Init-Data': initData },
                },
            );

            await loadOperatorSpectechRequests();
        },
        [initData, loadOperatorSpectechRequests],
    );

    if (loading)
        return (
            <Wrap>
                <p>Загрузка…</p>
            </Wrap>
        );

    if (error) {
        return (
            <Wrap>
                <div style={{ padding: 16, background: '#ffe0e0', borderRadius: 8, marginBottom: 16 }}>
                    <p style={{ color: '#c0392b', margin: 0, fontWeight: 'bold' }}>Ошибка</p>
                    <p style={{ color: '#c0392b', margin: '8px 0 0 0' }}>{error}</p>
                    <details style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                        <summary>Диагностика</summary>
                        <pre style={{ overflow: 'auto', background: '#fff', padding: 8, borderRadius: 4 }}>
                            Telegram SDK: {typeof window.Telegram !== 'undefined' ? 'загружен' : 'не найден'}
                            WebApp: {typeof window.Telegram?.WebApp !== 'undefined' ? 'доступен' : 'не доступен'}
                            initData: {initData ? 'присутствует' : 'отсутствует'}
                        </pre>
                    </details>
                </div>
            </Wrap>
        );
    }

    if (!session)
        return (
            <Wrap>
                <p>Нет данных</p>
            </Wrap>
        );

    const status = session.approval_status;

    return (
        <Wrap>
            <Head title="Кабинет Telegram" />
            <h2 style={{ marginTop: 0 }}>Личный кабинет</h2>
            <StatusBadge status={status} reason={session.rejection_reason} />

            {(status === 'none' || status === 'rejected') && view !== 'register' && (
                <>
                    <p>Чтобы пользоваться ботом, представьтесь.</p>
                    <button onClick={() => setView('register')} style={btn}>
                        Заполнить ФИО и телефон
                    </button>
                </>
            )}

            {view === 'register' && (
                <RegistrationForm
                    initData={initData}
                    initial={session.profile}
                    onDone={async () => {
                        await reload();
                        setView('home');
                    }}
                />
            )}

            {status === 'awaiting_review' && view === 'home' && <p>Ваша заявка отправлена администратору. Дождитесь подтверждения.</p>}

            {status === 'blocked' && <p style={{ color: 'crimson' }}>Доступ заблокирован администратором.</p>}

            {status === 'approved' && view === 'home' && (
                <Dashboard
                    session={session}
                    onCreate={() => setView('create')}
                    onVisits={() => setView('visits')}
                    onOperatorSpectech={() => setView('spectech-operator')}
                />
            )}

            {status === 'approved' && view === 'create' && (
                <CreateVisitForm initData={initData} yards={session.yards} onDone={handleVisitSaved} onCancel={() => setView('home')} />
            )}

            {status === 'approved' && view === 'edit' && selectedVisit && (
                <CreateVisitForm
                    initData={initData}
                    yards={session.yards}
                    visit={selectedVisit}
                    onDone={handleVisitSaved}
                    onCancel={() => {
                        setSelectedVisit(null);
                        setView('visits');
                    }}
                />
            )}

            {status === 'approved' && view === 'visits' && (
                <VisitList
                    visits={visits}
                    onBack={() => setView('home')}
                    onEdit={(visit) => {
                        setSelectedVisit(visit);
                        setView('edit');
                    }}
                    onCancelVisit={cancelVisit}
                />
            )}

            {status === 'approved' && view === 'spectech-operator' && session.can_manage_spectech && (
                <SpectechOperatorList
                    requests={spectechRequests}
                    loading={spectechLoading}
                    error={spectechError}
                    statusFilter={spectechStatusFilter}
                    onStatusFilterChange={setSpectechStatusFilter}
                    onRefresh={() => void loadOperatorSpectechRequests()}
                    onAdvanceStatus={advanceSpectechStatus}
                    onBack={() => setView('home')}
                />
            )}
        </Wrap>
    );
}
