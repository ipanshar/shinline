/**
 * Standalone Telegram Mini App entry point.
 * Не использует Inertia — монтируется напрямую без зависимостей.
 */
import { createRoot } from 'react-dom/client';
import { useState, useEffect, useCallback, useRef, FormEvent } from 'react';
import axios from 'axios';
import {
    buildSpectechAddress,
    formatLocationStatus,
    isKnownTerminal,
    KNOWN_TERMINALS,
    MOCK_LOCATIONS,
    TERMINAL_INFO,
} from '@/components/spectech/MOCK_LOCATIONS';
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
    can_manage_spectech: boolean;
    can_record_violations: boolean;
    can_review_violations: boolean;
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

interface SpectechConflictDetail {
    id?: number;
    schedule_id?: number;
    request_id?: number | null;
    from?: string | null;
    to?: string | null;
    scheduled_start?: string | null;
    scheduled_end?: string | null;
    purpose?: string | null;
    status_label?: string | null;
    initiator_name?: string | null;
    initiator_phone?: string | null;
    location?: string | null;
    address?: string | null;
}

interface SpectechRequestItem {
    id: number;
    equipment_id: number;
    equipment_name: string;
    plate_number?: string | null;
    initiator_name?: string | null;
    initiator_phone?: string | null;
    driver_name?: string | null;
    driver_phone?: string | null;
    start_date: string;
    end_date: string;
    requested_start?: string | null;
    requested_end?: string | null;
    terminal: string;
    zone: string;
    gate?: string | null;
    address: string;
    comment?: string | null;
    status: string;
    status_label: string;
    photos?: string[];
    photo_urls?: string[];
    schedule_id?: number | null;
    conflict_info?: Array<{
        truck_name: string;
        plate_number?: string | null;
        free_at?: string;
        conflicts?: SpectechConflictDetail[];
    }>;
    client_name?: string | null;
    source_label?: string | null;
    cancellation_reason?: string | null;
    cancelled_by?: string | null;
    updated_by_operator?: boolean;
    operator_updated_at?: string | null;
    operator_updated_by_name?: string | null;
    created_at?: string | null;
}

interface UtilizationTruckOption {
    id: number;
    name?: string | null;
    plate_number?: string | null;
}

interface UtilizationRequestItem {
    id: number;
    equipment_name: string;
    plate_number?: string | null;
    driver_name?: string | null;
    start_date: string;
    end_date?: string | null;
    requested_start?: string | null;
    requested_end?: string | null;
    terminal?: string | null;
    zone?: string | null;
    gate?: string | null;
    address?: string | null;
    comment?: string | null;
    status: string;
    status_label: string;
    photos?: string[];
    photo_urls?: string[];
    created_at?: string | null;
}

interface ViolationEvidenceItem {
    id: number;
    media_kind: 'photo' | 'video';
    url: string | null;
    is_primary: boolean;
}

interface ViolationIncidentItem {
    id: number;
    incident_uid: string;
    workflow_status: string;
    recognition_status: string;
    occurred_at: string | null;
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
    evidences: ViolationEvidenceItem[];
}

interface ViolationRecognitionCandidate {
    reference_key: string | null;
    employee_id: number | null;
    group_key: string | null;
    full_name: string | null;
    department: string | null;
    position: string | null;
    iin: string | null;
    status: string | null;
    source: string | null;
    source_label: string | null;
    reference_image_url: string | null;
    similarity: number | null;
}

interface ViolationRecognitionResult {
    matched: boolean;
    threshold: number | null;
    best_match: ViolationRecognitionCandidate | null;
    candidates: ViolationRecognitionCandidate[];
}

interface ViolationTypeOption {
    id: number;
    key: string;
    name: string;
    description?: string | null;
}

interface ViolationCategoryOption {
    id: number;
    key: string;
    name: string;
    description?: string | null;
    types: ViolationTypeOption[];
}

type RecognitionCameraZoomMode = 'none' | 'hardware' | 'digital';

interface RecognitionCameraZoomRange {
    min: number;
    max: number;
    step: number;
}

const MAX_REQUEST_PHOTOS = 5;
const UNKNOWN_TRUCK_CONFIRMATION_LIMIT = 2;
const VIOLATION_RECOGNITION_CONFIRMATION_LIMIT = 3;
const DEFAULT_RECOGNITION_ZOOM_RANGE: RecognitionCameraZoomRange = { min: 1, max: 3, step: 0.1 };


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
    cancelled: 'Отменена',
};

const spectechStatusOptions = [
    { value: '', label: 'Все статусы' },
    { value: 'new', label: 'Новые' },
    { value: 'departure', label: 'Выезд' },
    { value: 'on_location', label: 'На объекте' },
    { value: 'work_started', label: 'Работы начаты' },
    { value: 'completed', label: 'Выполнено' },
    { value: 'returned', label: 'Возврат' },
    { value: 'cancelled', label: 'Отменённые' },
];

const nextSpectechStatus: Record<string, string> = {
    new: 'departure',
    departure: 'on_location',
    on_location: 'work_started',
    work_started: 'completed',
    completed: 'returned',
};

const finalSpectechStatuses = ['completed', 'returned', 'cancelled'];

const spectechStatusStyles: Record<string, { bg: string; color: string; border: string }> = {
    new: { bg: '#f5f5f5', color: '#555', border: '#ddd' },
    departure: { bg: '#fff4e6', color: '#a45a00', border: '#f5d08a' },
    on_location: { bg: '#eaf4ff', color: '#1663b7', border: '#bfdcff' },
    work_started: { bg: '#f2edff', color: '#6541b4', border: '#d7ccff' },
    completed: { bg: '#e9f8ee', color: '#1f7a3a', border: '#b9e6c6' },
    returned: { bg: '#eef7f0', color: '#226b35', border: '#abdcb8' },
    cancelled: { bg: '#fff1f1', color: '#b42318', border: '#f4b8b3' },
};

function renderSpectechPlanningNotice() {
    return (
        <div style={{ marginTop: 8, border: '1px solid #bae6fd', borderRadius: 8, padding: 8, background: '#f0f9ff', color: '#075985', fontSize: 14 }}>
            <strong>Пока планируем</strong>
            <div style={{ marginTop: 4 }}>Заявка принята. Диспетчер подбирает технику и планирует выезд.</div>
        </div>
    );
}

function renderSpectechOperatorUpdateNotice(request: SpectechRequestItem) {
    const details = [
        request.operator_updated_by_name ? `Оператор: ${request.operator_updated_by_name}` : null,
        request.operator_updated_at ? `Обновлено: ${formatSpectechDateTime(request.operator_updated_at)}` : null,
    ].filter(Boolean);

    return (
        <div style={{ marginTop: 8, border: '1px solid #fcd34d', borderRadius: 8, padding: 8, background: '#fffbeb', color: '#92400e', fontSize: 14 }}>
            <strong>Заявка обновлена оператором</strong>
            <div style={{ marginTop: 4 }}>
                {details.length > 0 ? details.join(' · ') : 'Проверьте время, технику и адрес заявки.'}
            </div>
        </div>
    );
}

function formatSpectechDateTime(value?: string | null): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatSpectechPeriod(request: SpectechRequestItem): string {
    const start = request.requested_start ? formatSpectechDateTime(request.requested_start) : request.start_date || '—';
    const end = request.requested_end ? formatSpectechDateTime(request.requested_end) : request.end_date || '—';

    return `${start} — ${end}`;
}

const utilizationStatusLabels: Record<string, string> = {
    new: 'На рассмотрении',
    reviewing: 'На рассмотрении',
    approved: 'Одобрена',
    in_progress: 'Одобрена',
    completed: 'Одобрена',
    rejected: 'Отклонена',
};

const violationStatusLabels: Record<string, string> = {
    draft_processing: 'Обработка',
    pending_review: 'На проверке',
    unknown_manual: 'Ждёт идентификации',
    recognized_confirmed: 'Личность подтверждена',
    approved: 'Подтверждено',
    rejected: 'Отклонено',
    resolved: 'Рассмотрено',
    closed: 'Закрыто',
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

const toDateLocalValue = (value: Date = new Date()) => {
    const localDate = new Date(value.getTime() - value.getTimezoneOffset() * 60000);

    return localDate.toISOString().slice(0, 10);
};

const normalizePlateNumber = (value: string) => value.replace(/[\s-]+/g, '').toUpperCase();

const normalizeVisitVehicles = (vehicles?: VisitVehicle[]) => {
    if (!vehicles || vehicles.length === 0) {
        return [emptyVisitVehicle()];
    }

    return vehicles.map((vehicle) => ({ ...emptyVisitVehicle(), ...vehicle }));
};

const formatTruckOptionLabel = (truck: { name?: string | null; plate_number?: string | null }) => (
    (truck.name || 'Без названия') + (truck.plate_number ? ` (${truck.plate_number})` : ' (без номера)')
);

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
});

const compressImageDataUrl = async (dataUrl: string): Promise<string> => {
    if (!dataUrl.startsWith('data:image/')) {
        return dataUrl;
    }

    if (typeof Image === 'undefined') {
        return dataUrl;
    }

    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
        img.src = dataUrl;
    });

    const maxWidth = 1600;
    const maxHeight = 1600;
    const quality = 0.78;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
        return dataUrl;
    }

    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    try {
        return canvas.toDataURL('image/jpeg', quality);
    } catch {
        return dataUrl;
    }
};

const dataUrlToFile = async (dataUrl: string, originalName: string, lastModified?: number) => {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    const baseName = originalName.replace(/\.[^.]+$/, '') || 'upload';

    return new File([blob], `${baseName}.jpg`, {
        type: blob.type || 'image/jpeg',
        lastModified: lastModified ?? Date.now(),
    });
};

const prepareViolationUploadFile = async (file: File): Promise<File> => {
    if (!file.type.startsWith('image/')) {
        return file;
    }

    try {
        const dataUrl = await readFileAsDataUrl(file);
        const compressedDataUrl = await compressImageDataUrl(dataUrl);

        if (compressedDataUrl === dataUrl && file.size <= 2 * 1024 * 1024) {
            return file;
        }

        return await dataUrlToFile(compressedDataUrl, file.name, file.lastModified);
    } catch {
        return file;
    }
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

const recognitionCandidateIdentity = (candidate: ViolationRecognitionCandidate) => (
    candidate.reference_key
    || candidate.group_key
    || `${candidate.employee_id ?? 'candidate'}:${candidate.full_name ?? ''}:${candidate.source ?? ''}`
);

const getRecognitionReviewCandidates = (result: ViolationRecognitionResult | null): ViolationRecognitionCandidate[] => {
    if (!result) {
        return [];
    }

    const seen = new Set<string>();
    const unique: ViolationRecognitionCandidate[] = [];

    for (const candidate of [result.best_match, ...result.candidates]) {
        if (!candidate) {
            continue;
        }

        const key = recognitionCandidateIdentity(candidate);
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        unique.push(candidate);

        if (unique.length >= VIOLATION_RECOGNITION_CONFIRMATION_LIMIT) {
            break;
        }
    }

    return unique;
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
    onViolationsCreate,
    onViolationsList,
    onSpectechCreate,
    onSpectechRequests,
    onUtilizationCreate,
    onUtilizationRequests,
    onOperatorSpectech,
}: {
    session: SessionPayload;
    onCreate: () => void;
    onVisits: () => void;
    onExitPermits: () => void;
    onViolationsCreate: () => void;
    onViolationsList: () => void;
    onSpectechCreate: () => void;
    onSpectechRequests: () => void;
    onUtilizationCreate: () => void;
    onUtilizationRequests: () => void;
    onOperatorSpectech: () => void;
}) {
    return (
        <>
            <p>Добро пожаловать, <strong>{session.user?.name ?? session.profile.full_name}</strong>!</p>
            <p>Площадки: {session.yards.length === 0 ? 'не назначены' : session.yards.map((y) => y.name).join(', ')}</p>
            <button style={btn} onClick={onCreate} disabled={session.yards.length === 0}>Создать гостевой визит</button>
            <button style={btn} onClick={onExitPermits} disabled={session.yards.length === 0}>Разрешить выезд ТС</button>
            {session.can_record_violations && (
                <>
                    <hr style={{ margin: '8px 0', borderColor: '#ddd' }} />
                    <button style={btnDanger} onClick={onViolationsCreate}>Зафиксировать нарушение</button>
                    <button style={btnSecondary} onClick={onViolationsList}>Мои нарушения</button>
                </>
            )}
            <hr style={{ margin: '8px 0', borderColor: '#ddd' }} />
            <button style={btn} onClick={onSpectechCreate}>Заявка на спецтехнику</button>
            <button style={btnSecondary} onClick={onSpectechRequests}>Мои заявки на спецтехнику</button>
            {session.can_manage_spectech && (
                <button style={btnSecondary} onClick={onOperatorSpectech}>
                    Панель оператора спецтехники
                </button>
            )}
            <hr style={{ margin: '8px 0', borderColor: '#ddd' }} />
            <UtilizationActions onCreate={onUtilizationCreate} onRequests={onUtilizationRequests} />
            <hr style={{ margin: '8px 0', borderColor: '#ddd' }} />
            <button style={btnSecondary} onClick={onVisits}>Мои визиты</button>
        </>
    );
}

