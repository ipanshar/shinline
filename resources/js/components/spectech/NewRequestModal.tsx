import { type SpectechRequestData } from '@/components/spectech/RequestCard';
import { type SharedData } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import axios from 'axios';
import { AlertTriangle, CheckCircle2, MapPin, Pencil, Upload, X } from 'lucide-react';
import { usePage } from '@inertiajs/react';
import React, { useEffect, useRef, useState } from 'react';
import {
    buildSpectechAddress,
    formatLocationStatus,
    isKnownTerminal,
    KNOWN_TERMINALS,
    MOCK_LOCATIONS,
    TERMINAL_INFO,
    type Location,
} from './MOCK_LOCATIONS';

type SpectechTruckOption = {
    id: number;
    name?: string | null;
    plate_number?: string | null;
    truck_brand_name?: string | null;
    truck_model_name?: string | null;
};

interface AvailabilityCheckResult {
    available: boolean;
    message: string;
    free_alternative?: {
        id: number;
        name: string;
        plate_number: string | null;
    };
    conflict_info?: Array<{
        truck_name: string;
        plate_number: string | null;
        free_at: string;
        conflicts: Array<{
            from: string;
            to: string;
            purpose: string;
        }>;
    }>;
}

interface ActiveRequestConflict {
    can_force_complete: boolean;
    previous_request: SpectechRequestData;
}

interface Props {
    open: boolean;
    onClose: () => void;
    onSaved: (request?: SpectechRequestData) => void;
    initialRequest?: SpectechRequestData | null;
    isOperator?: boolean;
}

const today = new Date().toISOString().split('T')[0];

