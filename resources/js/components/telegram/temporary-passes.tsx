import { type ChangeEvent, type FormEvent, useMemo, useState } from 'react';
import axios from 'axios';

interface TemporaryPassCandidate {
    reference_key: string | null;
    employee_id: number | null;
    group_key: string | null;
    full_name: string | null;
    department: string | null;
    position: string | null;
    source: string | null;
    source_label: string | null;
    reference_image_url: string | null;
    similarity: number | null;
    person_kind: string | null;
    temporary_pass_status: string | null;
    temporary_pass_expires_at: string | null;
    temporary_pass_issued_at: string | null;
}

interface TemporaryPassRecognitionResult {
    matched: boolean;
    threshold: number | null;
    best_match: TemporaryPassCandidate | null;
    candidates: TemporaryPassCandidate[];
}

interface TemporaryPassEmployee {
    id: number;
    business_key: string;
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
    reference_image_url: string | null;
}

interface TemporaryPassMutationResponse {
    action: 'created' | 'extended';
    employee: TemporaryPassEmployee;
}

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

const TEMP_CREATE_THRESHOLD = 0.7;
const TEMP_CHECK_THRESHOLD = 0.55;
const TEMP_CONFIRMATION_LIMIT = 3;

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

const formatDateTimeLabel = (value?: string | null) => {
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

const formatSimilarityPercent = (value?: number | null) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return '—';
    }

    return `${(value * 100).toFixed(1)}%`;
};

const candidateIdentity = (candidate: TemporaryPassCandidate) => (
    candidate.reference_key
    || candidate.group_key
    || `${candidate.employee_id ?? 'candidate'}:${candidate.full_name ?? ''}:${candidate.source ?? ''}`
);

const collectCandidates = (result: TemporaryPassRecognitionResult | null, threshold: number) => {
    if (!result) {
        return [];
    }

    const unique: TemporaryPassCandidate[] = [];
    const seen = new Set<string>();

    for (const candidate of [result.best_match, ...result.candidates]) {
        if (!candidate) {
            continue;
        }

        if (typeof candidate.similarity !== 'number' || candidate.similarity < threshold) {
            continue;
        }

        const key = candidateIdentity(candidate);
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        unique.push(candidate);

        if (unique.length >= TEMP_CONFIRMATION_LIMIT) {
            break;
        }
    }

    return unique;
};

const statusLabel = (status?: string | null) => {
    if (status === 'active') {
        return 'Активен';
    }

    if (status === 'expired') {
        return 'Просрочен';
    }

    return 'Без статуса';
};

const statusColor = (status?: string | null) => {
    if (status === 'active') {
        return { background: '#ecfdf3', color: '#166534', border: '#b7e1c0' };
    }

    if (status === 'expired') {
        return { background: '#fff1f1', color: '#b42318', border: '#f4b8b3' };
    }

    return { background: '#f5f5f5', color: '#555', border: '#ddd' };
};

async function postRecognition(initData: string, photo: File): Promise<TemporaryPassRecognitionResult> {
    const formData = new FormData();
    formData.append('init_data', initData);
    formData.append('photo', photo);

    const response = await axios.post<{ data: TemporaryPassRecognitionResult }>(
        '/api/telegram/miniapp/temporary-passes/recognize',
        formData,
        { headers: { 'X-Telegram-Init-Data': initData } },
    );

    return response.data.data;
}

