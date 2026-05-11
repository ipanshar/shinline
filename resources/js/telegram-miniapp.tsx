/**
 * Standalone Telegram Mini App entry point.
 * Не использует Inertia — монтируется напрямую без зависимостей.
 */
import { createRoot } from 'react-dom/client';
import { useState, useEffect, useCallback, FormEvent } from 'react';
import axios from 'axios';

// Без CSRF/credentials — Mini App авторизуется через initData
axios.defaults.withCredentials = false;

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
                    onClick: (callback: () => void) => void;
                    offClick: (callback: () => void) => void;
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
    visit_ends_at: string | null;
    workflow_status: string;
    permit_kind: string;
    visit_starts_at: string;
    comment: string | null;
    vehicles: VisitVehicle[];
    yard?: { id: number; name: string };
}

interface ActiveVisitorItem {
    id: number;
    yard_id: number;
    yard?: { id: number; name: string } | null;
    truck_id: number | null;
    plate_number: string;
    entry_date: string;
    company: string | null;
    name: string | null;
    exit_permit_required: boolean;
    has_active_exit_permit: boolean;
    exit_permit: {
        id: number;
        valid_until: string | null;
        comment: string | null;
    } | null;
}

interface SpectechTruckOption {
    id: number;
    name?: string | null;
    plate_number?: string | null;
}

interface SpectechRequestItem {
    id: number;
    equipment_name: string;
    plate_number?: string | null;
    start_date: string;
    end_date: string;
    terminal: string;
    zone: string;
    gate?: string | null;
    address: string;
    comment?: string | null;
    status: string;
    status_label: string;
    created_at?: string | null;
}


const STATUS_LABELS: Record<SessionPayload['approval_status'], string> = {
    none: 'Не зарегистрирован',
    awaiting_review: 'Ожидает подтверждения',
    approved: 'Подтверждён',
    rejected: 'Отклонён',
    blocked: 'Заблокирован',
};

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
const btnDanger: React.CSSProperties = { ...btn, background: '#c0392b' };

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: 10,
    margin: '4px 0 12px',
    borderRadius: 8,
    border: '1px solid #ccc',
    fontSize: 16,
    boxSizing: 'border-box',
};

const smallButtonStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
};

const visitStatusLabels: Record<string, string> = {
    active: 'Активный',
    closed: 'Закрыт',
    canceled: 'Отозван',
};

const spectechStatusLabels: Record<string, string> = {
    new: 'Новая',
    departure: 'Выезд',
    on_location: 'На объекте',
    work_started: 'Работы начаты',
    completed: 'Выполнено',
    returned: 'Возврат',
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

const getErrorMessage = (error: any, fallback: string) => {
    const validationErrors = error?.response?.data?.errors;

    if (validationErrors && typeof validationErrors === 'object') {
        const firstMessage = Object.values(validationErrors)
            .flat()
            .find((message): message is string => typeof message === 'string' && message.trim() !== '');

        if (firstMessage) {
            return firstMessage;
        }
    }

    return error?.response?.data?.message ?? fallback;
};

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: 16 }}>
        {children}
    </div>
);

function StatusBadge({ status, reason }: { status: SessionPayload['approval_status']; reason: string | null }) {
    const colors: Record<SessionPayload['approval_status'], string> = {
        none: '#888',
        awaiting_review: '#d4a017',
        approved: '#2e8b2e',
        rejected: '#c0392b',
        blocked: '#7d2424',
    };
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
    onDone: () => void;
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
            onDone();
        } catch (e: any) {
            setErr(e.response?.data?.message ?? 'Ошибка отправки');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit}>
            <h3>Регистрация</h3>
            <label>ФИО</label>
            <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            <label>Телефон</label>
            <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7..." required />
            {err && <p style={{ color: 'crimson' }}>{err}</p>}
            <button type="submit" disabled={busy} style={btn}>{busy ? 'Отправка…' : 'Отправить заявку'}</button>
        </form>
    );
}

