import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import axios from 'axios';
import { MapPin, Upload, X } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { MOCK_LOCATIONS, TERMINAL_INFO, type Location } from './MOCK_LOCATIONS';

interface Props {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
    scheduleId: number;
    scheduleTruckName?: string;
    scheduleStart?: string;
    scheduleEnd?: string;
}

const TERMINALS = ['T1', 'T2', 'T3', 'T4'] as const;

const NewRequestFromScheduleModal: React.FC<Props> = ({ open, onClose, onCreated, scheduleId, scheduleTruckName, scheduleStart, scheduleEnd }) => {
    // Форма
    const [selectedTerminal, setSelectedTerminal] = useState<string>('');
    const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
    const [comment, setComment] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const fileRef = useRef<HTMLInputElement>(null);

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

        setSubmitting(true);
        try {
            const address = `Терминал: ${selectedTerminal} | Здание: ${selectedLocation!.building} | Гейт: ${selectedLocation!.gate} | Статус: ${selectedLocation!.status} | Назначение: ${selectedLocation!.purpose}`;

            await axios.post('/spectech/api/requests/from-schedule', {
                schedule_id: scheduleId,
                terminal: selectedTerminal,
                zone: selectedLocation!.building,
                gate: selectedLocation!.gate,
                address,
                comment: comment || null,
                photos,
            });

            onCreated();
            onClose();
        } catch (err: any) {
            const resp = err.response?.data;
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

    // Сброс при закрытии
    React.useEffect(() => {
        if (!open) {
            setSelectedTerminal('');
            setSelectedLocation(null);
            setComment('');
            setPhotos([]);
            setErrors({});
        }
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="flex max-h-[calc(100vh-2rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:w-full sm:max-w-2xl">
                <DialogHeader className="border-border border-b px-4 py-4 sm:px-6">
                    <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                        <MapPin className="h-4 w-4 text-red-600" />
                        Создать заявку из планирования
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6">
                    <div className="flex flex-col gap-4">
                        {/* Инфо о планировании */}
                        {scheduleTruckName && (
                            <div className="rounded-md border border-blue-200 bg-blue-50 p-3">
                                <div className="text-sm text-blue-900">
                                    <div className="font-medium">📅 Из планирования:</div>
                                    <div className="mt-1 text-xs">
                                        Техника: <strong>{scheduleTruckName}</strong>
                                    </div>
                                    {scheduleStart && (
                                        <div className="text-xs">
                                            Период: <strong>{new Date(scheduleStart).toLocaleString('ru-RU')}</strong>
                                            {scheduleEnd ? ` — ${new Date(scheduleEnd).toLocaleString('ru-RU')}` : ''}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Глобальная ошибка */}
                        {errors.global && (
                            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{errors.global}</div>
                        )}

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
                            </div>
                        )}

                        {/* Комментарий */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium">Комментарий</label>
                            <textarea
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="Дополнительная информация..."
                                rows={2}
                                className="border-border bg-background placeholder:text-muted-foreground resize-none rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                            />
                        </div>

                        {/* Фотографии */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-medium">Фотографии (до 3 шт.)</label>
                            <div className="flex flex-wrap gap-2">
                                {photos.map((photo, i) => (
                                    <div key={i} className="border-border relative h-16 w-16 overflow-hidden rounded-md border">
                                        <img src={photo} alt={`photo-${i}`} className="h-full w-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => removePhoto(i)}
                                            className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity hover:opacity-100"
                                        >
                                            <X className="h-4 w-4 text-white" />
                                        </button>
                                    </div>
                                ))}
                                {photos.length < 3 && (
                                    <button
                                        type="button"
                                        onClick={() => fileRef.current?.click()}
                                        className="border-border bg-muted hover:bg-muted/80 flex h-16 w-16 items-center justify-center rounded-md border border-dashed transition-colors"
                                    >
                                        <Upload className="text-muted-foreground h-4 w-4" />
                                    </button>
                                )}
                            </div>
                            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handlePhotoChange} />
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
                            {submitting ? 'Создание...' : 'Создать заявку'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default NewRequestFromScheduleModal;