function CandidateReview({
    candidates,
    confirmedCandidate,
    rejectedAll,
    currentIndex,
    onConfirm,
    onReject,
}: {
    candidates: TemporaryPassCandidate[];
    confirmedCandidate: TemporaryPassCandidate | null;
    rejectedAll: boolean;
    currentIndex: number;
    onConfirm: (candidate: TemporaryPassCandidate) => void;
    onReject: () => void;
}) {
    const currentCandidate = candidates[currentIndex] ?? null;

    if (candidates.length === 0 && !confirmedCandidate && !rejectedAll) {
        return null;
    }

    return (
        <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid #ddd', background: '#fafafa' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {confirmedCandidate
                    ? 'Кандидат подтверждён'
                    : (rejectedAll ? 'Кандидаты отклонены' : 'Проверьте эталонное фото')}
            </div>

            {currentCandidate && !rejectedAll && !confirmedCandidate && (
                <>
                    <div style={{ fontSize: 12, color: '#555', marginBottom: 10 }}>
                        Кандидат {Math.min(currentIndex + 1, candidates.length)} из {candidates.length}
                    </div>
                    {currentCandidate.reference_image_url && (
                        <img
                            src={currentCandidate.reference_image_url}
                            alt={currentCandidate.full_name || 'Эталонное фото'}
                            style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 10, display: 'block', marginBottom: 10, background: '#111' }}
                        />
                    )}
                    <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                        {currentCandidate.full_name || 'Без имени'}
                        {currentCandidate.department ? ` · ${currentCandidate.department}` : ''}
                        {currentCandidate.position ? ` · ${currentCandidate.position}` : ''}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4, color: '#666' }}>
                        Совпадение: {formatSimilarityPercent(currentCandidate.similarity)}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4, color: currentCandidate.temporary_pass_status === 'expired' ? '#b42318' : '#555' }}>
                        Статус пропуска: {statusLabel(currentCandidate.temporary_pass_status)}
                    </div>
                    <div style={{ fontSize: 12, marginTop: 4, color: '#666' }}>
                        Действует до: {formatDateTimeLabel(currentCandidate.temporary_pass_expires_at)}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                        <button type="button" style={{ ...smallButtonStyle, background: '#166534', color: '#fff' }} onClick={() => onConfirm(currentCandidate)}>
                            Это он(-а)
                        </button>
                        <button type="button" style={{ ...smallButtonStyle, background: '#b42318', color: '#fff' }} onClick={onReject}>
                            Это не он(-а)
                        </button>
                    </div>
                </>
            )}

            {confirmedCandidate && (
                <div style={{ fontSize: 13, color: '#166534' }}>
                    Подтверждён: {confirmedCandidate.full_name || 'Без имени'} · {statusLabel(confirmedCandidate.temporary_pass_status)}
                </div>
            )}

            {rejectedAll && (
                <div style={{ fontSize: 13, color: '#555' }}>
                    Три кандидата отклонены. Можно продолжить с новым сотрудником или повторить фото.
                </div>
            )}
        </div>
    );
}

function EmployeeCard({ employee, title }: { employee: TemporaryPassEmployee | TemporaryPassCandidate; title: string }) {
    const colors = statusColor((employee as any).temporary_pass_status);

    return (
        <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.background, color: colors.color }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
            {(employee as any).reference_image_url && (
                <img
                    src={(employee as any).reference_image_url}
                    alt={(employee as any).full_name || 'Фото'}
                    style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 10, display: 'block', marginBottom: 10, background: '#111' }}
                />
            )}
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                {(employee as any).full_name || 'Без имени'}
                {(employee as any).department ? ` · ${(employee as any).department}` : ''}
                {(employee as any).position ? ` · ${(employee as any).position}` : ''}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
                Статус пропуска: {statusLabel((employee as any).temporary_pass_status)}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
                Выдан: {formatDateTimeLabel((employee as any).temporary_pass_issued_at)}
            </div>
            <div style={{ fontSize: 12, marginTop: 4 }}>
                Действует до: {formatDateTimeLabel((employee as any).temporary_pass_expires_at)}
            </div>
        </div>
    );
}

export function TemporaryPassesMenu({
    onCheck,
    onCreate,
    onExtend,
    onBack,
}: {
    onCheck: () => void;
    onCreate: () => void;
    onExtend: () => void;
    onBack: () => void;
}) {
    return (
        <>
            <h3 style={{ marginBottom: 8 }}>Временные пропуска</h3>
            <p style={{ color: '#666', fontSize: 13 }}>Выберите действие для подрядчика или другого временного сотрудника.</p>
            <button type="button" style={btn} onClick={onCheck}>Проверка пропуска</button>
            <button type="button" style={btnDanger} onClick={onCreate}>Создание пропуска</button>
            <button type="button" style={btnSecondary} onClick={onExtend}>Продление пропуска</button>
            <button type="button" style={btnSecondary} onClick={onBack}>← Назад</button>
        </>
    );
}

