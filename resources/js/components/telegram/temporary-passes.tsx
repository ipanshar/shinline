import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
const DEFAULT_RECOGNITION_ZOOM_RANGE = { min: 1, max: 3, step: 0.1 } as const;

type RecognitionCameraZoomMode = 'none' | 'hardware' | 'digital';

interface RecognitionCameraZoomRange {
    min: number;
    max: number;
    step: number;
}

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

const prepareTemporaryPassUploadFile = async (file: File): Promise<File> => {
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

function TemporaryPassPhotoField({
    label,
    hint,
    file,
    disabled,
    onSelect,
    onClear,
    onError,
}: {
    label: string;
    hint?: string;
    file: File | null;
    disabled: boolean;
    onSelect: (file: File | null) => Promise<void> | void;
    onClear: () => void;
    onError: (message: string | null) => void;
}) {
    const [cameraOpen, setCameraOpen] = useState(false);
    const [zoomMode, setZoomMode] = useState<RecognitionCameraZoomMode>('none');
    const [zoomRange, setZoomRange] = useState<RecognitionCameraZoomRange>(DEFAULT_RECOGNITION_ZOOM_RANGE);
    const [zoomValue, setZoomValue] = useState(1);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const galleryInputRef = useRef<HTMLInputElement | null>(null);

    const resetZoom = useCallback(() => {
        setZoomMode('none');
        setZoomRange(DEFAULT_RECOGNITION_ZOOM_RANGE);
        setZoomValue(1);
    }, []);

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }

        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }

        setCameraOpen(false);
        resetZoom();
    }, [resetZoom]);

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

    const initializeZoom = async (stream: MediaStream) => {
        const track = stream.getVideoTracks()[0] as (MediaStreamTrack & {
            getCapabilities?: () => MediaTrackCapabilities & { zoom?: { min?: number; max?: number; step?: number } };
            getSettings?: () => MediaTrackSettings & { zoom?: number };
        }) | undefined;

        if (!track) {
            resetZoom();
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

            setZoomMode('hardware');
            setZoomRange(nextRange);
            setZoomValue(nextValue);
            return;
        }

        setZoomMode('digital');
        setZoomRange(DEFAULT_RECOGNITION_ZOOM_RANGE);
        setZoomValue(1);
    };

    const updateZoom = async (rawValue: number) => {
        const nextValue = Math.min(
            zoomRange.max,
            Math.max(zoomRange.min, rawValue),
        );

        setZoomValue(nextValue);

        if (zoomMode !== 'hardware') {
            return;
        }

        const track = streamRef.current?.getVideoTracks()[0];
        if (!track || typeof track.applyConstraints !== 'function') {
            return;
        }

        try {
            await track.applyConstraints({
                advanced: [{ zoom: nextValue } as MediaTrackConstraintSet],
            });
        } catch {
            setZoomMode('digital');
            setZoomRange((current) => ({
                min: 1,
                max: Math.max(current.max, DEFAULT_RECOGNITION_ZOOM_RANGE.max),
                step: DEFAULT_RECOGNITION_ZOOM_RANGE.step,
            }));
        }
    };

    const runSelection = async (rawFile: File | null) => {
        onError(null);

        if (!rawFile) {
            await onSelect(null);
            return;
        }

        const preparedFile = await prepareTemporaryPassUploadFile(rawFile);
        await onSelect(preparedFile);
    };

    const handleGallerySelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0] ?? null;
        event.target.value = '';

        await runSelection(selectedFile);
    };

    const startCamera = async () => {
        if (disabled) {
            return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            onError('Не удалось открыть камеру на этом устройстве. Можно выбрать фото из галереи.');
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

            await initializeZoom(stream);
            streamRef.current = stream;
            setCameraOpen(true);
            onError(null);
        } catch {
            onError('Не удалось получить доступ к камере. Можно выбрать фото из галереи.');
        }
    };

    const openGallery = () => {
        if (disabled) {
            return;
        }

        galleryInputRef.current?.click();
    };

    const clearFile = () => {
        stopCamera();
        onError(null);
        onClear();
    };

    const capturePhoto = async () => {
        if (!videoRef.current || !canvasRef.current) {
            return;
        }

        if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
            onError('Камера ещё не готова. Попробуйте ещё раз.');
            return;
        }

        try {
            const canvas = canvasRef.current;
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;

            const context = canvas.getContext('2d');
            if (!context) {
                onError('Не удалось обработать снимок.');
                return;
            }

            if (zoomMode === 'digital' && zoomValue > 1) {
                const sourceWidth = videoRef.current.videoWidth / zoomValue;
                const sourceHeight = videoRef.current.videoHeight / zoomValue;
                const sourceX = (videoRef.current.videoWidth - sourceWidth) / 2;
                const sourceY = (videoRef.current.videoHeight - sourceHeight) / 2;

                context.drawImage(
                    videoRef.current,
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
                context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            }

            const compressedDataUrl = await compressImageDataUrl(canvas.toDataURL('image/jpeg', 0.92));
            const capturedFile = await dataUrlToFile(compressedDataUrl, 'temporary-pass-camera.jpg');

            stopCamera();
            await runSelection(capturedFile);
        } catch {
            onError('Не удалось сделать фото сотрудника.');
        }
    };

    return (
        <>
            <label>{label}</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '4px 0 12px' }}>
                <button
                    type="button"
                    style={{
                        ...smallButtonStyle,
                        padding: '12px 14px',
                        background: cameraOpen ? '#dbeafe' : '#2481cc',
                        color: cameraOpen ? '#1d4ed8' : '#fff',
                    }}
                    onClick={() => void startCamera()}
                    disabled={disabled || cameraOpen}
                >
                    {cameraOpen
                        ? 'Камера открыта'
                        : (file ? 'Переснять камерой' : 'Сделать фото камерой')}
                </button>
                <button
                    type="button"
                    style={{ ...smallButtonStyle, padding: '12px 14px', background: '#f3f4f6', color: '#111827' }}
                    onClick={openGallery}
                    disabled={disabled}
                >
                    Выбрать из галереи
                </button>
            </div>
            <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handleGallerySelection}
                style={{ display: 'none' }}
            />
            {hint && (
                <div style={{ fontSize: 12, color: '#666', marginTop: -8, marginBottom: 12 }}>
                    {hint}
                </div>
            )}

            {cameraOpen && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, 0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div style={{ width: '100%', maxWidth: 560, borderRadius: 18, padding: 14, background: '#111827', boxShadow: '0 24px 80px rgba(0,0,0,0.45)' }}>
                        <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Сделайте фото сотрудника</div>
                        <div style={{ overflow: 'hidden', borderRadius: 12, background: '#000' }}>
                            <video
                                ref={videoRef}
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
                                    transform: zoomMode === 'digital' ? `scale(${zoomValue})` : undefined,
                                    transformOrigin: 'center center',
                                    transition: 'transform 120ms ease-out',
                                }}
                            />
                        </div>
                        <canvas ref={canvasRef} style={{ display: 'none' }} />
                        {zoomMode !== 'none' && (
                            <div style={{ marginTop: 12, borderRadius: 12, background: '#0f172a', padding: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, color: '#fff', fontSize: 13, marginBottom: 8 }}>
                                    <span>Приближение камеры</span>
                                    <span>x{zoomValue.toFixed(1)}</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 48px', gap: 10, alignItems: 'center' }}>
                                    <button
                                        type="button"
                                        style={{ ...smallButtonStyle, padding: '10px 0', background: '#1e293b', color: '#fff' }}
                                        onClick={() => void updateZoom(zoomValue - zoomRange.step)}
                                        disabled={zoomValue <= zoomRange.min}
                                    >
                                        -
                                    </button>
                                    <input
                                        type="range"
                                        min={zoomRange.min}
                                        max={zoomRange.max}
                                        step={zoomRange.step}
                                        value={zoomValue}
                                        onChange={(event) => void updateZoom(Number(event.target.value))}
                                        style={{ width: '100%' }}
                                    />
                                    <button
                                        type="button"
                                        style={{ ...smallButtonStyle, padding: '10px 0', background: '#1e293b', color: '#fff' }}
                                        onClick={() => void updateZoom(zoomValue + zoomRange.step)}
                                        disabled={zoomValue >= zoomRange.max}
                                    >
                                        +
                                    </button>
                                </div>
                                <div style={{ color: '#cbd5e1', fontSize: 11, marginTop: 8 }}>
                                    {zoomMode === 'hardware'
                                        ? 'Используется приближение самой камеры устройства.'
                                        : 'Если камера не поддерживает аппаратный zoom, используется программное приближение кадра.'}
                                </div>
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <button type="button" style={{ ...smallButtonStyle, flex: 1, background: '#2481cc', color: '#fff', padding: '12px 14px' }} onClick={() => void capturePhoto()}>
                                Сделать фото
                            </button>
                            <button type="button" style={{ ...smallButtonStyle, flex: 1, background: '#e5e7eb', color: '#111827', padding: '12px 14px' }} onClick={stopCamera}>
                                Отмена
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {file && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, border: '1px solid #ddd', borderRadius: 10, padding: '10px 12px', marginBottom: 12, background: '#fafafa' }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>
                            Фото сотрудника · {(file.size / 1024 / 1024).toFixed(2)} MB
                        </div>
                    </div>
                    <button type="button" style={{ ...smallButtonStyle, background: '#f3f4f6', color: '#111827' }} onClick={clearFile}>
                        Убрать
                    </button>
                </div>
            )}
        </>
    );
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

    const selectPhoto = async (nextPhoto: File | null) => {
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
            <TemporaryPassPhotoField
                label="Фото сотрудника"
                hint="Сделайте фото камерой или выберите снимок из галереи."
                file={photo}
                disabled={busy}
                onSelect={selectPhoto}
                onClear={() => void selectPhoto(null)}
                onError={setError}
            />
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

    const selectPhoto = async (nextPhoto: File | null) => {
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
            <TemporaryPassPhotoField
                label="Фото сотрудника"
                hint="Используйте камеру с зумом как в фиксации нарушений или выберите готовое фото из галереи."
                file={photo}
                disabled={busy || recognitionBusy}
                onSelect={selectPhoto}
                onClear={() => void selectPhoto(null)}
                onError={setError}
            />
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

    const selectPhoto = async (nextPhoto: File | null) => {
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
            <TemporaryPassPhotoField
                label="Фото сотрудника"
                hint="Сделайте новое фото камерой или выберите снимок из галереи для продления пропуска."
                file={photo}
                disabled={busy || recognitionBusy}
                onSelect={selectPhoto}
                onClear={() => void selectPhoto(null)}
                onError={setError}
            />
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
