import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import axios from 'axios';
import { AlertTriangle, CheckCircle2, MapPin, Upload, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { MOCK_LOCATIONS, TERMINAL_INFO, type Location } from './MOCK_LOCATIONS';

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

interface Props {
    open: boolean;
    onClose: () => void;
    onCreated: (newRequest?: any) => void;
}

const TERMINALS = ['T1', 'T2', 'T3', 'T4'] as const;

const today = new Date().toISOString().split('T')[0];

// Минимальное значение для datetime-local — текущий момент (округлён до минуты)
function nowLocalMin(): string {
    const d = new Date();
    d.setSeconds(0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildAddress(terminal: string, zone: string, gate: string, status: string, purpose: string): string {
    return `Терминал: ${terminal} | Здание: ${zone} | Гейт: ${gate} | Статус: ${status} | Назначение: ${purpose}`;
}

const NewRequestModal: React.FC<Props> = ({ open, onClose, onCreated }) => {
    const [trucks, setTrucks] = useState<SpectechTruckOption[]>([]);
    const [loadingTrucks, setLoadingTrucks] = useState(false);
    const [trucksError, setTrucksError] = useState<string>('');

    // Форма
    const [truckId, setTruckId] = useState<string>('');
    const [startDateTime, setStartDateTime] = useState('');
    const [endDateTime, setEndDateTime] = useState('');
    const [selectedTerminal, setSelectedTerminal] = useState<string>('');
    const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
    const [comment, setComment] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    // Проверка доступности
    const [checkingAvailability, setCheckingAvailability] = useState(false);
    const [availabilityResult, setAvailabilityResult] = useState<AvailabilityCheckResult | null>(null);
    const [showConflictDetails, setShowConflictDetails] = useState(false);

    const fileRef = useRef<HTMLInputElement>(null);

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

    // Сброс формы при закрытии
    useEffect(() => {
        if (!open) {
            setTruckId('');
            setStartDateTime('');
            setEndDateTime('');
            setSelectedTerminal('');
            setSelectedLocation(null);
            setComment('');
            setPhotos([]);
            setErrors({});
            setAvailabilityResult(null);
            setShowConflictDetails(false);
        }
    }, [open]);

    // Автоматическая проверка доступности при изменении техники или даты
    useEffect(() => {
        if (!truckId || !endDateTime) {
            setAvailabilityResult(null);
            return;
        }

        const checkAvailability = async () => {
            setCheckingAvailability(true);
            try {
                const res = await axios.get('/spectech/api/requests/check-availability', {
                    params: {
                        truck_id: truckId,
                        end_date: endDateTime ? endDateTime.split('T')[0] : '',
                    },
                });
                setAvailabilityResult(res.data);
            } catch (err) {
                setAvailabilityResult(null);
            } finally {
                setCheckingAvailability(false);
            }
        };

        const timer = setTimeout(checkAvailability, 300);
        return () => clearTimeout(timer);
    }, [truckId, endDateTime]);

    const filteredLocations = MOCK_LOCATIONS.filter((l) => l.terminal === selectedTerminal);

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
        if (!selectedLocation) errs.zone = 'Выберите здание/зону';
        return errs;
    };

    const handleSubmit = async () => {
        const errs = validate();
        if (Object.keys(errs).length > 0) {
            setErrors(errs);
            return;
        }

        // Если техника занята и нет свободной альтернативы — не отправляем
        if (availabilityResult && !availabilityResult.available && !availabilityResult.free_alternative) {
            setErrors({ global: 'Выбранная техника полностью занята. Выберите другую дату или технику.' });
            return;
        }

        // Если выбрали свободную альтернативу — используем её ID
        const finalTruckId =
            availabilityResult && !availabilityResult.available && availabilityResult.free_alternative
                ? availabilityResult.free_alternative.id
                : parseInt(truckId);

        setSubmitting(true);
        try {
            const address = buildAddress(
                selectedTerminal,
                selectedLocation!.building,
                selectedLocation!.gate,
                selectedLocation!.status,
                selectedLocation!.purpose,
            );

            const res = await axios.post('/spectech/api/requests', {
                truck_id: finalTruckId,
                start_date:       startDateTime ? startDateTime.split('T')[0] : today,
                end_date:         endDateTime   ? endDateTime.split('T')[0]   : today,
                requested_start:  startDateTime ? new Date(startDateTime).toISOString() : null,
                requested_end:    endDateTime   ? new Date(endDateTime).toISOString()   : null,
                terminal: selectedTerminal,
                zone: selectedLocation!.building,
                gate: selectedLocation!.gate,
                address,
                comment: comment || null,
                photos,
                check_availability: true,
            });

            const created = res.data?.data ?? null;
            onClose();
            onCreated(created);
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
                        <MapPin className="h-4 w-4 text-red-600" />
                        Новая заявка на спецтехнику
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6">
                    <div className="flex flex-col gap-4">
                        {/* Глобальная ошибка */}
                        {errors.global && (
                            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{errors.global}</div>
                        )}

                        {/* Период: дата+время начала и окончания */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium">
                                    Начало <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="datetime-local"
                                    min={nowLocalMin()}
                                    value={startDateTime}
                                    onChange={(e) => {
                                        setStartDateTime(e.target.value);
                                        setErrors((p) => ({ ...p, startDateTime: '' }));
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
                                                    {availabilityResult.free_alternative && (
                                                        <div className="mt-1 font-medium text-green-700">
                                                            💡 Доступна альтернатива: <strong>{availabilityResult.free_alternative.name}</strong>
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

                        {/* Выбор терминала */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium">
                                Терминал <span className="text-red-500">*</span>
                            </label>
                            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                                {TERMINALS.map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => {
                                            setSelectedTerminal(t);
                                            setSelectedLocation(null);
                                            setErrors((p) => ({ ...p, terminal: '', zone: '' }));
                                        }}
                                        className={`h-8 rounded-md border px-3 text-sm font-medium transition-colors ${
                                            selectedTerminal === t
                                                ? 'border-red-600 bg-red-600 text-white'
                                                : 'border-border bg-background hover:bg-muted'
                                        }`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                            {errors.terminal && <span className="text-xs text-red-500">{errors.terminal}</span>}

                            {/* Описание выбранного терминала */}
                            {selectedTerminal && (
                                <div className={`mt-1 rounded border px-2 py-1 text-xs ${TERMINAL_INFO[selectedTerminal]?.color}`}>
                                    {TERMINAL_INFO[selectedTerminal]?.description}
                                </div>
                            )}
                        </div>

                        {/* Выбор здания/зоны */}
                        {selectedTerminal && (
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
                                                {selectedLocation.status === 'active'
                                                    ? 'Активен'
                                                    : selectedLocation.status === 'pending'
                                                      ? 'Строится'
                                                      : 'Пустой'}
                                            </span>
                                        </div>
                                        <div className="text-muted-foreground text-xs">Назначение: {selectedLocation.purpose}</div>
                                        <div className="text-muted-foreground text-xs">Гейт: {selectedLocation.gate}</div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Автосформированный адрес */}
                        {selectedLocation && (
                            <div className="flex flex-col gap-1">
                                <label className="text-muted-foreground text-xs font-medium">Адрес (автозаполнение)</label>
                                <div className="border-border bg-muted text-muted-foreground min-h-9 rounded-md border px-3 py-2 text-xs leading-relaxed">
                                    {buildAddress(
                                        selectedTerminal,
                                        selectedLocation.building,
                                        selectedLocation.gate,
                                        selectedLocation.status,
                                        selectedLocation.purpose,
                                    )}
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
                            onClick={handleSubmit}
                            disabled={submitting}
                        >
                            {submitting ? 'Отправка...' : 'Создать заявку'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default NewRequestModal;