export function TemporaryPassCheckView({
    initData,
    onBack,
    onGoToExtend,
}: {
    initData: string;
    onBack: () => void;
    onGoToExtend: () => void;
}) {
    const [photo, setPhoto] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<TemporaryPassRecognitionResult | null>(null);
    const [confirmedCandidate, setConfirmedCandidate] = useState<TemporaryPassCandidate | null>(null);
    const [rejectedAll, setRejectedAll] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);

    const candidates = useMemo(() => collectCandidates(result, TEMP_CHECK_THRESHOLD), [result]);
    const currentCandidate = candidates[currentIndex] ?? null;

    const selectPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
        const nextPhoto = event.target.files?.[0] ?? null;
        event.target.value = '';
        setPhoto(nextPhoto);
        setError(null);
        setResult(null);
        setConfirmedCandidate(null);
        setRejectedAll(false);
        setCurrentIndex(0);

        if (!nextPhoto) {
            return;
        }

        setBusy(true);
        try {
            setResult(await postRecognition(initData, nextPhoto));
        } catch (recognitionError) {
            setError(getErrorMessage(recognitionError, 'Не удалось проверить фотографию.'));
        } finally {
            setBusy(false);
        }
    };

    const rejectCurrent = () => {
        const nextIndex = currentIndex + 1;
        if (nextIndex < candidates.length) {
            setCurrentIndex(nextIndex);
            return;
        }

        setRejectedAll(true);
    };

    return (
        <>
            <h3 style={{ marginBottom: 8 }}>Проверка пропуска</h3>
            <p style={{ color: '#666', fontSize: 13 }}>Сделайте или выберите фото подрядчика, чтобы проверить срок его временного пропуска.</p>
            <input type="file" accept="image/*" capture="environment" onChange={selectPhoto} style={{ ...inputStyle, padding: 8 }} />
            {photo && <div style={{ fontSize: 12, color: '#666', marginTop: -8, marginBottom: 12 }}>{photo.name}</div>}
            {busy && <div style={{ marginBottom: 12, color: '#0f4c81' }}>Проверяем фото...</div>}
            {error && <div style={{ marginBottom: 12, color: 'crimson' }}>{error}</div>}

            <CandidateReview
                candidates={candidates}
                confirmedCandidate={confirmedCandidate}
                rejectedAll={rejectedAll}
                currentIndex={currentIndex}
                onConfirm={setConfirmedCandidate}
                onReject={rejectCurrent}
            />

            {confirmedCandidate && <EmployeeCard employee={confirmedCandidate} title="Найденный временный пропуск" />}
            {confirmedCandidate?.temporary_pass_status === 'expired' && (
                <button type="button" style={btnDanger} onClick={onGoToExtend}>
                    Пропуск просрочен. Перейти к продлению
                </button>
            )}

            {!busy && photo && !confirmedCandidate && (rejectedAll || (!currentCandidate && candidates.length === 0)) && (
                <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 10, background: '#fff7e6', color: '#8a5a00' }}>
                    Временный пропуск не найден.
                </div>
            )}

            <button type="button" style={btnSecondary} onClick={onBack}>← Назад</button>
        </>
    );
}