// Минимальное значение для datetime-local — текущий момент (округлён до минуты)
function nowLocalMin(): string {
    const d = new Date();
    d.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateTimeLocal(value?: string | null): string {
    if (!value) return '';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const pad = (part: number) => String(part).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function resolveLocation(terminal: string, zone?: string, gate?: string | null): Location | null {
    if (!isKnownTerminal(terminal)) {
        return null;
    }

    return MOCK_LOCATIONS.find((location) => (
        location.terminal === terminal
        && location.building === (zone ?? '')
        && (gate ? location.gate === gate : true)
    )) ?? null;
}

const NewRequestModal: React.FC<Props> = ({ open, onClose, onSaved, initialRequest = null, isOperator = false }) => {
    const { auth } = usePage<SharedData>().props;
    const currentUser = auth.user;
    const defaultInitiatorName = typeof currentUser?.name === 'string' ? currentUser.name : '';
    const defaultInitiatorPhone = typeof currentUser?.phone === 'string' ? currentUser.phone : '';
    const [trucks, setTrucks] = useState<SpectechTruckOption[]>([]);
    const [loadingTrucks, setLoadingTrucks] = useState(false);
    const [trucksError, setTrucksError] = useState<string>('');

    // Форма
    const [truckId, setTruckId] = useState<string>('');
    const [initiatorName, setInitiatorName] = useState('');
    const [initiatorPhone, setInitiatorPhone] = useState('');
    const [driverName, setDriverName] = useState('');
    const [driverPhone, setDriverPhone] = useState('');
    const [startDateTime, setStartDateTime] = useState('');
    const [endDateTime, setEndDateTime] = useState('');
    const [selectedTerminal, setSelectedTerminal] = useState<string>('');
    const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
    const [manualZone, setManualZone] = useState('');
    const [manualGate, setManualGate] = useState('');
    const [comment, setComment] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Проверка доступности
    const [checkingAvailability, setCheckingAvailability] = useState(false);
    const [availabilityResult, setAvailabilityResult] = useState<AvailabilityCheckResult | null>(null);
    const [showConflictDetails, setShowConflictDetails] = useState(false);
    const [activeRequestConflict, setActiveRequestConflict] = useState<ActiveRequestConflict | null>(null);

    const fileRef = useRef<HTMLInputElement>(null);
    const availabilityRequestSeq = useRef(0);
    const isEditing = initialRequest !== null;
    const normalizedTerminal = selectedTerminal.trim().toUpperCase();
    const hasPresetLocations = isKnownTerminal(normalizedTerminal);
    const filteredLocations = hasPresetLocations
        ? MOCK_LOCATIONS.filter((location) => location.terminal === normalizedTerminal)
        : [];
    const effectiveZone = hasPresetLocations ? (selectedLocation?.building ?? '') : manualZone.trim();
    const effectiveGate = hasPresetLocations ? (selectedLocation?.gate ?? '') : manualGate.trim();
    const effectiveAddress = buildSpectechAddress(
        normalizedTerminal || selectedTerminal.trim(),
        effectiveZone,
        effectiveGate || null,
        hasPresetLocations && selectedLocation ? formatLocationStatus(selectedLocation.status) : null,
        hasPresetLocations ? selectedLocation?.purpose ?? null : null,
    );

    // Загрузка техники
    useEffect(() => {
        if (!open) return;
        setLoadingTrucks(true);
        setTrucksError('');
        axios
            .get('/spectech/api/trucks')
            .then((res) => {
                if (res.data?.status && Array.isArray(res.data.data)) {
                    setTrucks(res.data.data);
                    return;
                }

                setTrucks([]);
                setTrucksError('Не удалось загрузить список спецтехники');
            })
            .catch(() => {
                setTrucks([]);
                setTrucksError('Не удалось загрузить список спецтехники');
            })
            .finally(() => setLoadingTrucks(false));
    }, [open]);

    // Инициализация формы при открытии / редактировании
    useEffect(() => {
        if (!open) {
            setTruckId('');
            setInitiatorName(defaultInitiatorName);
            setInitiatorPhone(defaultInitiatorPhone);
            setDriverName('');
            setDriverPhone('');
            setStartDateTime('');
            setEndDateTime('');
            setSelectedTerminal('');
            setSelectedLocation(null);
            setManualZone('');
            setManualGate('');
            setComment('');
            setPhotos([]);
            setErrors({});
            setAvailabilityResult(null);
            setShowConflictDetails(false);
            setActiveRequestConflict(null);
            return;
        }

        if (!initialRequest) {
            setTruckId('');
            setInitiatorName(defaultInitiatorName);
            setInitiatorPhone(defaultInitiatorPhone);
            setDriverName('');
            setDriverPhone('');
            setStartDateTime('');
            setEndDateTime('');
            setSelectedTerminal('');
            setSelectedLocation(null);
            setManualZone('');
            setManualGate('');
            setComment('');
            setPhotos([]);
            setErrors({});
            setAvailabilityResult(null);
            setShowConflictDetails(false);
            setActiveRequestConflict(null);
            return;
        }

        const terminal = initialRequest.terminal?.trim().toUpperCase() ?? '';
        const location = resolveLocation(terminal, initialRequest.zone, initialRequest.gate);

        setTruckId(String(initialRequest.equipment_id));
        setInitiatorName(initialRequest.initiator_name ?? initialRequest.client_name ?? defaultInitiatorName);
        setInitiatorPhone(initialRequest.initiator_phone ?? defaultInitiatorPhone);
        setDriverName(initialRequest.driver_name ?? '');
        setDriverPhone(initialRequest.driver_phone ?? '');
        setStartDateTime(toDateTimeLocal(initialRequest.requested_start));
        setEndDateTime(toDateTimeLocal(initialRequest.requested_end));
        setSelectedTerminal(terminal);
        setSelectedLocation(location);
        setManualZone(location ? '' : (initialRequest.zone ?? ''));
        setManualGate(location ? '' : (initialRequest.gate ?? ''));
        setComment(initialRequest.comment ?? '');
        setPhotos(initialRequest.photos ?? []);
        setErrors({});
        setAvailabilityResult(null);
        setShowConflictDetails(false);
        setActiveRequestConflict(null);
    }, [open, initialRequest, defaultInitiatorName, defaultInitiatorPhone]);

    // Автоматическая проверка доступности при изменении техники или даты
    useEffect(() => {
        if (!truckId || !startDateTime || !endDateTime) {
            setAvailabilityResult(null);
            setCheckingAvailability(false);
            return;
        }

        const checkAvailability = async () => {
            const requestSeq = ++availabilityRequestSeq.current;
            setCheckingAvailability(true);
            try {
                const res = await axios.get('/spectech/api/requests/check-availability', {
                    params: {
                        truck_id: truckId,
                        requested_start: startDateTime,
                        requested_end: endDateTime,
                        ...(initialRequest?.schedule_id ? { exclude_schedule_id: initialRequest.schedule_id } : {}),
                    },
                });

                if (requestSeq === availabilityRequestSeq.current) {
                    setAvailabilityResult(res.data);
                }
            } catch (err) {
                if (requestSeq === availabilityRequestSeq.current) {
                    setAvailabilityResult(null);
                }
            } finally {
                if (requestSeq === availabilityRequestSeq.current) {
                    setCheckingAvailability(false);
                }
            }
        };

        const timer = setTimeout(checkAvailability, 300);
        return () => clearTimeout(timer);
    }, [truckId, startDateTime, endDateTime]);

    // Фото → base64
    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []).slice(0, 3 - photos.length);
        files.forEach((file) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setPhotos((prev) => {
                    if (prev.length >= 3) return prev;
                    return [...prev, ev.target?.result as string];
                });
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const removePhoto = (i: number) => {
        setPhotos((prev) => prev.filter((_, idx) => idx !== i));
    };

    // Валидация
    const validate = () => {
        const errs: Record<string, string> = {};
        if (!truckId) errs.truckId = 'Выберите технику';
        if (!startDateTime) errs.startDateTime = 'Укажите дату и время начала';
        if (!endDateTime) errs.endDateTime = 'Укажите дату и время окончания';
        if (startDateTime && endDateTime && new Date(startDateTime) >= new Date(endDateTime)) {
            errs.endDateTime = 'Время окончания должно быть позже начала';
        }
        if (!selectedTerminal) errs.terminal = 'Выберите терминал';
        if (selectedTerminal) {
            if (hasPresetLocations && !selectedLocation) errs.zone = 'Выберите здание/зону';
            if (!hasPresetLocations && !manualZone.trim()) errs.zone = 'Укажите здание/зону';
        }
        return errs;
    };

    const handleSubmit = async (forceCompletePrevious = false) => {
        const errs = validate();
        if (Object.keys(errs).length > 0) {
            setErrors(errs);
            return;
        }

        setSubmitting(true);
        try {
            const payload = {
                truck_id: parseInt(truckId),
                initiator_name: initiatorName.trim() || null,
                initiator_phone: initiatorPhone.trim() || null,
                driver_name: driverName.trim() || null,
                driver_phone: driverPhone.trim() || null,
                start_date: startDateTime ? startDateTime.split('T')[0] : today,
                end_date: endDateTime ? endDateTime.split('T')[0] : today,
                requested_start: startDateTime || null,
                requested_end: endDateTime || null,
                terminal: normalizedTerminal || selectedTerminal.trim(),
                zone: effectiveZone,
                gate: effectiveGate || null,
                address: effectiveAddress,
                comment: comment || null,
                photos,
                check_availability: true,
                force_complete_previous: forceCompletePrevious,
                previous_request_id: forceCompletePrevious ? activeRequestConflict?.previous_request.id : null,
            };

            const res = initialRequest
                ? await axios.put(`/spectech/api/requests/${initialRequest.id}`, payload)
                : await axios.post('/spectech/api/requests', payload);

            const created = res.data?.data ?? null;
            onSaved(created);
        } catch (err: any) {
            const resp = err.response?.data;

            // Если вернулся конфликт доступности — показываем это
            if (resp?.conflict && resp?.conflict_info) {
                setAvailabilityResult({
                    available: false,
                    message: resp.message,
                    free_alternative: resp.free_alternative,
                    conflict_info: resp.conflict_info,
                });
                setShowConflictDetails(true);
                setErrors({ global: resp.message });
                return;
            }

            if (resp?.conflict_type === 'active_request' && resp?.previous_request) {
                setActiveRequestConflict({
                    can_force_complete: !!resp.can_force_complete,
                    previous_request: resp.previous_request,
                });
                setErrors({ global: resp.message });
                return;
            }

            if (resp?.errors) {
                const mapped: Record<string, string> = {};
                Object.entries(resp.errors).forEach(([k, v]) => {
                    mapped[k] = Array.isArray(v) ? v[0] : String(v);
                });
                setErrors(mapped);
            } else {
                setErrors({ global: resp?.message ?? 'Ошибка при создании заявки' });
            }
        } finally {
            setSubmitting(false);
        }
    };

    const getTruckOptionLabel = (t: SpectechTruckOption): string => {
        const fallbackName = `${t.truck_brand_name ?? ''} ${t.truck_model_name ?? ''}`.trim();
        const name = (t.name ?? '').trim() || fallbackName || 'Без названия';

        return t.plate_number ? `${name} (${t.plate_number})` : `${name} (без номера)`;
    };

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:w-full sm:max-w-2xl">
                    <DialogHeader className="border-border border-b px-4 py-4 sm:px-6">
                        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                            {isEditing ? <Pencil className="h-4 w-4 text-red-600" /> : <MapPin className="h-4 w-4 text-red-600" />}
                            {isEditing ? 'Редактирование заявки' : 'Новая заявка на спецтехнику'}
                        </DialogTitle>
                    </DialogHeader>

                <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6">
                    <div className="flex flex-col gap-4">
                        {/* Глобальная ошибка */}
                        {errors.global && (
                            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{errors.global}</div>
                        )}

                        {activeRequestConflict && (
                            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                                    <div className="min-w-0 flex-1">
                                        <div className="font-medium">Найдена незавершённая заявка</div>
                                        <div className="mt-1 text-xs text-amber-800">
                                            Заявка #{activeRequestConflict.previous_request.id} •{' '}
                                            {activeRequestConflict.previous_request.equipment_name}
                                        </div>
                                        <div className="mt-1 text-xs text-amber-800">
                                            Статус: {activeRequestConflict.previous_request.status_label}
                                        </div>
                                        {(activeRequestConflict.previous_request.requested_start ||
                                            activeRequestConflict.previous_request.requested_end) && (
                                            <div className="mt-1 text-xs text-amber-800">
                                                Период:{' '}
                                                {activeRequestConflict.previous_request.requested_start
                                                    ? new Date(activeRequestConflict.previous_request.requested_start).toLocaleString('ru-RU')
                                                    : '—'}
                                                {' — '}
                                                {activeRequestConflict.previous_request.requested_end
                                                    ? new Date(activeRequestConflict.previous_request.requested_end).toLocaleString('ru-RU')
                                                    : '—'}
                                            </div>
                                        )}
                                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                            {activeRequestConflict.can_force_complete ? (
                                                <Button
                                                    type="button"
                                                    className="bg-amber-600 text-white hover:bg-amber-700"
                                                    onClick={() => void handleSubmit(true)}
                                                    disabled={submitting}
                                                >
                                                    Завершить предыдущую и продолжить
                                                </Button>
                                            ) : (
                                                <div className="text-xs text-amber-800">
                                                    У вас нет прав для принудительного завершения предыдущей заявки.
                                                </div>
                                            )}
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => setActiveRequestConflict(null)}
                                                disabled={submitting}
                                            >
                                                Отмена
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Период: дата+время начала и окончания */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium">
                                    Начало <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="datetime-local"
                                    min={isEditing ? undefined : nowLocalMin()}
                                    value={startDateTime}
                                    onChange={(e) => {
                                        setStartDateTime(e.target.value);
                                        setErrors((p) => ({ ...p, startDateTime: '' }));
                                        setActiveRequestConflict(null);
                                    }}
                                    className="border-border bg-background h-9 rounded-md border px-3 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                                />
                                {errors.startDateTime && <span className="text-xs text-red-500">{errors.startDateTime}</span>}
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium">
                                    Окончание <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="datetime-local"
                                    min={startDateTime || nowLocalMin()}
                                    value={endDateTime}
                                    onChange={(e) => {
                                        setEndDateTime(e.target.value);
                                        setErrors((p) => ({ ...p, endDateTime: '' }));
                                        setActiveRequestConflict(null);
                                    }}
                                    className="border-border bg-background h-9 rounded-md border px-3 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                                />
                                {errors.endDateTime && <span className="text-xs text-red-500">{errors.endDateTime}</span>}
                            </div>
                        </div>

                        {/* Выбор техники */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium">
                                Техника <span className="text-red-500">*</span>
                            </label>
                            <select
                                value={truckId}
                                onChange={(e) => {
                                    setTruckId(e.target.value);
                                    setErrors((p) => ({ ...p, truckId: '' }));
                                    setActiveRequestConflict(null);
                                }}
                                className="border-border bg-background h-9 rounded-md border px-3 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                                disabled={loadingTrucks}
                            >
                                <option value="">{loadingTrucks ? 'Загрузка...' : 'Выберите технику...'}</option>
                                {trucks.map((t) => (
                                    <option key={t.id} value={String(t.id)}>
                                        {getTruckOptionLabel(t)}
                                    </option>
                                ))}
                            </select>
                            {trucksError && <span className="text-xs text-red-500">{trucksError}</span>}
                            {errors.truckId && <span className="text-xs text-red-500">{errors.truckId}</span>}

                            {/* Статус доступности техники */}
                            {!checkingAvailability && availabilityResult && (
                                <div className="mt-2">
                                    {availabilityResult.available ? (
                                        <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-2">
                                            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                                            <span className="text-xs text-green-700">Техника доступна на выбранный период</span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 p-2">
                                                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-600" />
                                                <div className="flex-1 text-xs text-orange-700">
                                                    <div className="font-medium">{availabilityResult.message}</div>
                                                    <div className="mt-1">
                                                        Заявку можно отправить. Диспетчер увидит конфликт и скорректирует планирование.
                                                    </div>
                                                    {availabilityResult.free_alternative && (
                                                        <div className="mt-1 font-medium text-green-700">
                                                            Доступна альтернатива: <strong>{availabilityResult.free_alternative.name}</strong>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Детали конфликтов */}
                                            {availabilityResult.conflict_info && availabilityResult.conflict_info.length > 0 && (
                                                <div className="overflow-hidden rounded-md border border-gray-200">
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowConflictDetails(!showConflictDetails)}
                                                        className="flex w-full items-center justify-between bg-gray-50 px-3 py-2 text-left text-xs font-medium hover:bg-gray-100"
                                                    >
                                                        📅 Расписание занятости
                                                        <span className="text-xs">{showConflictDetails ? '▼' : '▶'}</span>
                                                    </button>
                                                    {showConflictDetails && (
                                                        <div className="max-h-40 space-y-2 overflow-y-auto bg-white p-3">
                                                            {availabilityResult.conflict_info.map((conflict, idx) => (
                                                                <div key={idx} className="border-l-2 border-orange-300 pl-2 text-xs">
                                                                    <div className="font-medium text-gray-700">
                                                                        {conflict.truck_name}{' '}
                                                                        {conflict.plate_number ? `(${conflict.plate_number})` : ''}
                                                                    </div>
                                                                    <div className="mt-1 text-gray-600">
                                                                        Свободна с: <strong>{conflict.free_at}</strong>
                                                                    </div>
                                                                    {conflict.conflicts.length > 0 && (
                                                                        <div className="mt-1 space-y-1 text-gray-500">
                                                                            {conflict.conflicts.map((c, ci) => (
                                                                                <div key={ci} className="italic">
                                                                                    • {c.from} - {c.to}: {c.purpose}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            {checkingAvailability && <span className="text-xs text-gray-500">Проверка доступности...</span>}
                        </div>

                        {/* Инициатор и водитель — для оператора */}
                        {isOperator && (
                            <>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs font-medium">Инициатор</label>
                                        <input
                                            type="text"
                                            value={initiatorName}
                                            onChange={(e) => setInitiatorName(e.target.value)}
                                            placeholder="ФИО заявителя"
                                            className="border-border bg-background h-9 rounded-md border px-3 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs font-medium">Телефон инициатора</label>
                                        <input
                                            type="tel"
                                            value={initiatorPhone}
                                            onChange={(e) => setInitiatorPhone(e.target.value)}
                                            placeholder="+7..."
                                            className="border-border bg-background h-9 rounded-md border px-3 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs font-medium">Имя водителя</label>
                                        <input
                                            type="text"
                                            value={driverName}
                                            onChange={(e) => setDriverName(e.target.value)}
                                            placeholder="ФИО водителя"
                                            className="border-border bg-background h-9 rounded-md border px-3 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs font-medium">Телефон водителя</label>
                                        <input
                                            type="tel"
                                            value={driverPhone}
                                            onChange={(e) => setDriverPhone(e.target.value)}
                                            placeholder="+7..."
                                            className="border-border bg-background h-9 rounded-md border px-3 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Выбор терминала */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium">
                                Терминал <span className="text-red-500">*</span>
                            </label>
                            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                                {KNOWN_TERMINALS.map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => {
                                            setSelectedTerminal(t);
                                            setSelectedLocation(null);
                                            setManualZone('');
                                            setManualGate('');
                                            setErrors((p) => ({ ...p, terminal: '', zone: '' }));
                                        }}
                                        className={`h-8 rounded-md border px-3 text-sm font-medium transition-colors ${
                                            normalizedTerminal === t
                                                ? 'border-red-600 bg-red-600 text-white'
                                                : 'border-border bg-background hover:bg-muted'
                                        }`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                            <input
                                list="spectech-terminals"
                                value={selectedTerminal}
                                onChange={(e) => {
                                    setSelectedTerminal(e.target.value);
                                    setSelectedLocation(null);
                                    setManualZone('');
                                    setManualGate('');
                                    setErrors((p) => ({ ...p, terminal: '', zone: '' }));
                                }}
                                placeholder="Или введите свой терминал"
                                className="border-border bg-background h-9 rounded-md border px-3 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                            />
                            <datalist id="spectech-terminals">
                                {KNOWN_TERMINALS.map((terminal) => (
                                    <option key={terminal} value={terminal} />
                                ))}
                            </datalist>
                            {errors.terminal && <span className="text-xs text-red-500">{errors.terminal}</span>}

                            {/* Описание выбранного терминала */}
                            {normalizedTerminal && TERMINAL_INFO[normalizedTerminal] && (
                                <div className={`mt-1 rounded border px-2 py-1 text-xs ${TERMINAL_INFO[normalizedTerminal]?.color}`}>
                                    {TERMINAL_INFO[normalizedTerminal]?.description}
                                </div>
                            )}
                        </div>

                        {/* Выбор здания/зоны */}
                        {normalizedTerminal && hasPresetLocations && (
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium">
                                    Здание / Зона <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={selectedLocation?.id ?? ''}
                                    onChange={(e) => {
                                        const loc = filteredLocations.find((l) => l.id === parseInt(e.target.value)) ?? null;
                                        setSelectedLocation(loc);
                                        setErrors((p) => ({ ...p, zone: '' }));
                                    }}
                                    className="border-border bg-background h-9 rounded-md border px-3 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                                >
                                    <option value="">Выберите здание...</option>
                                    {filteredLocations.map((loc) => (
                                        <option key={loc.id} value={loc.id}>
                                            {loc.building} | Гейт: {loc.gate} |{' '}
                                            {loc.status === 'active' ? '✓' : loc.status === 'pending' ? '🔧' : '○'}
                                        </option>
                                    ))}
                                </select>
                                {errors.zone && <span className="text-xs text-red-500">{errors.zone}</span>}

                                {/* Карточка выбранной зоны */}
                                {selectedLocation && (
                                    <div className="border-border bg-muted/50 mt-1 space-y-1 rounded-md border p-3 text-sm">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                            <span className="font-medium">{selectedLocation.building}</span>
                                            <span
                                                className={`rounded-full border px-1.5 py-0.5 text-xs ${
                                                    selectedLocation.status === 'active'
                                                        ? 'border-green-200 bg-green-100 text-green-700'
                                                        : selectedLocation.status === 'pending'
                                                          ? 'border-yellow-200 bg-yellow-100 text-yellow-700'
                                                          : 'border-gray-200 bg-gray-100 text-gray-500'
                                                }`}
                                            >
                                                {formatLocationStatus(selectedLocation.status)}
                                            </span>
                                        </div>
                                        <div className="text-muted-foreground text-xs">Назначение: {selectedLocation.purpose}</div>
                                        <div className="text-muted-foreground text-xs">Гейт: {selectedLocation.gate}</div>
                                    </div>
                                )}
                            </div>
                        )}

                        {normalizedTerminal && !hasPresetLocations && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-medium">
                                        Здание / Зона <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={manualZone}
                                        onChange={(e) => {
                                            setManualZone(e.target.value);
                                            setErrors((p) => ({ ...p, zone: '' }));
                                        }}
                                        placeholder="Например, Склад B2"
                                        className="border-border bg-background h-9 rounded-md border px-3 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                                    />
                                    {errors.zone && <span className="text-xs text-red-500">{errors.zone}</span>}
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-medium">Гейт</label>
                                    <input
                                        type="text"
                                        value={manualGate}
                                        onChange={(e) => setManualGate(e.target.value)}
                                        placeholder="Например, Gate 7"
                                        className="border-border bg-background h-9 rounded-md border px-3 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Автосформированный адрес */}
                        {effectiveAddress && (
                            <div className="flex flex-col gap-1">
                                <label className="text-muted-foreground text-xs font-medium">Адрес (автозаполнение)</label>
                                <div className="border-border bg-muted text-muted-foreground min-h-9 rounded-md border px-3 py-2 text-xs leading-relaxed">
                                    {effectiveAddress}
                                </div>
                            </div>
                        )}

                        {/* Комментарий */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium">Цель работ</label>
                            <textarea
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="Монтаж, разгрузка, ремонт..."
                                rows={3}
                                className="border-border bg-background placeholder:text-muted-foreground resize-none rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                            />
                        </div>

                        {/* Фото */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-medium">Фото объекта (до 3 шт.)</label>
                            <div className="flex flex-wrap gap-2">
                                {photos.map((url, i) => (
                                    <div key={i} className="border-border relative h-16 w-16 overflow-hidden rounded-md border">
                                        <img src={url} alt="" className="h-full w-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => removePhoto(i)}
                                            className="absolute top-0 right-0 rounded-bl bg-red-600 p-0.5 text-white"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </div>
                                ))}
                                {photos.length < 3 && (
                                    <button
                                        type="button"
                                        onClick={() => fileRef.current?.click()}
                                        className="border-border text-muted-foreground flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed transition-colors hover:border-red-400 hover:text-red-500"
                                    >
                                        <Upload className="h-4 w-4" />
                                        <span className="text-[10px]">Фото</span>
                                    </button>
                                )}
                            </div>
                            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoChange} />
                        </div>
                    </div>
                </div>

                <div className="border-border border-t px-4 py-4 sm:px-6">
                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                        <Button type="button" variant="outline" className="w-full sm:flex-1" onClick={onClose} disabled={submitting}>
                            Отмена
                        </Button>
                        <Button
                            type="button"
                            className="w-full bg-red-600 text-white hover:bg-red-700 sm:flex-1"
                            onClick={() => void handleSubmit()}
                            disabled={submitting}
                        >
                            {submitting ? (isEditing ? 'Сохранение...' : 'Отправка...') : (isEditing ? 'Сохранить изменения' : 'Создать заявку')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default NewRequestModal;
