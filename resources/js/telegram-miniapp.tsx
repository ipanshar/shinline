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

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: 10,
    margin: '4px 0 12px',
    borderRadius: 8,
    border: '1px solid #ccc',
    fontSize: 16,
    boxSizing: 'border-box',
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
}: {
    session: SessionPayload;
    onCreate: () => void;
    onVisits: () => void;
}) {
    return (
        <>
            <p>Добро пожаловать, <strong>{session.user?.name ?? session.profile.full_name}</strong>!</p>
            <p>Площадки: {session.yards.length === 0 ? 'не назначены' : session.yards.map((y) => y.name).join(', ')}</p>
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
    const [startsAt, setStartsAt] = useState(() => new Date(Date.now() + 3600_000).toISOString().slice(0, 16));
    const [endsAt, setEndsAt] = useState('');
    const [permitKind, setPermitKind] = useState<'one_time' | 'multi_time'>('one_time');
    const [comment, setComment] = useState('');
    const [plate, setPlate] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!yardId) return;
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
                comment: comment || null,
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
                    <input style={inputStyle} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                </>
            )}
            <label>Гос. номер ТС (опционально)</label>
            <input style={inputStyle} value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
            <label>Комментарий</label>
            <textarea style={{ ...inputStyle, minHeight: 60 }} value={comment} onChange={(e) => setComment(e.target.value)} />
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

// ── Главный компонент ─────────────────────────────────────────────────────────

function TelegramMiniApp() {
    const [initData, setInitData] = useState<string>('');
    const [session, setSession] = useState<SessionPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<'home' | 'register' | 'create' | 'visits'>('home');
    const [visits, setVisits] = useState<VisitItem[]>([]);

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

    useEffect(() => {
        if (view !== 'visits' || !initData) return;
        axios
            .get<{ data: VisitItem[] }>('/api/telegram/miniapp/visits', {
                params: { init_data: initData },
                headers: { 'X-Telegram-Init-Data': initData },
            })
            .then((r) => setVisits(r.data.data))
            .catch(() => setVisits([]));
    }, [view, initData]);

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
                <Dashboard session={session} onCreate={() => setView('create')} onVisits={() => setView('visits')} />
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

// ── Монтирование без Inertia ──────────────────────────────────────────────────

const el = document.getElementById('telegram-app');
if (el) {
    // Убираем placeholder
    el.innerHTML = '';
    createRoot(el).render(<TelegramMiniApp />);
}