export function TemporaryPassCreateView({
    initData,
    onDone,
    onBack,
}: {
    initData: string;
    onDone: () => void;
    onBack: () => void;
}) {
    const [fullName, setFullName] = useState('');
    const [department, setDepartment] = useState('');
    const [position, setPosition] = useState('');
    const [durationMonths, setDurationMonths] = useState('3');
    const [photo, setPhoto] = useState<File | null>(null);
    const [recognitionBusy, setRecognitionBusy] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<TemporaryPassRecognitionResult | null>(null);
    const [confirmedCandidate, setConfirmedCandidate] = useState<TemporaryPassCandidate | null>(null);
    const [rejectedAll, setRejectedAll] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);

    const candidates = useMemo(() => collectCandidates(result, TEMP_CREATE_THRESHOLD), [result]);

    const selectPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
        const nextPhoto = event.target.files?.[0] ?? null;
        event.target.value = '';
        setPhoto(nextPhoto);
        setError(null);
        setResult(null);
        setConfirmedCandidate(null);
        setRejectedAll(false);
        setCurrentIndex(0);

        if (!nextPhoto) {
            return;
        }

        setRecognitionBusy(true);
        try {
            setResult(await postRecognition(initData, nextPhoto));
        } catch (recognitionError) {
            setError(getErrorMessage(recognitionError, 'Не удалось проверить фотографию.'));
        } finally {
            setRecognitionBusy(false);
        }
    };

    const rejectCurrent = () => {
        const nextIndex = currentIndex + 1;
        if (nextIndex < candidates.length) {
            setCurrentIndex(nextIndex);
            return;
        }

        setRejectedAll(true);
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!photo) {
            setError('Добавьте фотографию временного сотрудника.');
            return;
        }

        setBusy(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('init_data', initData);
            formData.append('full_name', fullName.trim());
            formData.append('department', department.trim());
            formData.append('position', position.trim());
            formData.append('duration_months', durationMonths);
            formData.append('photo', photo);

            if (confirmedCandidate?.reference_key) {
                formData.append('confirmed_reference_key', confirmedCandidate.reference_key);
            }

            if (rejectedAll) {
                formData.append('rejected_all', '1');
            }

            const response = await axios.post<{ data: TemporaryPassMutationResponse }>(
                '/api/telegram/miniapp/temporary-passes/create',
                formData,
                { headers: { 'X-Telegram-Init-Data': initData } },
            );

            const mutation = response.data.data;
            window.alert(
                mutation.action === 'created'
                    ? `Пропуск создан для ${mutation.employee.full_name}.`
                    : `Найден существующий сотрудник. Пропуск продлён для ${mutation.employee.full_name}.`,
            );
            onDone();
        } catch (submitError) {
            setError(getErrorMessage(submitError, 'Не удалось сохранить временный пропуск.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit}>
            <h3 style={{ marginBottom: 8 }}>Создание пропуска</h3>
            <label>ФИО</label>
            <input style={inputStyle} value={fullName} onChange={(event) => setFullName(event.target.value)} required />
            <label>Отдел</label>
            <input style={inputStyle} value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="Необязательно" />
            <label>Должность</label>
            <input style={inputStyle} value={position} onChange={(event) => setPosition(event.target.value)} placeholder="Необязательно" />
            <label>Срок действия</label>
            <select style={inputStyle} value={durationMonths} onChange={(event) => setDurationMonths(event.target.value)}>
                {[1, 2, 3, 4, 5, 6].map((month) => (
                    <option key={month} value={month}>{month} мес.</option>
                ))}
            </select>
            <label>Фото сотрудника</label>
            <input type="file" accept="image/*" capture="environment" onChange={selectPhoto} style={{ ...inputStyle, padding: 8 }} required />
            {photo && <div style={{ fontSize: 12, color: '#666', marginTop: -8, marginBottom: 12 }}>{photo.name}</div>}
            {recognitionBusy && <div style={{ marginBottom: 12, color: '#0f4c81' }}>Проверяем фото на дубликаты...</div>}
            {error && <div style={{ marginBottom: 12, color: 'crimson' }}>{error}</div>}

            <CandidateReview
                candidates={candidates}
                confirmedCandidate={confirmedCandidate}
                rejectedAll={rejectedAll}
                currentIndex={currentIndex}
                onConfirm={setConfirmedCandidate}
                onReject={rejectCurrent}
            />

            {confirmedCandidate && (
                <EmployeeCard employee={confirmedCandidate} title="Такой сотрудник уже найден" />
            )}

            {!recognitionBusy && photo && !confirmedCandidate && candidates.length === 0 && (
                <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 10, background: '#eef6ff', color: '#0f4c81' }}>
                    Похожий временный сотрудник не найден. Можно создавать новую карточку.
                </div>
            )}

            <button type="submit" style={btnDanger} disabled={busy || !photo || !fullName.trim()}>
                {busy ? 'Сохранение…' : (confirmedCandidate ? 'Продлить существующий пропуск' : 'Создать пропуск')}
            </button>
            <button type="button" style={btnSecondary} onClick={onBack}>← Назад</button>
        </form>
    );
}