function Dashboard({
    session,
    onCreate,
    onVisits,
    onExitPermits,
    onSpectechCreate,
    onSpectechRequests,
}: {
    session: SessionPayload;
    onCreate: () => void;
    onVisits: () => void;
    onExitPermits: () => void;
    onSpectechCreate: () => void;
    onSpectechRequests: () => void;
}) {
    return (
        <>
            <p>Добро пожаловать, <strong>{session.user?.name ?? session.profile.full_name}</strong>!</p>
            <p>Площадки: {session.yards.length === 0 ? 'не назначены' : session.yards.map((y) => y.name).join(', ')}</p>
            <button style={btn} onClick={onCreate} disabled={session.yards.length === 0}>Создать гостевой визит</button>
            <button style={btn} onClick={onExitPermits} disabled={session.yards.length === 0}>Разрешить выезд ТС</button>
            <hr style={{ margin: '8px 0', borderColor: '#ddd' }} />
            <button style={btn} onClick={onSpectechCreate}>Создать заявку на спецтехнику</button>
            <button style={btnSecondary} onClick={onSpectechRequests}>Мои заявки</button>
            <hr style={{ margin: '8px 0', borderColor: '#ddd' }} />
            <button style={btnSecondary} onClick={onVisits}>Мои визиты</button>
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
    const [startsAt, setStartsAt] = useState(() => visit?.visit_starts_at ? toDateTimeLocalValue(visit.visit_starts_at) : new Date(Date.now() + 3600_000).toISOString().slice(0, 16));
    const [endsAt, setEndsAt] = useState(() => toDateTimeLocalValue(visit?.visit_ends_at));
    const [permitKind, setPermitKind] = useState<'one_time' | 'multi_time'>((visit?.permit_kind as 'one_time' | 'multi_time') ?? 'one_time');
    const [visitPurpose, setVisitPurpose] = useState(visit?.comment ?? '');
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
        setStartsAt(visit?.visit_starts_at ? toDateTimeLocalValue(visit.visit_starts_at) : new Date(Date.now() + 3600_000).toISOString().slice(0, 16));
        setEndsAt(toDateTimeLocalValue(visit?.visit_ends_at));
        setPermitKind((visit?.permit_kind as 'one_time' | 'multi_time') ?? 'one_time');
        setVisitPurpose(visit?.comment ?? '');
        setVehicles(normalizeVisitVehicles(visit?.vehicles));
        setErr(null);
    }, [visit, yards]);

    const updateVehicle = (index: number, plateNumber: string) => {
        setVehicles((current) => current.map((vehicle, vehicleIndex) => (
            vehicleIndex === index
                ? { ...vehicle, plate_number: plateNumber.toUpperCase() }
                : vehicle
        )));
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
        if (visitPurpose.trim() === '') {
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
                comment: visitPurpose.trim(),
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
        } catch (e: any) {
            setErr(getErrorMessage(e, visit ? 'Ошибка обновления визита' : 'Ошибка создания визита'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit}>
            <h3>Новый визит</h3>
            <label>Площадка</label>
            <select style={inputStyle} value={yardId} onChange={(e) => setYardId(Number(e.target.value))} required>
                {yards.map((y) => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                ))}
            </select>
            <label>ФИО гостя</label>
            <input style={inputStyle} value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
            <label>Телефон гостя</label>
            <input style={inputStyle} value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} required />
            <label>Должность</label>
            <input style={inputStyle} value={guestPosition} onChange={(e) => setGuestPosition(e.target.value)} required />
            <label>Компания</label>
            <input style={inputStyle} value={company} onChange={(e) => setCompany(e.target.value)} />
            <label>ИИН</label>
            <input style={inputStyle} value={guestIin} onChange={(e) => setGuestIin(e.target.value)} />
            <label>Дата и время начала</label>
            <input style={inputStyle} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            <label>Тип пропуска</label>
            <select style={inputStyle} value={permitKind} onChange={(e) => setPermitKind(e.target.value as 'one_time' | 'multi_time')}>
                <option value="one_time">Разовый</option>
                <option value="multi_time">Многоразовый</option>
            </select>
            {permitKind === 'multi_time' && (
                <>
                    <label>Дата окончания</label>
                    <input style={inputStyle} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} required />
                </>
            )}
            <label>Транспорт гостя</label>
            {vehicles.map((vehicle, index) => (
                <div key={`${vehicle.id ?? 'new'}-${index}`} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <input
                        style={{ ...inputStyle, margin: 0 }}
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
            <textarea style={{ ...inputStyle, minHeight: 60 }} value={visitPurpose} onChange={(e) => setVisitPurpose(e.target.value)} required />
            {err && <p style={{ color: 'crimson' }}>{err}</p>}
            <button type="submit" disabled={busy} style={btn}>{busy ? (visit ? 'Сохранение…' : 'Создание…') : (visit ? 'Сохранить изменения' : 'Создать визит')}</button>
            <button type="button" style={btnSecondary} onClick={onCancel}>Отмена</button>
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
        } catch (error: any) {
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
            {visits.map((v) => (
                <div key={v.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, margin: '8px 0' }}>
                    <strong>{v.guest_full_name}</strong>
                    <div>Площадка: {v.yard?.name ?? '—'}</div>
                    <div>Начало: {new Date(v.visit_starts_at).toLocaleString()}</div>
                    {v.visit_ends_at && <div>Окончание: {new Date(v.visit_ends_at).toLocaleString()}</div>}
                    <div>Тип: {v.permit_kind === 'multi_time' ? 'Многоразовый' : 'Разовый'}</div>
                    {v.comment && <div>Цель визита: {v.comment}</div>}
                    {v.vehicles.length > 0 && <div>ТС: {v.vehicles.map((vehicle) => vehicle.plate_number).join(', ')}</div>}
                    <div>Статус: {visitStatusLabels[v.workflow_status] ?? v.workflow_status}</div>
                    {v.workflow_status === 'active' && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button
                                type="button"
                                style={{ ...smallButtonStyle, background: '#2481cc', color: '#fff' }}
                                onClick={() => onEdit(v)}
                                disabled={busyVisitId === v.id}
                            >
                                Редактировать
                            </button>
                            <button
                                type="button"
                                style={{ ...smallButtonStyle, background: '#f3d4d4', color: '#7d2424' }}
                                onClick={() => handleCancel(v)}
                                disabled={busyVisitId === v.id}
                            >
                                {busyVisitId === v.id ? 'Отзыв…' : 'Отозвать'}
                            </button>
                        </div>
                    )}
                </div>
            ))}
            <button style={btnSecondary} onClick={onBack}>← Назад</button>
        </>
    );
}