function UtilizationActions({
    onCreate,
    onRequests,
}: {
    onCreate: () => void;
    onRequests: () => void;
}) {
    return (
        <>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#666' }}>Аварийный вызов техслужб доступен отдельно, без ожидания одобрения.</p>
            <button style={btn} onClick={onCreate}>Аварийный вызов техслужб</button>
            <button style={btnSecondary} onClick={onRequests}>Мои заявки на аварийный вызов</button>
        </>
    );
}

function ViolationsCreateView({
    initData,
    catalog,
    loadingCatalog,
    onCreated,
    onViewList,
    onBack,
}: {
    initData: string;
    catalog: ViolationCategoryOption[];
    loadingCatalog: boolean;
    onCreated: () => void | Promise<void>;
    onViewList: () => void;
    onBack: () => void;
}) {
    const [categoryId, setCategoryId] = useState<number | ''>('');
    const [typeId, setTypeId] = useState<number | ''>('');
    const [occurredAt, setOccurredAt] = useState(() => toDateTimeLocalValue(new Date().toISOString()));
    const [manualFullName, setManualFullName] = useState('');
    const [manualDepartment, setManualDepartment] = useState('');
    const [manualPosition, setManualPosition] = useState('');
    const [locationLabel, setLocationLabel] = useState('');
    const [description, setDescription] = useState('');
    const [recognitionFile, setRecognitionFile] = useState<File | null>(null);
    const [recognitionBusy, setRecognitionBusy] = useState(false);
    const [recognitionError, setRecognitionError] = useState<string | null>(null);
    const [recognitionResult, setRecognitionResult] = useState<ViolationRecognitionResult | null>(null);
    const [recognitionReviewCandidates, setRecognitionReviewCandidates] = useState<ViolationRecognitionCandidate[]>([]);
    const [recognitionReviewIndex, setRecognitionReviewIndex] = useState(0);
    const [confirmedRecognitionCandidate, setConfirmedRecognitionCandidate] = useState<ViolationRecognitionCandidate | null>(null);
    const [recognitionRejectedAll, setRecognitionRejectedAll] = useState(false);
    const [recognitionCameraOpen, setRecognitionCameraOpen] = useState(false);
    const [recognitionZoomMode, setRecognitionZoomMode] = useState<RecognitionCameraZoomMode>('none');
    const [recognitionZoomRange, setRecognitionZoomRange] = useState<RecognitionCameraZoomRange>(DEFAULT_RECOGNITION_ZOOM_RANGE);
    const [recognitionZoomValue, setRecognitionZoomValue] = useState(1);
    const [lastAutofill, setLastAutofill] = useState<{ fullName: string; department: string; position: string } | null>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const recognitionVideoRef = useRef<HTMLVideoElement | null>(null);
    const recognitionCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const recognitionStreamRef = useRef<MediaStream | null>(null);
    const recognitionGalleryInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (catalog.length === 0) {
            setCategoryId('');
            return;
        }

        const nextCategory = catalog.find((category) => category.id === categoryId) ?? catalog[0];
        setCategoryId(nextCategory.id);
    }, [catalog, categoryId]);

    const selectedCategory = catalog.find((category) => category.id === categoryId) ?? null;

    useEffect(() => {
        const activeTypes = selectedCategory?.types ?? [];

        if (activeTypes.length === 0) {
            setTypeId('');
            return;
        }

        const nextType = activeTypes.find((type) => type.id === typeId) ?? activeTypes[0];
        setTypeId(nextType.id);
    }, [selectedCategory, typeId]);

    const resetRecognitionZoom = useCallback(() => {
        setRecognitionZoomMode('none');
        setRecognitionZoomRange(DEFAULT_RECOGNITION_ZOOM_RANGE);
        setRecognitionZoomValue(1);
    }, []);

    const stopRecognitionCamera = useCallback(() => {
        if (recognitionStreamRef.current) {
            recognitionStreamRef.current.getTracks().forEach((track) => track.stop());
            recognitionStreamRef.current = null;
        }

        if (recognitionVideoRef.current) {
            recognitionVideoRef.current.srcObject = null;
        }

        setRecognitionCameraOpen(false);
        resetRecognitionZoom();
    }, [resetRecognitionZoom]);

    useEffect(() => {
        return () => {
            stopRecognitionCamera();
        };
    }, [stopRecognitionCamera]);

    useEffect(() => {
        if (!recognitionCameraOpen || !recognitionVideoRef.current || !recognitionStreamRef.current) {
            return;
        }

        recognitionVideoRef.current.srcObject = recognitionStreamRef.current;
        void recognitionVideoRef.current.play().catch(() => undefined);
    }, [recognitionCameraOpen]);

    const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(event.target.files ?? []);

        if (selectedFiles.length === 0) {
            return;
        }

        try {
            const availableSlots = Math.max(0, 5 - files.length);
            const preparedFiles = await Promise.all(
                selectedFiles
                    .slice(0, availableSlots)
                    .map((file) => prepareViolationUploadFile(file)),
            );

            setFiles((current) => [...current, ...preparedFiles].slice(0, 5));
            setErr(null);
        } catch (error) {
            setErr(error instanceof Error ? error.message : 'Не удалось подготовить файлы');
        } finally {
            event.target.value = '';
        }
    };

    const removeFile = (index: number) => {
        setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
    };

    const clearRecognitionAutofill = () => {
        if (!lastAutofill) {
            return;
        }

        if (manualFullName === lastAutofill.fullName) {
            setManualFullName('');
        }

        if (manualDepartment === lastAutofill.department) {
            setManualDepartment('');
        }

        if (manualPosition === lastAutofill.position) {
            setManualPosition('');
        }

        setLastAutofill(null);
    };

    const clearRecognition = () => {
        stopRecognitionCamera();
        clearRecognitionAutofill();
        setRecognitionFile(null);
        setRecognitionError(null);
        setRecognitionResult(null);
        setRecognitionReviewCandidates([]);
        setRecognitionReviewIndex(0);
        setConfirmedRecognitionCandidate(null);
        setRecognitionRejectedAll(false);
    };

    const currentRecognitionCandidate = recognitionReviewCandidates[recognitionReviewIndex] ?? null;

    const applyRecognitionCandidate = (candidate: ViolationRecognitionCandidate | null) => {
        clearRecognitionAutofill();

        if (!candidate?.full_name) {
            setConfirmedRecognitionCandidate(null);
            return;
        }

        const autofill = {
            fullName: candidate.full_name ?? '',
            department: candidate.department ?? '',
            position: candidate.position ?? '',
        };

        setManualFullName(autofill.fullName);
        setManualDepartment(autofill.department);
        setManualPosition(autofill.position);
        setLastAutofill(autofill);
        setConfirmedRecognitionCandidate(candidate);
        setRecognitionRejectedAll(false);
    };

    const moveToNextRecognitionCandidate = () => {
        clearRecognitionAutofill();
        setConfirmedRecognitionCandidate(null);

        const nextIndex = recognitionReviewIndex + 1;
        if (nextIndex < recognitionReviewCandidates.length) {
            setRecognitionReviewIndex(nextIndex);
            setRecognitionRejectedAll(false);
            return;
        }

        setRecognitionRejectedAll(true);
    };

    const runRecognitionForFile = async (selectedFile: File | null) => {
        if (!selectedFile) {
            return;
        }

        stopRecognitionCamera();
        clearRecognitionAutofill();
        setRecognitionBusy(true);
        setRecognitionError(null);
        setRecognitionResult(null);
        setRecognitionReviewCandidates([]);
        setRecognitionReviewIndex(0);
        setConfirmedRecognitionCandidate(null);
        setRecognitionRejectedAll(false);
        setErr(null);

        try {
            const preparedFile = await prepareViolationUploadFile(selectedFile);
            setRecognitionFile(preparedFile);

            const formData = new FormData();
            formData.append('init_data', initData);
            formData.append('recognition_file', preparedFile);

            const response = await axios.post('/api/telegram/miniapp/violations/recognize', formData, {
                headers: { 'X-Telegram-Init-Data': initData },
            });

            const nextResult = (response.data?.data ?? null) as ViolationRecognitionResult | null;
            const reviewCandidates = getRecognitionReviewCandidates(nextResult);
            setRecognitionResult(nextResult);
            setRecognitionReviewCandidates(reviewCandidates);
            setRecognitionReviewIndex(0);
            setRecognitionRejectedAll(reviewCandidates.length === 0);
            setLastAutofill(null);
        } catch (error: any) {
            setRecognitionError(getErrorMessage(error, 'Не удалось распознать сотрудника по фото'));
            setRecognitionResult(null);
            setRecognitionReviewCandidates([]);
            setRecognitionReviewIndex(0);
            setConfirmedRecognitionCandidate(null);
            setRecognitionRejectedAll(false);
            setLastAutofill(null);
        } finally {
            setRecognitionBusy(false);
        }
    };

    const handleRecognitionSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0] ?? null;
        event.target.value = '';

        await runRecognitionForFile(selectedFile);
    };

    const initializeRecognitionZoom = async (stream: MediaStream) => {
        const track = stream.getVideoTracks()[0] as (MediaStreamTrack & {
            getCapabilities?: () => MediaTrackCapabilities & { zoom?: { min?: number; max?: number; step?: number } };
            getSettings?: () => MediaTrackSettings & { zoom?: number };
        }) | undefined;

        if (!track) {
            resetRecognitionZoom();
            return;
        }

        const capabilities = typeof track.getCapabilities === 'function' ? track.getCapabilities() : null;
        const settings = typeof track.getSettings === 'function' ? track.getSettings() : null;
        const zoomCapabilities = capabilities?.zoom;

        if (
            zoomCapabilities
            && typeof zoomCapabilities.min === 'number'
            && typeof zoomCapabilities.max === 'number'
            && zoomCapabilities.max > zoomCapabilities.min
        ) {
            const nextRange = {
                min: Math.max(1, zoomCapabilities.min),
                max: Math.max(1, zoomCapabilities.max),
                step: typeof zoomCapabilities.step === 'number' && zoomCapabilities.step > 0
                    ? zoomCapabilities.step
                    : 0.1,
            } satisfies RecognitionCameraZoomRange;
            const nextValue = typeof settings?.zoom === 'number'
                ? Math.min(nextRange.max, Math.max(nextRange.min, settings.zoom))
                : nextRange.min;

            setRecognitionZoomMode('hardware');
            setRecognitionZoomRange(nextRange);
            setRecognitionZoomValue(nextValue);
            return;
        }

        setRecognitionZoomMode('digital');
        setRecognitionZoomRange(DEFAULT_RECOGNITION_ZOOM_RANGE);
        setRecognitionZoomValue(1);
    };

    const updateRecognitionZoom = async (rawValue: number) => {
        const nextValue = Math.min(
            recognitionZoomRange.max,
            Math.max(recognitionZoomRange.min, rawValue),
        );

        setRecognitionZoomValue(nextValue);

        if (recognitionZoomMode !== 'hardware') {
            return;
        }

        const track = recognitionStreamRef.current?.getVideoTracks()[0];
        if (!track || typeof track.applyConstraints !== 'function') {
            return;
        }

        try {
            await track.applyConstraints({
                advanced: [{ zoom: nextValue } as MediaTrackConstraintSet],
            });
        } catch {
            setRecognitionZoomMode('digital');
            setRecognitionZoomRange((current) => ({
                min: 1,
                max: Math.max(current.max, DEFAULT_RECOGNITION_ZOOM_RANGE.max),
                step: DEFAULT_RECOGNITION_ZOOM_RANGE.step,
            }));
        }
    };

    const startRecognitionCamera = async () => {
        if (recognitionBusy) {
            return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            setErr('Не удалось открыть камеру на этом устройстве. Можно выбрать фото из галереи.');
            return;
        }

        clearRecognition();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
                audio: false,
            });

            await initializeRecognitionZoom(stream);
            recognitionStreamRef.current = stream;
            setRecognitionCameraOpen(true);
            setErr(null);
        } catch {
            setErr('Не удалось получить доступ к камере. Можно выбрать фото из галереи.');
        }
    };

    const openRecognitionGallery = () => {
        recognitionGalleryInputRef.current?.click();
    };

    const captureRecognitionPhoto = async () => {
        if (!recognitionVideoRef.current || !recognitionCanvasRef.current) {
            return;
        }

        if (recognitionVideoRef.current.videoWidth === 0 || recognitionVideoRef.current.videoHeight === 0) {
            setErr('Камера ещё не готова. Попробуйте ещё раз.');
            return;
        }

        try {
            const canvas = recognitionCanvasRef.current;
            canvas.width = recognitionVideoRef.current.videoWidth;
            canvas.height = recognitionVideoRef.current.videoHeight;

            const context = canvas.getContext('2d');
            if (!context) {
                setErr('Не удалось обработать снимок.');
                return;
            }

            if (recognitionZoomMode === 'digital' && recognitionZoomValue > 1) {
                const sourceWidth = recognitionVideoRef.current.videoWidth / recognitionZoomValue;
                const sourceHeight = recognitionVideoRef.current.videoHeight / recognitionZoomValue;
                const sourceX = (recognitionVideoRef.current.videoWidth - sourceWidth) / 2;
                const sourceY = (recognitionVideoRef.current.videoHeight - sourceHeight) / 2;

                context.drawImage(
                    recognitionVideoRef.current,
                    sourceX,
                    sourceY,
                    sourceWidth,
                    sourceHeight,
                    0,
                    0,
                    canvas.width,
                    canvas.height,
                );
            } else {
                context.drawImage(recognitionVideoRef.current, 0, 0, canvas.width, canvas.height);
            }

            const compressedDataUrl = await compressImageDataUrl(canvas.toDataURL('image/jpeg', 0.92));
            const capturedFile = await dataUrlToFile(compressedDataUrl, 'recognition-camera.jpg');

            await runRecognitionForFile(capturedFile);
        } catch {
            setErr('Не удалось сделать фото сотрудника.');
        }
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();

        if (!typeId) {
            setErr('Выберите тип нарушения');
            return;
        }

        if (recognitionBusy) {
            setErr('Дождитесь завершения распознавания по фото сотрудника');
            return;
        }

        if (recognitionFile && !recognitionError && !confirmedRecognitionCandidate && !recognitionRejectedAll && recognitionReviewCandidates.length > 0) {
            setErr('Проверьте эталонное фото кандидата: подтвердите сотрудника или отклоните до трёх вариантов.');
            return;
        }

        if (!manualFullName.trim() && !recognitionFile) {
            setErr('Укажите ФИО нарушителя вручную или сначала сделайте фото для распознавания');
            return;
        }

        if (!manualFullName.trim() && recognitionError) {
            setErr('Распознавание не завершилось. Либо укажите ФИО вручную, либо сделайте фото ещё раз.');
            return;
        }

        if (recognitionRejectedAll && !manualFullName.trim()) {
            setErr('После трёх отклонённых кандидатов укажите ФИО вручную. Это фото станет новым эталонным.');
            return;
        }

        setBusy(true);
        setErr(null);

        try {
            const formData = new FormData();
            formData.append('init_data', initData);
            formData.append('type_id', String(typeId));
            formData.append('occurred_at', occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString());

            if (manualFullName.trim()) {
                formData.append('manual_full_name', manualFullName.trim());
            }

            if (manualDepartment.trim()) {
                formData.append('manual_department', manualDepartment.trim());
            }

            if (manualPosition.trim()) {
                formData.append('manual_position', manualPosition.trim());
            }

            if (locationLabel.trim()) {
                formData.append('location_label', locationLabel.trim());
            }

            if (description.trim()) {
                formData.append('description', description.trim());
            }

            if (recognitionFile) {
                formData.append('recognition_file', recognitionFile);
            }

            if (confirmedRecognitionCandidate?.reference_key) {
                formData.append('recognition_confirmed_reference_key', confirmedRecognitionCandidate.reference_key);
            }

            if (recognitionRejectedAll) {
                formData.append('recognition_rejected_all', '1');
            }

            files.forEach((file) => {
                formData.append('files[]', file);
            });

            await axios.post('/api/telegram/miniapp/violations/incidents', formData, {
                headers: { 'X-Telegram-Init-Data': initData },
            });

            await onCreated();
        } catch (error: any) {
            setErr(getErrorMessage(error, 'Не удалось сохранить нарушение'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit}>
            <h3 style={{ marginBottom: 8 }}>Фиксация нарушения</h3>
            <p style={{ marginTop: 0, color: '#555' }}>
                Сначала сделайте отдельное фото сотрудника для распознавания. Ниже отдельно приложите фото или видео как доказательства нарушения.
            </p>
            <label>Категория</label>
            <select
                style={inputStyle}
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value ? Number(event.target.value) : '')}
                disabled={loadingCatalog || catalog.length === 0}
                required
            >
                <option value="">{loadingCatalog ? 'Загрузка...' : 'Выберите категорию'}</option>
                {catalog.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                ))}
            </select>

            <label>Тип нарушения</label>
            <select
                style={inputStyle}
                value={typeId}
                onChange={(event) => setTypeId(event.target.value ? Number(event.target.value) : '')}
                disabled={!selectedCategory || selectedCategory.types.length === 0}
                required
            >
                <option value="">{!selectedCategory ? 'Сначала выберите категорию' : 'Выберите тип нарушения'}</option>
                {(selectedCategory?.types ?? []).map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                ))}
            </select>

            {selectedCategory?.description && (
                <div style={{ marginTop: -6, marginBottom: 12, color: '#666', fontSize: 12 }}>{selectedCategory.description}</div>
            )}

            <label>Фото сотрудника для распознавания</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '4px 0 12px' }}>
                <button
                    type="button"
                    style={{
                        ...smallButtonStyle,
                        padding: '12px 14px',
                        background: recognitionCameraOpen ? '#dbeafe' : '#2481cc',
                        color: recognitionCameraOpen ? '#1d4ed8' : '#fff',
                    }}
                    onClick={() => void startRecognitionCamera()}
                    disabled={recognitionBusy || recognitionCameraOpen}
                >
                    {recognitionCameraOpen
                        ? 'Камера открыта'
                        : (recognitionFile ? 'Переснять камерой' : 'Сделать фото камерой')}
                </button>
                <button
                    type="button"
                    style={{ ...smallButtonStyle, padding: '12px 14px', background: '#f3f4f6', color: '#111827' }}
                    onClick={openRecognitionGallery}
                    disabled={recognitionBusy}
                >
                    Выбрать из галереи
                </button>
            </div>
            <input
                ref={recognitionGalleryInputRef}
                type="file"
                accept="image/*"
                onChange={handleRecognitionSelection}
                style={{ display: 'none' }}
            />
            <div style={{ fontSize: 12, color: '#666', marginTop: -8, marginBottom: 12 }}>
                Для определения личности сначала снимайте сотрудника камерой. Фото и видео самого нарушения загружаются отдельно ниже.
            </div>

            {recognitionCameraOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, 0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ width: '100%', maxWidth: 560, borderRadius: 18, padding: 14, background: '#111827', boxShadow: '0 24px 80px rgba(0,0,0,0.45)' }}>
                        <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Сделайте фото сотрудника</div>
                        <div style={{ overflow: 'hidden', borderRadius: 12, background: '#000' }}>
                            <video
                                ref={recognitionVideoRef}
                                autoPlay
                                playsInline
                                muted
                                style={{
                                    width: '100%',
                                    maxHeight: '70vh',
                                    borderRadius: 12,
                                    display: 'block',
                                    background: '#000',
                                    objectFit: 'cover',
                                    transform: recognitionZoomMode === 'digital' ? `scale(${recognitionZoomValue})` : undefined,
                                    transformOrigin: 'center center',
                                    transition: 'transform 120ms ease-out',
                                }}
                            />
                        </div>
                        <canvas ref={recognitionCanvasRef} style={{ display: 'none' }} />
                        {recognitionZoomMode !== 'none' && (
                            <div style={{ marginTop: 12, borderRadius: 12, background: '#0f172a', padding: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, color: '#fff', fontSize: 13, marginBottom: 8 }}>
                                    <span>Приближение камеры</span>
                                    <span>x{recognitionZoomValue.toFixed(1)}</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 48px', gap: 10, alignItems: 'center' }}>
                                    <button
                                        type="button"
                                        style={{ ...smallButtonStyle, padding: '10px 0', background: '#1e293b', color: '#fff' }}
                                        onClick={() => void updateRecognitionZoom(recognitionZoomValue - recognitionZoomRange.step)}
                                        disabled={recognitionZoomValue <= recognitionZoomRange.min}
                                    >
                                        -
                                    </button>
                                    <input
                                        type="range"
                                        min={recognitionZoomRange.min}
                                        max={recognitionZoomRange.max}
                                        step={recognitionZoomRange.step}
                                        value={recognitionZoomValue}
                                        onChange={(event) => void updateRecognitionZoom(Number(event.target.value))}
                                        style={{ width: '100%' }}
                                    />
                                    <button
                                        type="button"
                                        style={{ ...smallButtonStyle, padding: '10px 0', background: '#1e293b', color: '#fff' }}
                                        onClick={() => void updateRecognitionZoom(recognitionZoomValue + recognitionZoomRange.step)}
                                        disabled={recognitionZoomValue >= recognitionZoomRange.max}
                                    >
                                        +
                                    </button>
                                </div>
                                <div style={{ color: '#cbd5e1', fontSize: 11, marginTop: 8 }}>
                                    {recognitionZoomMode === 'hardware'
                                        ? 'Используется приближение самой камеры устройства.'
                                        : 'Если камера не поддерживает аппаратный zoom, используется программное приближение кадра.'}
                                </div>
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button type="button" style={{ ...smallButtonStyle, flex: 1, background: '#2481cc', color: '#fff', padding: '12px 14px' }} onClick={() => void captureRecognitionPhoto()}>
                                Сделать фото
                            </button>
                            <button type="button" style={{ ...smallButtonStyle, flex: 1, background: '#e5e7eb', color: '#111827', padding: '12px 14px' }} onClick={stopRecognitionCamera}>
                                Отмена
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {recognitionFile && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: '1px solid #ddd', borderRadius: 10, padding: '10px 12px', marginBottom: 12, background: '#fafafa' }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recognitionFile.name}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>
                            Фото для распознавания · {(recognitionFile.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                    </div>
                    <button type="button" style={{ ...smallButtonStyle, background: '#f3f4f6', color: '#111827' }} onClick={clearRecognition}>
                        Убрать
                    </button>
                </div>
            )}

            {recognitionBusy && (
                <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: '#eef6ff', color: '#0f4c81', fontSize: 14 }}>
                    Ищем сотрудника по фото...
                </div>
            )}

            {recognitionError && (
                <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: '#fff1f1', color: '#b42318', fontSize: 14 }}>
                    {recognitionError}
                </div>
            )}

            {recognitionResult?.best_match && !recognitionBusy && !recognitionError && (
                <div
                    style={{
                        marginBottom: 12,
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: `1px solid ${recognitionResult.matched ? '#b7e1c0' : '#f4d58d'}`,
                        background: recognitionResult.matched ? '#ecfdf3' : '#fff7e6',
                        color: recognitionResult.matched ? '#166534' : '#8a5a00',
                    }}
                >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>
                        {confirmedRecognitionCandidate
                            ? 'Кандидат подтверждён'
                            : (recognitionRejectedAll
                                ? 'Кандидаты отклонены'
                                : 'Проверьте эталонное фото кандидата')}
                    </div>
                    {currentRecognitionCandidate && !recognitionRejectedAll && (
                        <>
                            <div style={{ fontSize: 12, marginBottom: 10, opacity: 0.9 }}>
                                Кандидат {Math.min(recognitionReviewIndex + 1, recognitionReviewCandidates.length)} из {recognitionReviewCandidates.length}
                            </div>
                            {currentRecognitionCandidate.reference_image_url && (
                                <img
                                    src={currentRecognitionCandidate.reference_image_url}
                                    alt={currentRecognitionCandidate.full_name || 'Эталонное фото'}
                                    style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 10, display: 'block', marginBottom: 10, background: '#111' }}
                                />
                            )}
                            <div style={{ fontSize: 14, lineHeight: 1.5 }}>
                                {currentRecognitionCandidate.full_name || 'Без имени'}
                                {currentRecognitionCandidate.department ? ` · ${currentRecognitionCandidate.department}` : ''}
                                {currentRecognitionCandidate.position ? ` · ${currentRecognitionCandidate.position}` : ''}
                            </div>
                            <div style={{ fontSize: 12, marginTop: 4, opacity: 0.9 }}>
                                Совпадение: {formatSimilarityPercent(currentRecognitionCandidate.similarity)}
                                {currentRecognitionCandidate.source_label ? ` · ${currentRecognitionCandidate.source_label}` : ''}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                                <button type="button" style={{ ...smallButtonStyle, background: '#166534', color: '#fff' }} onClick={() => applyRecognitionCandidate(currentRecognitionCandidate)}>
                                    Это он(-а)
                                </button>
                                <button type="button" style={{ ...smallButtonStyle, background: '#b42318', color: '#fff' }} onClick={moveToNextRecognitionCandidate}>
                                    Это не он(-а)
                                </button>
                            </div>
                        </>
                    )}
                    {confirmedRecognitionCandidate && (
                        <div style={{ fontSize: 12, marginTop: 8 }}>
                            Охранник подтвердил сотрудника по эталонному фото. Данные подставлены в форму.
                        </div>
                    )}
                    {recognitionRejectedAll && (
                        <div style={{ fontSize: 12, marginTop: 8 }}>
                            Три кандидата отклонены. Заполните сотрудника вручную ниже. Фото для распознавания будет сохранено как новый эталон.
                        </div>
                    )}
                </div>
            )}

            <label>Дата и время</label>
            <input
                style={inputStyle}
                type="datetime-local"
                value={occurredAt}
                onChange={(event) => setOccurredAt(event.target.value)}
                required
            />

            <label>ФИО нарушителя</label>
            <input
                style={inputStyle}
                value={manualFullName}
                onChange={(event) => setManualFullName(event.target.value)}
                required={recognitionRejectedAll || (!confirmedRecognitionCandidate && !recognitionFile)}
            />

            <label>Отдел</label>
            <input style={inputStyle} value={manualDepartment} onChange={(event) => setManualDepartment(event.target.value)} placeholder="Необязательно" />

            <label>Должность</label>
            <input style={inputStyle} value={manualPosition} onChange={(event) => setManualPosition(event.target.value)} placeholder="Необязательно" />

            <label>Локация</label>
            <input style={inputStyle} value={locationLabel} onChange={(event) => setLocationLabel(event.target.value)} placeholder="КПП, цех, склад" />

            <label>Описание</label>
            <textarea style={{ ...inputStyle, minHeight: 72 }} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Что произошло" />

            <label>Фото или видео нарушения</label>
            <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
                multiple
                onChange={handleFileSelection}
                style={{ ...inputStyle, padding: 8 }}
            />
            <div style={{ fontSize: 12, color: '#666', marginTop: -8, marginBottom: 12 }}>
                Необязательно. До 5 файлов. Поддерживаются фото и видео. Фото автоматически сжимаются перед отправкой.
            </div>

            {files.length > 0 && (
                <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
                    {files.map((file, index) => (
                        <div key={`${file.name}-${index}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: '1px solid #ddd', borderRadius: 10, padding: '10px 12px' }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                                <div style={{ fontSize: 12, color: '#666' }}>
                                    {file.type.startsWith('video/') ? 'Видео' : 'Фото'} · {(file.size / 1024 / 1024).toFixed(2)} MB
                                </div>
                            </div>
                            <button type="button" style={{ ...smallButtonStyle, background: '#fdecea', color: '#b42318' }} onClick={() => removeFile(index)}>
                                Убрать
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {err && <p style={{ color: 'crimson' }}>{err}</p>}
            <button type="submit" disabled={busy || loadingCatalog || catalog.length === 0} style={btnDanger}>{busy ? 'Сохранение…' : 'Сохранить нарушение'}</button>
            <button type="button" style={btnSecondary} onClick={onViewList}>Мои нарушения</button>
            <button type="button" style={btnSecondary} onClick={onBack}>← Назад</button>
        </form>
    );
}

function ViolationsIncidentList({
    incidents,
    loading,
    onReload,
    onCreate,
    onBack,
}: {
    incidents: ViolationIncidentItem[];
    loading: boolean;
    onReload: () => void;
    onCreate: () => void;
    onBack: () => void;
}) {
    const [preview, setPreview] = useState<{ evidence: ViolationEvidenceItem; title: string } | null>(null);

    return (
        <>
            <h3 style={{ marginBottom: 8 }}>Мои нарушения</h3>
            <button type="button" style={btnSecondary} onClick={onReload} disabled={loading}>
                {loading ? 'Обновление…' : 'Обновить'}
            </button>
            {loading && incidents.length === 0 && <p>Загрузка списка...</p>}
            {!loading && incidents.length === 0 && <p>Вы ещё не зафиксировали ни одного нарушения.</p>}
            {incidents.map((incident) => {
                const evidences = incident.evidences.filter((evidence) => Boolean(evidence.url));

                return (
                    <div key={incident.id} style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
                            <div>
                                <div style={{ fontWeight: 700 }}>{incident.employee_full_name || 'Без ФИО'}</div>
                                <div style={{ fontSize: 13, color: '#555' }}>{incident.category_name || '—'} / {incident.type_name || '—'}</div>
                            </div>
                            <span style={{ padding: '4px 8px', borderRadius: 999, background: '#f3f4f6', color: '#111827', fontSize: 12, whiteSpace: 'nowrap' }}>
                                {violationStatusLabels[incident.workflow_status] || incident.workflow_status}
                            </span>
                        </div>
                        <div style={{ fontSize: 13, color: '#444', display: 'grid', gap: 4 }}>
                            <div>Когда: {formatDateTimeLabel(incident.occurred_at)}</div>
                            {incident.employee_department && <div>Отдел: {incident.employee_department}</div>}
                            {incident.location_label && <div>Локация: {incident.location_label}</div>}
                            {incident.description && <div>Описание: {incident.description}</div>}
                            <div>Доказательства: {incident.evidence_photo_count} фото / {incident.evidence_video_count} видео</div>
                        </div>
                        {evidences.length > 0 && (
                            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: evidences.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr', marginTop: 10 }}>
                                {evidences.map((evidence) => (
                                    evidence.media_kind === 'photo'
                                        ? (
                                            <button
                                                key={evidence.id}
                                                type="button"
                                                onClick={() => setPreview({ evidence, title: incident.type_name || 'Нарушение' })}
                                                style={{ border: 'none', padding: 0, background: 'transparent', cursor: 'zoom-in' }}
                                            >
                                                <img
                                                    src={evidence.url ?? ''}
                                                    alt={incident.type_name || 'Нарушение'}
                                                    style={{ width: '100%', borderRadius: 10, maxHeight: 220, objectFit: 'cover', display: 'block' }}
                                                />
                                            </button>
                                        )
                                        : (
                                            <video
                                                key={evidence.id}
                                                src={evidence.url ?? ''}
                                                controls
                                                style={{ width: '100%', borderRadius: 10, maxHeight: 220, background: '#111' }}
                                            />
                                        )
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
            <button type="button" style={btnDanger} onClick={onCreate}>Зафиксировать новое нарушение</button>
            <button type="button" style={btnSecondary} onClick={onBack}>← Назад</button>
            {preview?.evidence.url && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.88)', zIndex: 1000, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setPreview(null)}
                >
                    <div
                        style={{ width: '100%', maxWidth: 960, display: 'grid', gap: 12 }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, color: '#fff' }}>
                            <div style={{ fontWeight: 700 }}>{preview.title}</div>
                            <button type="button" style={{ ...smallButtonStyle, background: '#fff', color: '#111' }} onClick={() => setPreview(null)}>
                                Закрыть
                            </button>
                        </div>
                        <img
                            src={preview.evidence.url}
                            alt={preview.title}
                            style={{ width: '100%', maxHeight: '82vh', objectFit: 'contain', borderRadius: 12, background: '#111' }}
                        />
                    </div>
                </div>
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

function UtilizationCreateForm({
    initData,
    onDone,
    onCancel,
}: {
    initData: string;
    onDone: () => void | Promise<void>;
    onCancel: () => void;
}) {
    const [plateNumber, setPlateNumber] = useState('');
    const [driverName, setDriverName] = useState('');
    const [comment, setComment] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [checkingPlate, setCheckingPlate] = useState(false);
    const [plateExists, setPlateExists] = useState<boolean | null>(null);
    const [plateHint, setPlateHint] = useState<string | null>(null);
    const [missingTruckConfirmations, setMissingTruckConfirmations] = useState(0);
    const [err, setErr] = useState<string | null>(null);
    const requestDate = toDateLocalValue();
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }

        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }

        setCameraOpen(false);
    }, []);

    useEffect(() => {
        return () => {
            stopCamera();
        };
    }, [stopCamera]);

    useEffect(() => {
        if (!cameraOpen || !videoRef.current || !streamRef.current) {
            return;
        }

        videoRef.current.srcObject = streamRef.current;
        void videoRef.current.play().catch(() => undefined);
    }, [cameraOpen]);

    const checkTruckInBase = useCallback(async (rawPlateNumber: string) => {
        const normalizedPlateNumber = normalizePlateNumber(rawPlateNumber);

        if (normalizedPlateNumber === '') {
            setPlateExists(null);
            setPlateHint(null);

            return { normalizedPlateNumber, truck: null as UtilizationTruckOption | null };
        }

        setCheckingPlate(true);
        try {
            const response = await axios.get<{ data: UtilizationTruckOption[] }>('/api/telegram/miniapp/utilization/trucks', {
                params: {
                    init_data: initData,
                    search: normalizedPlateNumber,
                },
                headers: { 'X-Telegram-Init-Data': initData },
            });

            const exactTruck = (response.data.data ?? []).find((truck) => normalizePlateNumber(truck.plate_number ?? '') === normalizedPlateNumber) ?? null;

            setPlateExists(Boolean(exactTruck));
            setPlateHint(exactTruck
                ? `Машина найдена в базе${exactTruck.name ? `: ${exactTruck.name}` : ''}.`
                : 'Такой машины нет в базе. Проверьте номер внимательно.');

            return {
                normalizedPlateNumber,
                truck: exactTruck,
            };
        } finally {
            setCheckingPlate(false);
        }
    }, [initData]);

    const handlePlateBlur = async () => {
        if (plateNumber.trim() === '') {
            return;
        }

        try {
            await checkTruckInBase(plateNumber);
        } catch {
            setPlateExists(null);
            setPlateHint('Не удалось проверить номер машины в базе.');
        }
    };

    const startCamera = async () => {
        if (photos.length >= MAX_REQUEST_PHOTOS) {
            return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            setErr('Не удалось открыть камеру на этом устройстве.');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
                audio: false,
            });

            streamRef.current = stream;
            setCameraOpen(true);
            setErr(null);
        } catch {
            setErr('Не удалось получить доступ к камере.');
        }
    };

    const capturePhoto = async () => {
        if (!videoRef.current || !canvasRef.current) {
            return;
        }

        if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
            setErr('Камера ещё не готова. Попробуйте ещё раз.');
            return;
        }

        try {
            const canvas = canvasRef.current;
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;

            const context = canvas.getContext('2d');
            if (!context) {
                setErr('Не удалось обработать снимок.');
                return;
            }

            context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            const compressed = await compressImageDataUrl(canvas.toDataURL('image/jpeg', 0.92));

            setPhotos((current) => [...current, compressed].slice(0, MAX_REQUEST_PHOTOS));
            stopCamera();
            setErr(null);
        } catch {
            setErr('Не удалось сделать фото.');
        }
    };

    const removePhoto = (index: number) => {
        setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
    };

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        const normalizedPlateNumber = normalizePlateNumber(plateNumber);

        if (normalizedPlateNumber === '') {
            setErr('Укажите номер машины');
            return;
        }
        if (driverName.trim() === '') {
            setErr('Укажите имя водителя');
            return;
        }
        if (photos.length === 0) {
            setErr('Добавьте хотя бы одно фото');
            return;
        }

        let truckLookup: { normalizedPlateNumber: string; truck: UtilizationTruckOption | null };
        try {
            truckLookup = await checkTruckInBase(normalizedPlateNumber);
        } catch {
            setErr('Не удалось проверить номер машины в базе');
            return;
        }

        let createTruckConfirmation: number | undefined;
        if (!truckLookup.truck) {
            const confirmed = typeof window.confirm === 'function'
                ? window.confirm('Такой машины у нас нет в базе. Вы точно ввели номер машины правильно?')
                : true;

            if (!confirmed) {
                setErr('Проверьте номер машины и попробуйте снова.');
                return;
            }

            const nextConfirmationCount = missingTruckConfirmations + 1;
            setMissingTruckConfirmations(nextConfirmationCount);

            if (nextConfirmationCount < UNKNOWN_TRUCK_CONFIRMATION_LIMIT) {
                setErr(`Такой машины нет в базе. Если номер верный, подтвердите ещё ${UNKNOWN_TRUCK_CONFIRMATION_LIMIT - nextConfirmationCount} раз(а).`);
                return;
            }

            createTruckConfirmation = nextConfirmationCount;
        } else {
            setMissingTruckConfirmations(0);
        }

        setBusy(true);
        setErr(null);
        try {
            await axios.post('/api/telegram/miniapp/utilization/requests', {
                init_data: initData,
                plate_number: truckLookup.normalizedPlateNumber,
                driver_name: driverName.trim(),
                comment: comment.trim() || null,
                photos,
                ...(createTruckConfirmation !== undefined ? { create_truck_confirmation: createTruckConfirmation } : {}),
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
            <h3>Аварийный вызов техслужб</h3>
            <label>Номер машины</label>
            <input
                style={inputStyle}
                value={plateNumber}
                onChange={(event) => {
                    setPlateNumber(normalizePlateNumber(event.target.value));
                    setPlateExists(null);
                    setPlateHint(null);
                    setMissingTruckConfirmations(0);
                }}
                onBlur={() => void handlePlateBlur()}
                placeholder="Например, A123BC01"
                autoComplete="off"
                required
            />
            {(checkingPlate || plateHint) && (
                <div style={{ marginTop: -8, marginBottom: 12, fontSize: 12, color: checkingPlate ? '#666' : (plateExists ? '#2e8b57' : '#a16207') }}>
                    {checkingPlate ? 'Проверяем номер машины в базе…' : plateHint}
                </div>
            )}

            <label>Имя водителя</label>
            <input style={inputStyle} value={driverName} onChange={(e) => setDriverName(e.target.value)} required />

            <label>Дата вызова</label>
            <input style={inputStyle} type="date" value={requestDate} disabled readOnly />

            <label>Комментарий</label>
            <textarea style={{ ...inputStyle, minHeight: 60 }} value={comment} onChange={(e) => setComment(e.target.value)} />

            <label>Фото</label>
            <button type="button" style={btn} onClick={() => void startCamera()} disabled={cameraOpen || photos.length >= MAX_REQUEST_PHOTOS}>
                {cameraOpen ? 'Камера открыта' : photos.length === 0 ? 'Открыть камеру' : 'Сделать ещё фото'}
            </button>
            <div style={{ fontSize: 12, color: '#666', marginTop: -8, marginBottom: 12 }}>
                Фото обязательны. Съёмка идёт напрямую с камеры, до {MAX_REQUEST_PHOTOS} фото на заявку.
            </div>
            {cameraOpen && (
                <div style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12, marginBottom: 12, background: '#111' }}>
                    <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 8, display: 'block', background: '#000' }} />
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button type="button" style={{ ...smallButtonStyle, flex: 1, background: '#2481cc', color: '#fff' }} onClick={() => void capturePhoto()}>
                            Сделать фото
                        </button>
                        <button type="button" style={{ ...smallButtonStyle, flex: 1, background: '#e0e0e0', color: '#222' }} onClick={stopCamera}>
                            Отмена
                        </button>
                    </div>
                </div>
            )}
            {photos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
                    {photos.map((photo, index) => (
                        <div key={`${index}-${photo.slice(0, 24)}`} style={{ position: 'relative', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
                            <img src={photo} alt={`Фото ${index + 1}`} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                            <button
                                type="button"
                                onClick={() => removePhoto(index)}
                                style={{ position: 'absolute', top: 8, right: 8, border: 'none', borderRadius: 999, background: 'rgba(192,57,43,.92)', color: '#fff', width: 28, height: 28, cursor: 'pointer' }}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {err && <p style={{ color: 'crimson' }}>{err}</p>}
            <button type="submit" disabled={busy} style={btn}>{busy ? 'Создание…' : 'Отправить заявку'}</button>
            <button type="button" style={btnSecondary} onClick={onCancel}>Отмена</button>
        </form>
    );
}

function UtilizationRequestList({
    requests,
    onBack,
    onCreate,
}: {
    requests: UtilizationRequestItem[];
    onBack: () => void;
    onCreate: () => void;
}) {
    return (
        <>
            <h3>Мои заявки на аварийный вызов техслужб</h3>
            {requests.length === 0 && <p>Заявок пока нет.</p>}
            {requests.map((request) => (
                <div key={request.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, margin: '8px 0' }}>
                    <strong>#{request.id} {request.plate_number || request.equipment_name}</strong>
                    <div>Статус: {request.status_label || utilizationStatusLabels[request.status] || request.status}</div>
                    {request.driver_name && <div>Водитель: {request.driver_name}</div>}
                    <div>Дата вызова: {
                        request.requested_start
                            ? new Date(request.requested_start).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
                            : request.start_date
                    }</div>
                    {request.comment && <div>Комментарий: {request.comment}</div>}
                    {request.photo_urls && request.photo_urls.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
                            {request.photo_urls.map((photo, index) => (
                                <img key={`${request.id}-${index}`} src={photo} alt={`Фото заявки ${request.id}`} style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid #ddd' }} />
                            ))}
                        </div>
                    )}
                    {request.created_at && <div>Создана: {new Date(request.created_at).toLocaleString()}</div>}
                </div>
            ))}
            <button style={btn} onClick={onCreate}>Создать новую заявку</button>
            <button style={btnSecondary} onClick={onBack}>← Назад</button>
        </>
    );
}

// ── Главный компонент ─────────────────────────────────────────────────────────
function buildDefaultRequestStart(): string {
    const date = new Date();
    date.setMinutes(0, 0, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:00`;
}

function buildDefaultRequestEnd(): string {
    const date = new Date();
    date.setHours(date.getHours() + 8);
    date.setMinutes(0, 0, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}:00`;
}

function toDateTimeLocal(value?: string | null): string {
    if (!value) return '';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function SpectechCreateForm({
    initData,
    onDone,
    onCancel,
    request,
    isOperator = false,
    currentUserName = '',
    currentUserPhone = '',
}: {
    initData: string;
    onDone: () => void | Promise<void>;
    onCancel: () => void;
    request?: SpectechRequestItem | null;
    isOperator?: boolean;
    currentUserName?: string;
    currentUserPhone?: string;
}) {
    const [trucks, setTrucks] = useState<SpectechTruckOption[]>([]);
    const [truckId, setTruckId] = useState<number | ''>(request?.equipment_id ?? '');
    const [initiatorName, setInitiatorName] = useState('');
    const [initiatorPhone, setInitiatorPhone] = useState('');
    const [driverName, setDriverName] = useState('');
    const [driverPhone, setDriverPhone] = useState('');
    const [requestedStart, setRequestedStart] = useState(buildDefaultRequestStart);
    const [requestedEnd, setRequestedEnd] = useState(buildDefaultRequestEnd);
    const [terminal, setTerminal] = useState('T1');
    const [selectedLocationId, setSelectedLocationId] = useState<number | ''>('');
    const [zone, setZone] = useState('');
    const [gate, setGate] = useState('');
    const [address, setAddress] = useState('');
    const [comment, setComment] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [loadingTrucks, setLoadingTrucks] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [availabilityWarn, setAvailabilityWarn] = useState<string | null>(null);
    const [freeAlternative, setFreeAlternative] = useState<{ id: number; name: string; plate_number: string } | null>(null);

    const normalizedTerminal = terminal.trim().toUpperCase();
    const hasPresetLocations = isKnownTerminal(normalizedTerminal);
    const filteredLocations = hasPresetLocations
        ? MOCK_LOCATIONS.filter((location) => location.terminal === normalizedTerminal)
        : [];
    const selectedLocation = filteredLocations.find((location) => location.id === selectedLocationId) ?? null;

    useEffect(() => {
        if (!request) {
            setTruckId('');
            setInitiatorName(isOperator ? currentUserName : '');
            setInitiatorPhone(isOperator ? currentUserPhone : '');
            setDriverName('');
            setDriverPhone('');
            setRequestedStart(buildDefaultRequestStart());
            setRequestedEnd(buildDefaultRequestEnd());
            setTerminal('T1');
            setSelectedLocationId('');
            setZone('');
            setGate('');
            setAddress('');
            setComment('');
            setPhotos([]);
            setErr(null);
            return;
        }

        const presetLocation = isKnownTerminal(request.terminal)
            ? MOCK_LOCATIONS.find((location) => (
                location.terminal === request.terminal
                && location.building === request.zone
                && (request.gate ? location.gate === request.gate : true)
            )) ?? null
            : null;

        setTruckId(request.equipment_id ?? '');
        setInitiatorName(request.initiator_name ?? request.client_name ?? (isOperator ? currentUserName : ''));
        setInitiatorPhone(request.initiator_phone ?? (isOperator ? currentUserPhone : ''));
        setDriverName(request.driver_name ?? '');
        setDriverPhone(request.driver_phone ?? '');
        setRequestedStart(toDateTimeLocal(request.requested_start) || buildDefaultRequestStart());
        setRequestedEnd(toDateTimeLocal(request.requested_end) || buildDefaultRequestEnd());
        setTerminal(request.terminal ?? 'T1');
        setSelectedLocationId(presetLocation?.id ?? '');
        setZone(presetLocation?.building ?? (request.zone ?? ''));
        setGate(request.gate ?? '');
        setAddress(request.address ?? '');
        setComment(request.comment ?? '');
        setPhotos(request.photo_urls ?? request.photos ?? []);
        setErr(null);
    }, [request, isOperator, currentUserName, currentUserPhone]);

    useEffect(() => {
        if (!selectedLocation) {
            return;
        }

        setZone(selectedLocation.building);
        setAddress(buildSpectechAddress(
            normalizedTerminal,
            selectedLocation.building,
            gate.trim() || null,
            formatLocationStatus(selectedLocation.status),
            selectedLocation.purpose,
        ));
    }, [selectedLocation, normalizedTerminal, gate]);

    useEffect(() => {
        if (hasPresetLocations) {
            return;
        }

        setSelectedLocationId('');
        setAddress(buildSpectechAddress(normalizedTerminal || terminal.trim(), zone.trim(), gate.trim() || null));
    }, [hasPresetLocations, terminal, normalizedTerminal, zone, gate]);

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

    useEffect(() => {
        if (!truckId || !requestedStart || !requestedEnd) {
            setAvailabilityWarn(null);
            setFreeAlternative(null);
            return;
        }

        const ctrl = new AbortController();
        axios
            .get<{ available: boolean; message: string; free_alternative?: { id: number; name: string; plate_number: string } | null }>(
                '/api/telegram/miniapp/spectech/check-availability',
                {
                    params: {
                        init_data: initData,
                        truck_id: truckId,
                        requested_start: requestedStart,
                        requested_end: requestedEnd,
                        ...(request?.schedule_id ? { exclude_schedule_id: request.schedule_id } : {}),
                    },
                    headers: { 'X-Telegram-Init-Data': initData },
                    signal: ctrl.signal,
                },
            )
            .then((res) => {
                if (!res.data.available) {
                    setAvailabilityWarn(res.data.message ?? 'Техника занята');
                    setFreeAlternative(res.data.free_alternative ?? null);
                } else {
                    setAvailabilityWarn(null);
                    setFreeAlternative(null);
                }
            })
            .catch(() => { /* ignore */ });
        return () => ctrl.abort();
    }, [truckId, requestedStart, requestedEnd, initData, request?.schedule_id]);

    const handlePhotoSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);

        if (files.length === 0) {
            return;
        }

        try {
            const availableSlots = Math.max(0, MAX_REQUEST_PHOTOS - photos.length);
            const selectedFiles = files.slice(0, availableSlots);
            const compressed = await Promise.all(selectedFiles.map(async (file) => {
                const dataUrl = await readFileAsDataUrl(file);
                return compressImageDataUrl(dataUrl);
            }));

            setPhotos((current) => [...current, ...compressed].slice(0, MAX_REQUEST_PHOTOS));
            setErr(null);
        } catch (error) {
            setErr(error instanceof Error ? error.message : 'Не удалось добавить фото');
        } finally {
            event.target.value = '';
        }
    };

    const removePhoto = (index: number) => {
        setPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index));
    };

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!truckId) {
            setErr('Выберите технику');
            return;
        }

        if (!normalizedTerminal) {
            setErr('Укажите терминал');
            return;
        }

        if (hasPresetLocations && !selectedLocation) {
            setErr('Выберите здание для терминала');
            return;
        }

        if (!zone.trim()) {
            setErr('Укажите здание или объект');
            return;
        }

        setBusy(true);
        setErr(null);
        try {
            const payload: any = {
                init_data: initData,
                truck_id: truckId,
                requested_start: requestedStart,
                requested_end: requestedEnd,
                terminal: normalizedTerminal,
                zone: zone.trim(),
                gate: gate.trim() || null,
                address: address.trim() || buildSpectechAddress(normalizedTerminal, zone.trim(), gate.trim() || null),
                comment: comment.trim() || null,
                photos,
            };

            if (isOperator) {
                payload.initiator_name = initiatorName.trim() || null;
                payload.initiator_phone = initiatorPhone.trim() || null;
                payload.driver_name = driverName.trim() || null;
                payload.driver_phone = driverPhone.trim() || null;
            }

            if (request) {
                await axios.put(`/api/telegram/miniapp/spectech/requests/${request.id}`, payload, {
                    headers: { 'X-Telegram-Init-Data': initData },
                });
            } else {
                await axios.post('/api/telegram/miniapp/spectech/requests', payload, {
                    headers: { 'X-Telegram-Init-Data': initData },
                });
            }

            await onDone();
        } catch (error: any) {
            setErr(getErrorMessage(error, request ? 'Не удалось обновить заявку' : 'Не удалось создать заявку'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit}>
            <h3>{request ? `Редактирование заявки #${request.id}` : 'Новая заявка на спецтехнику'}</h3>
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
                        {formatTruckOptionLabel(truck)}
                    </option>
                ))}
            </select>

            {isOperator && (
                <>
                    <label>Инициатор</label>
                    <input style={inputStyle} value={initiatorName} onChange={(e) => setInitiatorName(e.target.value)} placeholder="Кто подал заявку" />

                    <label>Телефон инициатора</label>
                    <input style={inputStyle} type="tel" value={initiatorPhone} onChange={(e) => setInitiatorPhone(e.target.value)} placeholder="+7..." />

                    <label>Имя водителя</label>
                    <input style={inputStyle} value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Необязательно" />

                    <label>Телефон водителя</label>
                    <input style={inputStyle} type="tel" value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} placeholder="+7..." />
                </>
            )}

            <label>Дата и время начала</label>
            <input style={inputStyle} type="datetime-local" value={requestedStart} onChange={(e) => setRequestedStart(e.target.value)} required />

            <label>Дата и время окончания</label>
            <input style={inputStyle} type="datetime-local" value={requestedEnd} onChange={(e) => setRequestedEnd(e.target.value)} required />

            {availabilityWarn && (
                <div style={{ background: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13 }}>
                    <strong>⚠️ {availabilityWarn}</strong>
                    <div style={{ marginTop: 6 }}>
                        Заявку можно отправить. Диспетчер увидит конфликт и скорректирует планирование.
                    </div>
                    {freeAlternative && (
                        <div style={{ marginTop: 6 }}>
                            Свободна альтернатива:{' '}
                            <button
                                type="button"
                                style={{ background: 'none', border: 'none', color: '#1a73e8', textDecoration: 'underline', cursor: 'pointer', fontSize: 13, padding: 0 }}
                                onClick={() => { setTruckId(freeAlternative.id); setAvailabilityWarn(null); setFreeAlternative(null); }}
                            >
                                {freeAlternative.name} ({freeAlternative.plate_number})
                            </button>
                        </div>
                    )}
                </div>
            )}

            <label>Терминал</label>
            <input
                list="spectech-terminal-options"
                style={inputStyle}
                value={terminal}
                onChange={(e) => {
                    setTerminal(e.target.value);
                    setSelectedLocationId('');
                    setZone('');
                    setGate('');
                    setAddress('');
                }}
                placeholder="T1 / T2 / T3 / T4 или свой"
                required
            />
            <datalist id="spectech-terminal-options">
                {KNOWN_TERMINALS.map((item) => (
                    <option key={item} value={item} />
                ))}
            </datalist>

            {TERMINAL_INFO[normalizedTerminal] && (
                <div style={{ marginTop: -8, marginBottom: 12, fontSize: 12, color: '#666' }}>
                    {TERMINAL_INFO[normalizedTerminal].description}
                </div>
            )}

            {hasPresetLocations ? (
                <>
                    <label>Здание / зона</label>
                    <select
                        style={inputStyle}
                        value={selectedLocationId}
                        onChange={(e) => {
                            const value = e.target.value ? Number(e.target.value) : '';
                            setSelectedLocationId(value);
                            if (!value) {
                                setZone('');
                                setGate('');
                                setAddress('');
                            }
                            if (value) {
                                setGate('');
                            }
                        }}
                        required
                    >
                        <option value="">Выберите здание</option>
                        {filteredLocations.map((location) => (
                            <option key={location.id} value={location.id}>
                                {location.building} · {location.purpose}
                            </option>
                        ))}
                    </select>
                        {selectedLocation && (
                            <div style={{ marginTop: -8, marginBottom: 12, fontSize: 12, color: '#666' }}>
                                {formatLocationStatus(selectedLocation.status)} · {selectedLocation.purpose}
                            </div>
                        )}

                    <label>Гейт для заявки</label>
                    <input style={inputStyle} value={gate} onChange={(e) => setGate(e.target.value)} />
                </>
            ) : (
                <>
                    <label>Зона / объект</label>
                    <input style={inputStyle} value={zone} onChange={(e) => setZone(e.target.value)} required />

                    <label>Гейт для заявки</label>
                    <input style={inputStyle} value={gate} onChange={(e) => setGate(e.target.value)} />
                </>
            )}

            <label>Адрес</label>
            <input style={{ ...inputStyle, background: '#f7f7f7' }} value={address} onChange={(e) => setAddress(e.target.value)} required />

            <label>Комментарий</label>
            <textarea style={{ ...inputStyle, minHeight: 60 }} value={comment} onChange={(e) => setComment(e.target.value)} />

            <label>Фото</label>
            <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoSelection}
                disabled={photos.length >= MAX_REQUEST_PHOTOS}
                style={{ ...inputStyle, padding: 8 }}
            />
            <div style={{ fontSize: 12, color: '#666', marginTop: -8, marginBottom: 12 }}>
                Можно загрузить до {MAX_REQUEST_PHOTOS} фото. Они будут сжаты перед отправкой.
            </div>
            {photos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
                    {photos.map((photo, index) => (
                        <div key={`${index}-${photo.slice(0, 24)}`} style={{ position: 'relative', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
                            <img src={photo} alt={`Фото ${index + 1}`} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                            <button
                                type="button"
                                onClick={() => removePhoto(index)}
                                style={{ position: 'absolute', top: 8, right: 8, border: 'none', borderRadius: 999, background: 'rgba(192,57,43,.92)', color: '#fff', width: 28, height: 28, cursor: 'pointer' }}
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {err && <p style={{ color: 'crimson' }}>{err}</p>}
            <button type="submit" disabled={busy} style={btn}>{busy ? (request ? 'Сохранение…' : 'Создание…') : (request ? 'Сохранить изменения' : 'Создать заявку')}</button>
            <button type="button" style={btnSecondary} onClick={onCancel}>Отмена</button>
        </form>
    );
}

function SpectechRequestList({
    requests,
    onCreate,
    onEdit,
    onBack,
    onCancel,
}: {
    requests: SpectechRequestItem[];
    onCreate: () => void;
    onEdit: (request: SpectechRequestItem) => void;
    onBack: () => void;
    onCancel: (request: SpectechRequestItem) => void;
}) {
    const renderConflictDetails = (request: SpectechRequestItem) => (
        <div style={{ marginTop: 8, border: '1px solid #ffb74d', borderRadius: 8, padding: 8, background: '#fff8e1', color: '#7a4a00', fontSize: 14 }}>
            <strong>Техника занята на выбранный период</strong>
            <div style={{ marginTop: 4 }}>Заявка принята, диспетчер скорректирует планирование.</div>
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                {(request.conflict_info ?? []).map((conflict, idx) => (
                    <div key={`${conflict.truck_name}-${idx}`} style={{ border: '1px solid #ffd38a', borderRadius: 6, padding: 6, background: '#fff' }}>
                        <div style={{ fontWeight: 700 }}>
                            {conflict.truck_name}{conflict.plate_number ? ` (${conflict.plate_number})` : ''}
                        </div>
                        {conflict.free_at && <div>Свободна с: {conflict.free_at}</div>}
                        {(conflict.conflicts ?? []).map((item, itemIdx) => (
                            <div key={`${item.request_id ?? item.schedule_id ?? itemIdx}`} style={{ marginTop: 6, borderTop: '1px solid #ffe0a6', paddingTop: 6 }}>
                                <div style={{ fontWeight: 700 }}>
                                    {item.request_id ? `Заявка #${item.request_id}` : item.schedule_id ? `План #${item.schedule_id}` : 'Конфликтующая заявка'}
                                </div>
                                <div>{item.from || item.scheduled_start || '—'} — {item.to || item.scheduled_end || '—'}</div>
                                <div>Инициатор: <strong>{item.initiator_name || '—'}</strong>{item.initiator_phone ? ` · ${item.initiator_phone}` : ''}</div>
                                {item.purpose && <div>Суть: {item.purpose}</div>}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <>
            <h3>Мои заявки на спецтехнику</h3>
            {requests.length === 0 && <p>Заявок пока нет.</p>}
            {requests.map((request) => {
                const statusStyle = spectechStatusStyles[request.status] ?? spectechStatusStyles.new;
                const canModify = !finalSpectechStatuses.includes(request.status);

                return (
                    <div
                        key={request.id}
                        style={{
                            border: `1px solid ${statusStyle.border}`,
                            borderRadius: 8,
                            padding: 10,
                            margin: '8px 0',
                            background: request.status === 'cancelled' ? '#fffafa' : '#fff',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                            <strong>#{request.id} {request.equipment_name}</strong>
                            <span style={{ border: `1px solid ${statusStyle.border}`, borderRadius: 999, padding: '3px 8px', background: statusStyle.bg, color: statusStyle.color, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                {request.status_label || spectechStatusLabels[request.status] || request.status}
                            </span>
                        </div>
                        {request.plate_number && <div style={{ color: '#666', fontSize: 13 }}>Номер: {request.plate_number}</div>}
                        <div style={{ marginTop: 8, display: 'grid', gap: 4, fontSize: 14 }}>
                            {request.client_name && <div><strong>Инициатор:</strong> {request.client_name}{request.initiator_phone ? ` · ${request.initiator_phone}` : ''}</div>}
                            <div><strong>Период:</strong> {formatSpectechPeriod(request)}</div>
                            <div><strong>Локация:</strong> {request.terminal} / {request.zone}{request.gate ? ` / ${request.gate}` : ''}</div>
                            <div><strong>Адрес:</strong> {request.address || '—'}</div>
                            <div><strong>Водитель:</strong> {request.driver_name || '—'}{request.driver_phone ? ` · ${request.driver_phone}` : ''}</div>
                            {request.comment && <div><strong>Комментарий:</strong> {request.comment}</div>}
                            {request.photo_urls && request.photo_urls.length > 0 && <div><strong>Фото:</strong> {request.photo_urls.length}</div>}
                            {request.created_at && <div><strong>Создана:</strong> {formatSpectechDateTime(request.created_at)}</div>}
                        </div>
                        {request.status === 'cancelled' && (
                            <div style={{ marginTop: 8, border: '1px solid #f4b8b3', borderRadius: 8, padding: 8, background: '#fff1f1', color: '#9f1f17', fontSize: 14 }}>
                                <strong>Заявка отменена{request.cancelled_by ? `: ${request.cancelled_by === 'operator' ? 'оператором' : 'заказчиком'}` : ''}</strong>
                                <div style={{ marginTop: 4 }}>{request.cancellation_reason || 'Причина не указана'}</div>
                            </div>
                        )}
                        {request.status === 'new' && renderSpectechPlanningNotice()}
                        {request.updated_by_operator === true && renderSpectechOperatorUpdateNotice(request)}
                        {(request.conflict_info ?? []).length > 0 && renderConflictDetails(request)}
                        {canModify && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                <button type="button" style={{ ...btnSecondary, marginBottom: 0 }} onClick={() => onEdit(request)}>
                                    Изменить заявку
                                </button>
                                <button type="button" style={{ ...btnDanger, marginBottom: 0 }} onClick={() => onCancel(request)}>
                                    Отменить заявку
                                </button>
                            </div>
                        )}
                    </div>
                );
            })}
            <button style={btn} onClick={onCreate}>Создать новую заявку</button>
            <button style={btnSecondary} onClick={onBack}>← Назад</button>
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
    onEdit,
    onCancel,
    onBack,
}: {
    requests: SpectechRequestItem[];
    loading: boolean;
    error: string | null;
    statusFilter: string;
    onStatusFilterChange: (value: string) => void;
    onRefresh: () => void;
    onAdvanceStatus: (requestId: number, status: string) => Promise<void>;
    onEdit: (request: SpectechRequestItem) => void;
    onCancel: (request: SpectechRequestItem) => void;
    onBack: () => void;
}) {
    const [busyId, setBusyId] = useState<number | null>(null);

    const renderConflictDetails = (request: SpectechRequestItem) => (
        <div style={{ marginTop: 8, border: '1px solid #ffb74d', borderRadius: 8, padding: 8, background: '#fff8e1', color: '#7a4a00', fontSize: 14 }}>
            <strong>Техника занята на выбранный период</strong>
            <div style={{ marginTop: 4 }}>Заявка принята, требуется регулировка диспетчером.</div>
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                {(request.conflict_info ?? []).map((conflict, idx) => (
                    <div key={`${conflict.truck_name}-${idx}`} style={{ border: '1px solid #ffd38a', borderRadius: 6, padding: 6, background: '#fff' }}>
                        <div style={{ fontWeight: 700 }}>
                            {conflict.truck_name}{conflict.plate_number ? ` (${conflict.plate_number})` : ''}
                        </div>
                        {conflict.free_at && <div>Свободна с: {conflict.free_at}</div>}
                        {(conflict.conflicts ?? []).map((item, itemIdx) => (
                            <div key={`${item.request_id ?? item.schedule_id ?? itemIdx}`} style={{ marginTop: 6, borderTop: '1px solid #ffe0a6', paddingTop: 6 }}>
                                <div style={{ fontWeight: 700 }}>
                                    {item.request_id ? `Заявка #${item.request_id}` : item.schedule_id ? `План #${item.schedule_id}` : 'Конфликтующая заявка'}
                                </div>
                                <div>{item.from || item.scheduled_start || '—'} — {item.to || item.scheduled_end || '—'}</div>
                                <div>Инициатор: <strong>{item.initiator_name || '—'}</strong>{item.initiator_phone ? ` · ${item.initiator_phone}` : ''}</div>
                                {item.purpose && <div>Суть: {item.purpose}</div>}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );

    const handleAdvance = async (request: SpectechRequestItem) => {
        const nextStatus = nextSpectechStatus[request.status];
        if (!nextStatus) return;
        setBusyId(request.id);
        try {
            await onAdvanceStatus(request.id, nextStatus);
        } finally {
            setBusyId(null);
        }
    };

    return (
        <>
            <h3>Панель оператора спецтехники</h3>
            <label>Фильтр по статусу</label>
            <select style={inputStyle} value={statusFilter} onChange={(e) => onStatusFilterChange(e.target.value)}>
                {spectechStatusOptions.map((opt) => (
                    <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
                ))}
            </select>
            <button type="button" style={btnSecondary} onClick={onRefresh} disabled={loading}>
                {loading ? 'Обновление…' : 'Обновить список'}
            </button>
            {error && <p style={{ color: 'crimson' }}>{error}</p>}
            {!loading && requests.length === 0 && <p>Заявок пока нет.</p>}
            {requests.map((request) => {
                const statusStyle = spectechStatusStyles[request.status] ?? spectechStatusStyles.new;
                const canModify = !finalSpectechStatuses.includes(request.status);

                return (
                    <div
                        key={request.id}
                        style={{
                            border: `1px solid ${statusStyle.border}`,
                            borderRadius: 8,
                            padding: 10,
                            margin: '8px 0',
                            opacity: busyId === request.id ? 0.65 : 1,
                            background: request.status === 'cancelled' ? '#fffafa' : '#fff',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                            <strong>#{request.id} {request.equipment_name}</strong>
                            <span style={{ border: `1px solid ${statusStyle.border}`, borderRadius: 999, padding: '3px 8px', background: statusStyle.bg, color: statusStyle.color, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                {request.status_label || spectechStatusLabels[request.status] || request.status}
                            </span>
                        </div>
                        {request.plate_number && <div style={{ color: '#666', fontSize: 13 }}>Номер: {request.plate_number}</div>}
                        <div style={{ marginTop: 8, display: 'grid', gap: 4, fontSize: 14 }}>
                            {request.client_name && <div><strong>Инициатор:</strong> {request.client_name}{request.initiator_phone ? ` · ${request.initiator_phone}` : ''}{request.source_label ? ` · ${request.source_label}` : ''}</div>}
                            <div><strong>Период:</strong> {formatSpectechPeriod(request)}</div>
                            <div><strong>Локация:</strong> {request.terminal} / {request.zone}{request.gate ? ` / ${request.gate}` : ''}</div>
                            <div><strong>Адрес:</strong> {request.address || '—'}</div>
                            <div><strong>Водитель:</strong> {request.driver_name || '—'}{request.driver_phone ? ` · ${request.driver_phone}` : ''}</div>
                            {request.comment && <div><strong>Комментарий:</strong> {request.comment}</div>}
                            {request.created_at && <div><strong>Создана:</strong> {formatSpectechDateTime(request.created_at)}</div>}
                        </div>
                        {request.status === 'cancelled' && (
                            <div style={{ marginTop: 8, border: '1px solid #f4b8b3', borderRadius: 8, padding: 8, background: '#fff1f1', color: '#9f1f17', fontSize: 14 }}>
                                <strong>Заявка отменена{request.cancelled_by ? `: ${request.cancelled_by === 'operator' ? 'оператором' : 'заказчиком'}` : ''}</strong>
                                <div style={{ marginTop: 4 }}>{request.cancellation_reason || 'Причина не указана'}</div>
                            </div>
                        )}
                        {(request.conflict_info ?? []).length > 0 && renderConflictDetails(request)}

                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            {nextSpectechStatus[request.status] && (
                                <button
                                    style={{ ...btn }}
                                    disabled={busyId === request.id}
                                    onClick={() => handleAdvance(request)}
                                >
                                    {busyId === request.id ? 'Сохранение…' : `→ ${spectechStatusLabels[nextSpectechStatus[request.status]]}`}
                                </button>
                            )}
                            {canModify && (
                                <>
                                    <button type="button" style={{ ...btnSecondary }} onClick={() => onEdit(request)}>Изменить</button>
                                    <button type="button" style={{ ...btnDanger }} onClick={() => onCancel(request)}>Отменить</button>
                                </>
                            )}
                        </div>
                    </div>
                );
            })}
            <button style={btnSecondary} onClick={onBack}>← Назад</button>
        </>
    );
}

function TelegramMiniApp() {
    const [initData, setInitData] = useState<string>('');
    const [session, setSession] = useState<SessionPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [view, setView] = useState<'home' | 'register' | 'create' | 'edit' | 'visits' | 'exit-permits' | 'violations-create' | 'violations-list' | 'spectech-create' | 'spectech-edit' | 'spectech-requests' | 'spectech-operator' | 'utilization-create' | 'utilization-requests'>('home');
    const [spectechRequests, setSpectechRequests] = useState<SpectechRequestItem[]>([]);
    const [visits, setVisits] = useState<VisitItem[]>([]);
    const [activeVisitors, setActiveVisitors] = useState<ActiveVisitorItem[]>([]);
    const [utilizationRequests, setUtilizationRequests] = useState<UtilizationRequestItem[]>([]);
    const [violationCatalog, setViolationCatalog] = useState<ViolationCategoryOption[]>([]);
    const [violationCatalogLoading, setViolationCatalogLoading] = useState(false);
    const [violationIncidents, setViolationIncidents] = useState<ViolationIncidentItem[]>([]);
    const [violationIncidentsLoading, setViolationIncidentsLoading] = useState(false);
    const [selectedVisit, setSelectedVisit] = useState<VisitItem | null>(null);
    const [selectedSpectechRequest, setSelectedSpectechRequest] = useState<SpectechRequestItem | null>(null);
    const [spectechEditSource, setSpectechEditSource] = useState<'requests' | 'operator'>('requests');
    const [operatorSpectechRequests, setOperatorSpectechRequests] = useState<SpectechRequestItem[]>([]);
    const [operatorSpectechLoading, setOperatorSpectechLoading] = useState(false);
    const [operatorSpectechError, setOperatorSpectechError] = useState<string | null>(null);
    const [operatorSpectechStatusFilter, setOperatorSpectechStatusFilter] = useState('');

    // ── Cancel modal for spectech requests (Telegram) ──
    const [tgCancelModalOpen, setTgCancelModalOpen] = useState(false);
    const [tgCancellingRequest, setTgCancellingRequest] = useState<SpectechRequestItem | null>(null);
    const [tgCancelLoading, setTgCancelLoading] = useState(false);
    const [tgCancelReason, setTgCancelReason] = useState('');

    const openTgCancel = (request: SpectechRequestItem) => {
        setTgCancellingRequest(request);
        setTgCancelReason('');
        setTgCancelModalOpen(true);
    };

    const handleTgCancel = async () => {
        if (!tgCancellingRequest || !tgCancelReason.trim()) return;
        setTgCancelLoading(true);
        try {
            await axios.patch(`/api/telegram/miniapp/spectech/requests/${tgCancellingRequest.id}/cancel`, { init_data: initData, reason: tgCancelReason.trim() }, { headers: { 'X-Telegram-Init-Data': initData } });
            setTgCancelModalOpen(false);
            setTgCancellingRequest(null);
            await loadSpectechRequests();
            if (session?.can_manage_spectech) {
                await loadOperatorSpectechRequests();
            }
        } catch (e: any) {
            alert(e?.response?.data?.message || e?.message || 'Не удалось отменить заявку');
        } finally {
            setTgCancelLoading(false);
        }
    };

    useEffect(() => {
        const run = async () => {
            try {
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

    const loadOperatorSpectechRequests = useCallback(async () => {
        if (!initData || !session?.can_manage_spectech) return;
        setOperatorSpectechLoading(true);
        setOperatorSpectechError(null);
        try {
            const response = await axios.get<{ data: SpectechRequestItem[] }>('/api/telegram/miniapp/operator/spectech/requests', {
                params: {
                    init_data: initData,
                    ...(operatorSpectechStatusFilter ? { status: operatorSpectechStatusFilter } : {}),
                },
                headers: { 'X-Telegram-Init-Data': initData },
            });
            setOperatorSpectechRequests(response.data.data ?? []);
        } catch (e: unknown) {
            setOperatorSpectechRequests([]);
            setOperatorSpectechError(e instanceof Error ? e.message : 'Не удалось загрузить заявки');
        } finally {
            setOperatorSpectechLoading(false);
        }
    }, [initData, session?.can_manage_spectech, operatorSpectechStatusFilter]);

    const handleSpectechCreated = useCallback(async () => {
        await loadSpectechRequests();
        if (session?.can_manage_spectech) {
            await loadOperatorSpectechRequests();
        }
        setSelectedSpectechRequest(null);
        setView(spectechEditSource === 'operator' ? 'spectech-operator' : 'spectech-requests');
    }, [loadOperatorSpectechRequests, loadSpectechRequests, session?.can_manage_spectech, spectechEditSource]);

    useEffect(() => {
        if (view !== 'spectech-operator' || !initData || !session?.can_manage_spectech) return;
        void loadOperatorSpectechRequests();
    }, [view, initData, session?.can_manage_spectech, loadOperatorSpectechRequests]);

    const advanceSpectechStatus = useCallback(async (requestId: number, status: string) => {
        try {
            await axios.patch(
                `/api/telegram/miniapp/operator/spectech/requests/${requestId}/status`,
                { init_data: initData, status },
                { headers: { 'X-Telegram-Init-Data': initData } }
            );
            await loadOperatorSpectechRequests();
        } catch (e: any) {
            alert(e?.response?.data?.message || e?.message || 'Не удалось изменить статус заявки');
        }
    }, [initData, loadOperatorSpectechRequests]);

    const loadUtilizationRequests = useCallback(() => {
        if (!initData) return Promise.resolve();

        return axios
            .get<{ data: UtilizationRequestItem[] }>('/api/telegram/miniapp/utilization/requests', {
                params: { init_data: initData },
                headers: { 'X-Telegram-Init-Data': initData },
            })
            .then((response) => setUtilizationRequests(response.data.data ?? []))
            .catch(() => setUtilizationRequests([]));
    }, [initData]);

    useEffect(() => {
        if (view !== 'utilization-requests') return;
        void loadUtilizationRequests();
    }, [view, loadUtilizationRequests]);

    const handleUtilizationCreated = useCallback(async () => {
        await loadUtilizationRequests();
        setView('utilization-requests');
    }, [loadUtilizationRequests]);

    const loadViolationCatalog = useCallback(async () => {
        if (!initData || !session?.can_record_violations) return;

        setViolationCatalogLoading(true);
        try {
            const response = await axios.get<{ data: ViolationCategoryOption[] }>('/api/telegram/miniapp/violations/catalog', {
                params: { init_data: initData },
                headers: { 'X-Telegram-Init-Data': initData },
            });
            setViolationCatalog(response.data.data ?? []);
        } catch {
            setViolationCatalog([]);
        } finally {
            setViolationCatalogLoading(false);
        }
    }, [initData, session?.can_record_violations]);

    const loadViolationIncidents = useCallback(async () => {
        if (!initData || !session?.can_record_violations) return;

        setViolationIncidentsLoading(true);
        try {
            const response = await axios.get<{ data: ViolationIncidentItem[] }>('/api/telegram/miniapp/violations/incidents', {
                params: { init_data: initData },
                headers: { 'X-Telegram-Init-Data': initData },
            });
            setViolationIncidents(response.data.data ?? []);
        } catch {
            setViolationIncidents([]);
        } finally {
            setViolationIncidentsLoading(false);
        }
    }, [initData, session?.can_record_violations]);

    useEffect(() => {
        if (view !== 'violations-create' || !session?.can_record_violations) return;
        void loadViolationCatalog();
    }, [view, session?.can_record_violations, loadViolationCatalog]);

    useEffect(() => {
        if (view !== 'violations-list' || !session?.can_record_violations) return;
        void loadViolationIncidents();
    }, [view, session?.can_record_violations, loadViolationIncidents]);

    const handleViolationCreated = useCallback(async () => {
        await loadViolationIncidents();
        setView('violations-list');
    }, [loadViolationIncidents]);

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
                    onViolationsCreate={() => setView('violations-create')}
                    onViolationsList={() => setView('violations-list')}
                    onSpectechCreate={() => setView('spectech-create')}
                    onSpectechRequests={() => setView('spectech-requests')}
                    onUtilizationCreate={() => setView('utilization-create')}
                    onUtilizationRequests={() => setView('utilization-requests')}
                    onOperatorSpectech={() => setView('spectech-operator')}
                />
            )}
            {status !== 'approved' && status !== 'blocked' && view === 'home' && (
                <UtilizationActions
                    onCreate={() => setView('utilization-create')}
                    onRequests={() => setView('utilization-requests')}
                />
            )}
            {/* --- Spectech (спецтехника) --- */}
            {status === 'approved' && view === 'spectech-create' && (
                <SpectechCreateForm
                    initData={initData}
                    onDone={handleSpectechCreated}
                    request={null}
                    isOperator={session?.can_manage_spectech}
                    currentUserName={session.user?.name ?? session.profile.full_name ?? ''}
                    currentUserPhone={session.user?.phone ?? session.profile.phone ?? ''}
                    onCancel={() => {
                        setSelectedSpectechRequest(null);
                        setView('home');
                    }}
                />
            )}
            {status === 'approved' && view === 'spectech-edit' && selectedSpectechRequest && (
                <SpectechCreateForm
                    initData={initData}
                    onDone={handleSpectechCreated}
                    request={selectedSpectechRequest}
                    isOperator={session?.can_manage_spectech}
                    currentUserName={session.user?.name ?? session.profile.full_name ?? ''}
                    currentUserPhone={session.user?.phone ?? session.profile.phone ?? ''}
                    onCancel={() => {
                        setSelectedSpectechRequest(null);
                        setView(spectechEditSource === 'operator' ? 'spectech-operator' : 'spectech-requests');
                    }}
                />
            )}
            {status === 'approved' && view === 'spectech-requests' && (
                <SpectechRequestList
                    requests={spectechRequests}
                    onCreate={() => {
                        setSpectechEditSource('requests');
                        setSelectedSpectechRequest(null);
                        setView('spectech-create');
                    }}
                    onEdit={(request) => {
                        setSpectechEditSource('requests');
                        setSelectedSpectechRequest(request);
                        setView('spectech-edit');
                    }}
                    onCancel={(request) => openTgCancel(request)}
                    onBack={() => setView('home')}
                />
            )}

            {status === 'approved' && view === 'spectech-operator' && session.can_manage_spectech && (
                <SpectechOperatorList
                    requests={operatorSpectechRequests}
                    loading={operatorSpectechLoading}
                    error={operatorSpectechError}
                    statusFilter={operatorSpectechStatusFilter}
                    onStatusFilterChange={setOperatorSpectechStatusFilter}
                    onRefresh={() => void loadOperatorSpectechRequests()}
                    onAdvanceStatus={advanceSpectechStatus}
                    onEdit={(request) => {
                        setSpectechEditSource('operator');
                        setSelectedSpectechRequest(request);
                        setView('spectech-edit');
                    }}
                    onCancel={(request) => openTgCancel(request)}
                    onBack={() => setView('home')}
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

            {status === 'approved' && view === 'violations-create' && session.can_record_violations && (
                <ViolationsCreateView
                    initData={initData}
                    catalog={violationCatalog}
                    loadingCatalog={violationCatalogLoading}
                    onCreated={handleViolationCreated}
                    onViewList={() => setView('violations-list')}
                    onBack={() => setView('home')}
                />
            )}

            {status === 'approved' && view === 'violations-list' && session.can_record_violations && (
                <ViolationsIncidentList
                    incidents={violationIncidents}
                    loading={violationIncidentsLoading}
                    onReload={() => void loadViolationIncidents()}
                    onCreate={() => setView('violations-create')}
                    onBack={() => setView('home')}
                />
            )}

            {status !== 'blocked' && view === 'utilization-create' && (
                <UtilizationCreateForm
                    initData={initData}
                    onDone={handleUtilizationCreated}
                    onCancel={() => setView('home')}
                />
            )}

            {status !== 'blocked' && view === 'utilization-requests' && (
                <UtilizationRequestList
                    requests={utilizationRequests}
                    onCreate={() => setView('utilization-create')}
                    onBack={() => setView('home')}
                />
            )}
                {/* Cancel modal (simple) */}
                {tgCancelModalOpen && (
                    <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                        <div style={{ width: 'min(520px, calc(100% - 32px))', background: '#fff', borderRadius: 12, padding: 16 }}>
                            <h3 style={{ marginTop: 0 }}>Отмена заявки #{tgCancellingRequest?.id}</h3>
                            <p style={{ color: '#666', fontSize: 13 }}>Укажите причину отмены. Эта информация будет сохранена.</p>
                            <textarea value={tgCancelReason} onChange={(e) => setTgCancelReason(e.target.value)} rows={4} style={{ width: '100%', padding: 8, marginTop: 8, borderRadius: 8, border: '1px solid #ddd' }} />
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                <button style={{ ...btnSecondary, flex: 1 }} onClick={() => { setTgCancelModalOpen(false); setTgCancellingRequest(null); }} disabled={tgCancelLoading}>Отмена</button>
                                <button style={{ ...btnDanger, flex: 1 }} onClick={() => void handleTgCancel()} disabled={tgCancelLoading || !tgCancelReason.trim()}>{tgCancelLoading ? 'Отмена…' : 'Отменить'}</button>
                            </div>
                        </div>
                    </div>
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