export function TemporaryPassExtendView({
    initData,
    onDone,
    onBack,
}: {
    initData: string;
    onDone: () => void;
    onBack: () => void;
}) {
    const [durationMonths, setDurationMonths] = useState('3');
    const [photo, setPhoto] = useState<File | null>(null);
    const [recognitionBusy, setRecognitionBusy] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<TemporaryPassRecognitionResult | null>(null);
    const [confirmedCandidate, setConfirmedCandidate] = useState<TemporaryPassCandidate | null>(null);
    const [rejectedAll, setRejectedAll] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);

    const candidates = useMemo(() => collectCandidates(result, TEMP_CHECK_THRESHOLD), [result]);

    const selectPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
        const nextPhoto = event.target.files?.[0] ?? null;
        event.target.value = '';
        setPhoto(nextPhoto);
        setError(null);
        setResult(null);
        setConfirmedCandidate(null);
        setRejectedAll(false);
        setCurrentIndex(0);

        if (!nextPhoto) {
            return;
        }

        setRecognitionBusy(true);
        try {
            setResult(await postRecognition(initData, nextPhoto));
        } catch (recognitionError) {
            setError(getErrorMessage(recognitionError, 'Не удалось проверить фотографию.'));
        } finally {
            setRecognitionBusy(false);
        }
    };

    const rejectCurrent = () => {
        const nextIndex = currentIndex + 1;
        if (nextIndex < candidates.length) {
            setCurrentIndex(nextIndex);
            return;
        }

        setRejectedAll(true);
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!photo || !confirmedCandidate?.reference_key) {
            setError('Подтвердите временного сотрудника по эталонному фото.');
            return;
        }

        setBusy(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('init_data', initData);
            formData.append('duration_months', durationMonths);
            formData.append('confirmed_reference_key', confirmedCandidate.reference_key);
            formData.append('photo', photo);

            const response = await axios.post<{ data: TemporaryPassMutationResponse }>(
                '/api/telegram/miniapp/temporary-passes/extend',
                formData,
                { headers: { 'X-Telegram-Init-Data': initData } },
            );

            window.alert(`Пропуск продлён для ${response.data.data.employee.full_name}.`);
            onDone();
        } catch (submitError) {
            setError(getErrorMessage(submitError, 'Не удалось продлить временный пропуск.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit}>
            <h3 style={{ marginBottom: 8 }}>Продление пропуска</h3>
            <label>Фото сотрудника</label>
            <input type="file" accept="image/*" capture="environment" onChange={selectPhoto} style={{ ...inputStyle, padding: 8 }} required />
            {photo && <div style={{ fontSize: 12, color: '#666', marginTop: -8, marginBottom: 12 }}>{photo.name}</div>}
            <label>Продлить на</label>
            <select style={inputStyle} value={durationMonths} onChange={(event) => setDurationMonths(event.target.value)}>
                {[1, 2, 3, 4, 5, 6].map((month) => (
                    <option key={month} value={month}>{month} мес.</option>
                ))}
            </select>
            {recognitionBusy && <div style={{ marginBottom: 12, color: '#0f4c81' }}>Ищем временный пропуск...</div>}
            {error && <div style={{ marginBottom: 12, color: 'crimson' }}>{error}</div>}

            <CandidateReview
                candidates={candidates}
                confirmedCandidate={confirmedCandidate}
                rejectedAll={rejectedAll}
                currentIndex={currentIndex}
                onConfirm={setConfirmedCandidate}
                onReject={rejectCurrent}
            />

            {confirmedCandidate && <EmployeeCard employee={confirmedCandidate} title="Подтверждённый сотрудник" />}

            {!recognitionBusy && photo && !confirmedCandidate && (rejectedAll || candidates.length === 0) && (
                <div style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 10, background: '#fff7e6', color: '#8a5a00' }}>
                    Временный пропуск не найден. Сделайте фото ещё раз или создайте новый пропуск.
                </div>
            )}

            <button type="submit" style={btnDanger} disabled={busy || !confirmedCandidate?.reference_key}>
                {busy ? 'Сохранение…' : 'Продлить пропуск'}
            </button>
            <button type="button" style={btnSecondary} onClick={onBack}>← Назад</button>
        </form>
    );
}