function ExitPermitList({
    initData,
    yards,
    visitors,
    onReload,
    onBack,
}: {
    initData: string;
    yards: YardOption[];
    visitors: ActiveVisitorItem[];
    onReload: () => void;
    onBack: () => void;
}) {
    const [yardId, setYardId] = useState<number | 'all'>('all');
    const [search, setSearch] = useState('');
    const [comment, setComment] = useState('');
    const [busyVisitorId, setBusyVisitorId] = useState<number | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const normalizedSearch = search.trim().toLowerCase().replace(/[\s-]/g, '');
    const filteredVisitors = visitors
        .filter((visitor) => {
            if (yardId !== 'all' && visitor.yard_id !== yardId) return false;
            if (!normalizedSearch) return true;

            return visitor.plate_number.toLowerCase().replace(/[\s-]/g, '').includes(normalizedSearch);
        })
        .sort((left, right) => {
            if (left.exit_permit_required !== right.exit_permit_required) {
                return left.exit_permit_required ? -1 : 1;
            }

            if (left.has_active_exit_permit !== right.has_active_exit_permit) {
                return left.has_active_exit_permit ? 1 : -1;
            }

            return new Date(left.entry_date).getTime() - new Date(right.entry_date).getTime();
        });

    const createPermit = async (visitor: ActiveVisitorItem) => {
        setBusyVisitorId(visitor.id);
        setErr(null);
        try {
            await axios.post('/api/telegram/miniapp/exit-permits', {
                init_data: initData,
                visitor_id: visitor.id,
                comment: comment || null,
            }, {
                headers: { 'X-Telegram-Init-Data': initData },
            });
            setComment('');
            onReload();
        } catch (e: any) {
            setErr(e.response?.data?.message ?? 'Не удалось создать разрешение на выезд');
        } finally {
            setBusyVisitorId(null);
        }
    };

    return (
        <>
            <h3>Разрешение на выезд</h3>
            <label>Площадка</label>
            <select style={inputStyle} value={yardId} onChange={(e) => setYardId(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                <option value="all">Все площадки</option>
                {yards.map((y) => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                ))}
            </select>
            <label>Поиск по номеру</label>
            <input style={inputStyle} value={search} onChange={(e) => setSearch(e.target.value.toUpperCase())} placeholder="Например, 123ABC" />
            <label>Комментарий к разрешению</label>
            <textarea style={{ ...inputStyle, minHeight: 56 }} value={comment} onChange={(e) => setComment(e.target.value)} />
            {err && <p style={{ color: 'crimson' }}>{err}</p>}
            {filteredVisitors.length === 0 && <p>Активных ТС не найдено.</p>}
            {filteredVisitors.map((visitor) => (
                <div key={visitor.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, margin: '8px 0' }}>
                    <strong>{visitor.plate_number || 'Без номера'}</strong>
                    <div>Площадка: {visitor.yard?.name ?? '—'}</div>
                    <div>Въезд: {new Date(visitor.entry_date).toLocaleString()}</div>
                    {visitor.company && <div>Компания: {visitor.company}</div>}
                    {!visitor.exit_permit_required ? (
                        <div style={{ marginTop: 8, color: '#555' }}>Свободный выезд: Telegram-разрешение не требуется.</div>
                    ) : visitor.has_active_exit_permit ? (
                        <div style={{ marginTop: 8, color: '#2e8b2e' }}>
                            Разрешение активно до {visitor.exit_permit?.valid_until ? new Date(visitor.exit_permit.valid_until).toLocaleString() : 'без срока'}
                        </div>
                    ) : (
                        <button
                            type="button"
                            style={btn}
                            disabled={busyVisitorId === visitor.id}
                            onClick={() => createPermit(visitor)}
                        >
                            {busyVisitorId === visitor.id ? 'Создание…' : 'Разрешить выезд'}
                        </button>
                    )}
                </div>
            ))}
            <button style={btnSecondary} onClick={onBack}>← Назад</button>
        </>
    );
}

