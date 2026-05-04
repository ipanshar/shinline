import { Head } from '@inertiajs/react';
import { useState, useEffect, useCallback, FormEvent } from 'react';
import axios from 'axios';

// Настройка axios для Telegram Mini App
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
    guest_full_name: string;
    workflow_status: string;
    permit_kind: string;
    visit_starts_at: string;
    yard?: { id: number; name: string };
}

const STATUS_LABELS: Record<SessionPayload['approval_status'], string> = {
    none: 'Не зарегистрирован',
    awaiting_review: 'Ожидает подтверждения',
    approved: 'Подтверждён',
    rejected: 'Отклонён',
    blocked: 'Заблокирован',
};

export default function TelegramMiniApp() {
    const [initData, setInitData] = useState<string>('');
    const [session, setSession] = useState<SessionPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<'home' | 'register' | 'create' | 'visits'>('home');
    const [visits, setVisits] = useState<VisitItem[]>([]);

    useEffect(() => {
        // Инициализация Telegram WebApp SDK
        const initTelegram = async () => {
            try {
                // Ждем когда SDK загрузится (особенно важно на мобильном Android)
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

                // Инициализируем SDK
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

                // Загружаем сессию - отправляем initData в headers и body для надежности
                const response = await axios.post(
                    '/api/telegram/miniapp/session',
                    { init_data: data },
                    {
                        headers: {
                            'X-Telegram-Init-Data': data,
                            'Content-Type': 'application/json',
                        },
                    }
                );
                console.log('[TG] Session loaded:', response.data.data);
                setSession(response.data.data);
            } catch (err: any) {
                console.error('[TG] Initialization error:', err);
                const errorMsg = 
                    err.response?.data?.message ?? 
                    err.response?.status ? `HTTP ${err.response.status}` :
                    err.message ?? 
                    'Ошибка инициализации';
                setError(errorMsg);
            } finally {
                setLoading(false);
            }
        };

        initTelegram();
    }, []);

    const reload = useCallback(async () => {
        if (!initData) return;
        const r = await axios.post('/api/telegram/miniapp/session', { init_data: initData });
        setSession(r.data.data);
    }, [initData]);

    useEffect(() => {
        if (view !== 'visits' || !initData) return;
        axios
            .get('/api/telegram/miniapp/visits', { params: { init_data: initData } })
            .then((r) => setVisits(r.data.data))
            .catch(() => setVisits([]));
    }, [view, initData]);

    if (loading) return <Wrap><p>Загрузка…</p></Wrap>;
    if (error) return (
        <Wrap>
            <div style={{ 
                padding: 16, 
                background: '#ffe0e0', 
                borderRadius: 8, 
                marginBottom: 16 
            }}>
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
    if (!session) return <Wrap><p>Нет данных</p></Wrap>;

    const status = session.approval_status;

    return (
        <Wrap>
            <Head title="Кабинет Telegram" />
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
                    onDone={async () => {
                        await reload();
                        setView('home');
                    }}
                />
            )}

            {status === 'awaiting_review' && view === 'home' && (
                <p>Ваша заявка отправлена администратору. Дождитесь подтверждения.</p>
            )}

            {status === 'blocked' && (
                <p style={{ color: 'crimson' }}>Доступ заблокирован администратором.</p>
            )}

            {status === 'approved' && view === 'home' && (
                <Dashboard
                    session={session}
                    onCreate={() => setView('create')}
                    onVisits={() => setView('visits')}
                />
            )}

            {status === 'approved' && view === 'create' && (
                <CreateVisitForm
                    initData={initData}
                    yards={session.yards}
                    onDone={() => setView('visits')}
                    onCancel={() => setView('home')}
                />
            )}

            {status === 'approved' && view === 'visits' && (
                <VisitList visits={visits} onBack={() => setView('home')} />
            )}
        </Wrap>
    );
}

const Wrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
        {children}
    </div>
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

const input: React.CSSProperties = {
    width: '100%',
    padding: 10,
    margin: '6px 0',
    borderRadius: 8,
    border: '1px solid #ccc',
    fontSize: 16,
    boxSizing: 'border-box',
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
            <label>ФИО</label>
            <input style={input} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            <label>Телефон</label>
            <input style={input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7..." required />
            {err && <p style={{ color: 'crimson' }}>{err}</p>}
            <button type="submit" disabled={busy} style={btn}>{busy ? 'Отправка…' : 'Отправить заявку'}</button>
        </form>
    );
}