function SpectechCreateForm({
    initData,
    onDone,
    onCancel,
}: {
    initData: string;
    onDone: () => void | Promise<void>;
    onCancel: () => void;
}) {
    const [trucks, setTrucks] = useState<SpectechTruckOption[]>([]);
    const [truckId, setTruckId] = useState<number | ''>('');
    const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [terminal, setTerminal] = useState('T1');
    const [zone, setZone] = useState('');
    const [gate, setGate] = useState('');
    const [address, setAddress] = useState('');
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);
    const [loadingTrucks, setLoadingTrucks] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        setLoadingTrucks(true);
        axios
            .get<{ data: SpectechTruckOption[] }>('/api/telegram/miniapp/spectech/trucks', {
                params: { init_data: initData },
                headers: { 'X-Telegram-Init-Data': initData },
            })
            .then((response) => {
                setTrucks(response.data.data ?? []);
            })
            .catch(() => {
                setErr('Не удалось загрузить список спецтехники');
            })
            .finally(() => setLoadingTrucks(false));
    }, [initData]);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!truckId) {
            setErr('Выберите технику');
            return;
        }

        setBusy(true);
        setErr(null);
        try {
            await axios.post('/api/telegram/miniapp/spectech/requests', {
                init_data: initData,
                truck_id: truckId,
                end_date: endDate,
                terminal,
                zone: zone.trim(),
                gate: gate.trim() || null,
                address: address.trim(),
                comment: comment.trim() || null,
                photos: [],
            }, {
                headers: { 'X-Telegram-Init-Data': initData },
            });

            await onDone();
        } catch (error: any) {
            setErr(getErrorMessage(error, 'Не удалось создать заявку'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit}>
            <h3>Новая заявка на спецтехнику</h3>
            <label>Техника</label>
            <select
                style={inputStyle}
                value={truckId}
                onChange={(e) => setTruckId(e.target.value ? Number(e.target.value) : '')}
                disabled={loadingTrucks}
                required
            >
                <option value="">{loadingTrucks ? 'Загрузка...' : 'Выберите технику'}</option>
                {trucks.map((truck) => (
                    <option key={truck.id} value={truck.id}>
                        {(truck.name || 'Без названия') + (truck.plate_number ? ` (${truck.plate_number})` : ' (без номера)')}
                    </option>
                ))}
            </select>

            <label>Дата окончания</label>
            <input style={inputStyle} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />

            <label>Терминал</label>
            <select style={inputStyle} value={terminal} onChange={(e) => setTerminal(e.target.value)} required>
                <option value="T1">T1</option>
                <option value="T2">T2</option>
                <option value="T3">T3</option>
                <option value="T4">T4</option>
            </select>

            <label>Зона / объект</label>
            <input style={inputStyle} value={zone} onChange={(e) => setZone(e.target.value)} required />

            <label>Гейт</label>
            <input style={inputStyle} value={gate} onChange={(e) => setGate(e.target.value)} />

            <label>Адрес</label>
            <input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} required />

            <label>Комментарий</label>
            <textarea style={{ ...inputStyle, minHeight: 60 }} value={comment} onChange={(e) => setComment(e.target.value)} />

            {err && <p style={{ color: 'crimson' }}>{err}</p>}
            <button type="submit" disabled={busy} style={btn}>{busy ? 'Создание…' : 'Создать заявку'}</button>
            <button type="button" style={btnSecondary} onClick={onCancel}>Отмена</button>
        </form>
    );
}

function SpectechRequestList({
    requests,
    onBack,
    onCreate,
}: {
    requests: SpectechRequestItem[];
    onBack: () => void;
    onCreate: () => void;
}) {
    return (
        <>
            <h3>Мои заявки на спецтехнику</h3>
            {requests.length === 0 && <p>Заявок пока нет.</p>}
            {requests.map((request) => (
                <div key={request.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, margin: '8px 0' }}>
                    <strong>#{request.id} {request.equipment_name}</strong>
                    <div>Статус: {request.status_label || spectechStatusLabels[request.status] || request.status}</div>
                    <div>Период: {request.start_date} - {request.end_date}</div>
                    <div>Локация: {request.terminal} / {request.zone}{request.gate ? ` / ${request.gate}` : ''}</div>
                    <div>Адрес: {request.address}</div>
                    {request.comment && <div>Комментарий: {request.comment}</div>}
                    {request.created_at && <div>Создана: {new Date(request.created_at).toLocaleString()}</div>}
                </div>
            ))}
            <button style={btn} onClick={onCreate}>Создать новую заявку</button>
            <button style={btnSecondary} onClick={onBack}>← Назад</button>
        </>
    );
}

// ── Главный компонент ─────────────────────────────────────────────────────────

function TelegramMiniApp() {
    const [initData, setInitData] = useState<string>('');
    const [session, setSession] = useState<SessionPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<'home' | 'register' | 'create' | 'edit' | 'visits' | 'exit-permits' | 'spectech-create' | 'spectech-requests'>('home');
    const [visits, setVisits] = useState<VisitItem[]>([]);
    const [activeVisitors, setActiveVisitors] = useState<ActiveVisitorItem[]>([]);
    const [spectechRequests, setSpectechRequests] = useState<SpectechRequestItem[]>([]);
    const [selectedVisit, setSelectedVisit] = useState<VisitItem | null>(null);

    useEffect(() => {
        const run = async () => {
            try {
                // Ждём SDK — он синхронно грузится до этого скрипта,
                // но на медленных Android может быть задержка
                let attempts = 0;
                while (!window.Telegram?.WebApp && attempts < 50) {
                    await new Promise((r) => setTimeout(r, 100));
                    attempts++;
                }

                const tg = window.Telegram?.WebApp;
                if (!tg) {
                    setError('Откройте Mini App через Telegram бота.');
                    return;
                }

                tg.ready();
                tg.expand();

                const data = tg.initData ?? '';
                if (!data) {
                    setError('Mini App доступен только из Telegram.');
                    return;
                }

                setInitData(data);

                const { data: body } = await axios.post<{ data: SessionPayload }>(
                    '/api/telegram/miniapp/session',
                    { init_data: data },
                    { headers: { 'X-Telegram-Init-Data': data }, timeout: 15000 }
                );
                setSession(body.data);
            } catch (e: any) {
                const msg =
                    e.response?.data?.message ??
                    (e.response?.status ? `HTTP ${e.response.status}: ${e.response.statusText}` : e.message) ??
                    'Неизвестная ошибка';
                setError(msg);
            } finally {
                setLoading(false);
            }
        };

        run();
    }, []);

    const reload = useCallback(async () => {
        if (!initData) return;
        const { data: body } = await axios.post<{ data: SessionPayload }>(
            '/api/telegram/miniapp/session',
            { init_data: initData },
            { headers: { 'X-Telegram-Init-Data': initData } }
        );
        setSession(body.data);
    }, [initData]);

    const loadVisits = useCallback(() => {
        if (!initData) return Promise.resolve();

        return axios
            .get<{ data: VisitItem[] }>('/api/telegram/miniapp/visits', {
                params: { init_data: initData },
                headers: { 'X-Telegram-Init-Data': initData },
            })
            .then((r) => setVisits(r.data.data))
            .catch(() => setVisits([]));
    }, [initData]);

    useEffect(() => {
        if (view !== 'visits' || !initData) return;
        void loadVisits();
    }, [view, initData, loadVisits]);

    const loadActiveVisitors = useCallback(() => {
        if (!initData) return;
        axios
            .get<{ data: ActiveVisitorItem[] }>('/api/telegram/miniapp/active-visitors', {
                params: { init_data: initData },
                headers: { 'X-Telegram-Init-Data': initData },
            })
            .then((r) => setActiveVisitors(r.data.data))
            .catch(() => setActiveVisitors([]));
    }, [initData]);

    useEffect(() => {
        if (view !== 'exit-permits') return;
        loadActiveVisitors();
    }, [view, loadActiveVisitors]);

    const handleVisitSaved = useCallback(async () => {
        await loadVisits();
        setSelectedVisit(null);
        setView('visits');
    }, [loadVisits]);

    const cancelVisit = useCallback(async (visit: VisitItem) => {
        await axios.post(
            '/api/telegram/miniapp/visits/cancel',
            {
                init_data: initData,
                id: visit.id,
            },
            {
                headers: { 'X-Telegram-Init-Data': initData },
            }
        );

        await loadVisits();
    }, [initData, loadVisits]);

    const loadSpectechRequests = useCallback(() => {
        if (!initData) return Promise.resolve();

        return axios
            .get<{ data: SpectechRequestItem[] }>('/api/telegram/miniapp/spectech/requests', {
                params: { init_data: initData },
                headers: { 'X-Telegram-Init-Data': initData },
            })
            .then((response) => setSpectechRequests(response.data.data ?? []))
            .catch(() => setSpectechRequests([]));
    }, [initData]);

    useEffect(() => {
        if (view !== 'spectech-requests') return;
        void loadSpectechRequests();
    }, [view, loadSpectechRequests]);

    const handleSpectechCreated = useCallback(async () => {
        await loadSpectechRequests();
        setView('spectech-requests');
    }, [loadSpectechRequests]);

    if (loading) {
        return (
            <Wrap>
                <p style={{ textAlign: 'center', padding: 32, color: '#555' }}>Загрузка…</p>
            </Wrap>
        );
    }

    if (error) {
        return (
            <Wrap>
                <div style={{ padding: 16, background: '#ffe0e0', borderRadius: 8 }}>
                    <p style={{ color: '#c0392b', margin: 0, fontWeight: 'bold' }}>Ошибка</p>
                    <p style={{ color: '#c0392b', margin: '8px 0 0' }}>{error}</p>
                    <p style={{ fontSize: 12, color: '#888', margin: '8px 0 0' }}>
                        SDK: {window.Telegram ? 'есть' : 'нет'} |
                        WebApp: {window.Telegram?.WebApp ? 'есть' : 'нет'}
                    </p>
                </div>
            </Wrap>
        );
    }

    if (!session) return <Wrap><p>Нет данных</p></Wrap>;

    const status = session.approval_status;

    return (
        <Wrap>
            <h2 style={{ marginTop: 0 }}>Личный кабинет</h2>
            <StatusBadge status={status} reason={session.rejection_reason} />

            {(status === 'none' || status === 'rejected') && view !== 'register' && (
                <>
                    <p>Чтобы пользоваться ботом, представьтесь.</p>
                    <button onClick={() => setView('register')} style={btn}>Заполнить ФИО и телефон</button>
                </>
            )}

            {view === 'register' && (
                <RegistrationForm
                    initData={initData}
                    initial={session.profile}
                    onDone={async () => { await reload(); setView('home'); }}
                />
            )}

            {status === 'awaiting_review' && view === 'home' && (
                <p>Ваша заявка отправлена. Дождитесь подтверждения администратора.</p>
            )}

            {status === 'blocked' && (
                <p style={{ color: 'crimson' }}>Доступ заблокирован администратором.</p>
            )}

            {status === 'approved' && view === 'home' && (
                <Dashboard
                    session={session}
                    onCreate={() => setView('create')}
                    onVisits={() => setView('visits')}
                    onExitPermits={() => setView('exit-permits')}
                    onSpectechCreate={() => setView('spectech-create')}
                    onSpectechRequests={() => setView('spectech-requests')}
                />
            )}

            {status === 'approved' && view === 'create' && (
                <CreateVisitForm
                    initData={initData}
                    yards={session.yards}
                    onDone={handleVisitSaved}
                    onCancel={() => setView('home')}
                />
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

            {status === 'approved' && view === 'exit-permits' && (
                <ExitPermitList
                    initData={initData}
                    yards={session.yards}
                    visitors={activeVisitors}
                    onReload={loadActiveVisitors}
                    onBack={() => setView('home')}
                />
            )}

            {status === 'approved' && view === 'spectech-create' && (
                <SpectechCreateForm
                    initData={initData}
                    onDone={handleSpectechCreated}
                    onCancel={() => setView('home')}
                />
            )}

            {status === 'approved' && view === 'spectech-requests' && (
                <SpectechRequestList
                    requests={spectechRequests}
                    onCreate={() => setView('spectech-create')}
                    onBack={() => setView('home')}
                />
            )}
        </Wrap>
    );
}

// ── Монтирование без Inertia ──────────────────────────────────────────────────

const el = document.getElementById('telegram-app');
if (el) {
    // Убираем placeholder
    el.innerHTML = '';
    createRoot(el).render(<TelegramMiniApp />);
}