function Dashboard({
    session,
    onCreate,
    onVisits,
}: {
    session: SessionPayload;
    onCreate: () => void;
    onVisits: () => void;
}) {
    return (
        <>
            <p>Добро пожаловать, {session.user?.name ?? session.profile.full_name}!</p>
            <p>Доступные площадки: {session.yards.length === 0 ? 'нет' : session.yards.map((y) => y.name).join(', ')}</p>
            <button style={btn} onClick={onCreate} disabled={session.yards.length === 0}>Создать гостевой визит</button>
            <button style={btnSecondary} onClick={onVisits}>Мои визиты</button>
        </>
    );
}

function CreateVisitForm({
    initData,
    yards,
    onDone,
    onCancel,
}: {
    initData: string;
    yards: YardOption[];
    onDone: () => void;
    onCancel: () => void;
}) {
    const [yardId, setYardId] = useState<number | ''>(yards[0]?.id ?? '');
    const [guestName, setGuestName] = useState('');
    const [guestPhone, setGuestPhone] = useState('');
    const [guestPosition, setGuestPosition] = useState('');
    const [company, setCompany] = useState('');
    const [startsAt, setStartsAt] = useState(() => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16));
    const [endsAt, setEndsAt] = useState('');
    const [permitKind, setPermitKind] = useState<'one_time' | 'multi_time'>('one_time');
    const [comment, setComment] = useState('');
    const [plate, setPlate] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!yardId) return;
        if (comment.trim() === '') {
            setErr('Укажите цель визита');
            return;
        }
        setBusy(true);
        setErr(null);
        try {
            await axios.post('/api/telegram/miniapp/visits', {
                init_data: initData,
                yard_id: yardId,
                guest_full_name: guestName,
                guest_phone: guestPhone,
                guest_position: guestPosition,
                guest_company_name: company || null,
                visit_starts_at: startsAt,
                visit_ends_at: permitKind === 'multi_time' ? endsAt || null : null,
                permit_kind: permitKind,
                comment: comment.trim(),
                vehicles: plate ? [{ plate_number: plate }] : [],
            });
            onDone();
        } catch (e: any) {
            setErr(e.response?.data?.message ?? 'Ошибка создания визита');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit}>
            <h3>Новый визит</h3>
            <label>Площадка</label>
            <select style={input} value={yardId} onChange={(e) => setYardId(Number(e.target.value))} required>
                {yards.map((y) => (
                    <option key={y.id} value={y.id}>{y.name}</option>
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
            <label>Дата и время начала</label>
            <input style={input} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
            <label>Тип пропуска</label>
            <select style={input} value={permitKind} onChange={(e) => setPermitKind(e.target.value as never)}>
                <option value="one_time">Разовый</option>
                <option value="multi_time">Многоразовый</option>
            </select>
            {permitKind === 'multi_time' && (
                <>
                    <label>Дата окончания</label>
                    <input style={input} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                </>
            )}
            <label>Гос. номер ТС (опционально)</label>
            <input style={input} value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
            <label>Цель визита</label>
            <textarea style={{ ...input, minHeight: 60 }} value={comment} onChange={(e) => setComment(e.target.value)} required />
            {err && <p style={{ color: 'crimson' }}>{err}</p>}
            <button type="submit" disabled={busy} style={btn}>{busy ? 'Создание…' : 'Создать визит'}</button>
            <button type="button" style={btnSecondary} onClick={onCancel}>Отмена</button>
        </form>
    );
}

function VisitList({ visits, onBack }: { visits: VisitItem[]; onBack: () => void }) {
    return (
        <>
            <h3>Мои визиты</h3>
            {visits.length === 0 && <p>Визитов пока нет.</p>}
            {visits.map((v) => (
                <div key={v.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, margin: '8px 0' }}>
                    <strong>{v.guest_full_name}</strong>
                    <div>Площадка: {v.yard?.name ?? '—'}</div>
                    <div>Начало: {new Date(v.visit_starts_at).toLocaleString()}</div>
                    <div>Тип: {v.permit_kind === 'multi_time' ? 'Многоразовый' : 'Разовый'}</div>
                    <div>Статус: {v.workflow_status}</div>
                </div>
            ))}
            <button style={btnSecondary} onClick={onBack}>← Назад</button>
        </>
    );
}
