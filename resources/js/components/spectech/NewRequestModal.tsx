import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Upload, MapPin } from 'lucide-react';
import { MOCK_LOCATIONS, TERMINAL_INFO, type Location } from './MOCK_LOCATIONS';

type SpectechTruckOption = {
    id: number;
    name?: string | null;
    plate_number?: string | null;
    truck_brand_name?: string | null;
    truck_model_name?: string | null;
};

interface Props {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
}

const TERMINALS = ['T1', 'T2', 'T3', 'T4'] as const;

const today = new Date().toISOString().split('T')[0];

function buildAddress(terminal: string, zone: string, gate: string, status: string, purpose: string): string {
    return `Терминал: ${terminal} | Здание: ${zone} | Гейт: ${gate} | Статус: ${status} | Назначение: ${purpose}`;
}

const NewRequestModal: React.FC<Props> = ({ open, onClose, onCreated }) => {
    const [trucks, setTrucks] = useState<SpectechTruckOption[]>([]);
    const [loadingTrucks, setLoadingTrucks] = useState(false);
    const [trucksError, setTrucksError] = useState<string>('');

    // Форма
    const [truckId, setTruckId] = useState<string>('');
    const [endDate, setEndDate] = useState('');
    const [selectedTerminal, setSelectedTerminal] = useState<string>('');
    const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
    const [comment, setComment] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const fileRef = useRef<HTMLInputElement>(null);

    // Загрузка техники
    useEffect(() => {
        if (!open) return;
        setLoadingTrucks(true);
        setTrucksError('');
        axios.get('/spectech/api/trucks')
            .then(res => {
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
            setEndDate('');
            setSelectedTerminal('');
            setSelectedLocation(null);
            setComment('');
            setPhotos([]);
            setErrors({});
        }
    }, [open]);

    const filteredLocations = MOCK_LOCATIONS.filter(l => l.terminal === selectedTerminal);

    // Фото → base64
    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []).slice(0, 3 - photos.length);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = ev => {
                setPhotos(prev => {
                    if (prev.length >= 3) return prev;
                    return [...prev, ev.target?.result as string];
                });
            };
            reader.readAsDataURL(file);
        });
        e.target.value = '';
    };

    const removePhoto = (i: number) => {
        setPhotos(prev => prev.filter((_, idx) => idx !== i));
    };

    // Валидация
    const validate = () => {
        const errs: Record<string, string> = {};
        if (!truckId) errs.truckId = 'Выберите технику';
        if (!endDate) errs.endDate = 'Укажите дату окончания';
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
            const address = buildAddress(
                selectedTerminal,
                selectedLocation!.building,
                selectedLocation!.gate,
                selectedLocation!.status,
                selectedLocation!.purpose,
            );

            await axios.post('/spectech/api/requests', {
                truck_id:   parseInt(truckId),
                end_date:   endDate,
                terminal:   selectedTerminal,
                zone:       selectedLocation!.building,
                gate:       selectedLocation!.gate,
                address,
                comment:    comment || null,
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

    const getTruckOptionLabel = (t: SpectechTruckOption): string => {
        const fallbackName = `${t.truck_brand_name ?? ''} ${t.truck_model_name ?? ''}`.trim();
        const name = (t.name ?? '').trim() || fallbackName || 'Без названия';

        return t.plate_number ? `${name} (${t.plate_number})` : `${name} (без номера)`;
    };

    return (
        <Dialog open={open} onOpenChange={v => !v && onClose()}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                        <MapPin className="h-4 w-4 text-red-600" />
                        Новая заявка на спецтехнику
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-4 pt-1">
                    {/* Глобальная ошибка */}
                    {errors.global && (
                        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                            {errors.global}
                        </div>
                    )}

                    {/* Дата начала (только показывается) */}
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-muted-foreground">Дата начала</label>
                        <div className="h-9 px-3 flex items-center rounded-md border border-border bg-muted text-sm text-muted-foreground">
                            {today}
                        </div>
                    </div>

                    {/* Дата окончания */}
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium">Дата окончания <span className="text-red-500">*</span></label>
                        <input
                            type="date"
                            min={today}
                            value={endDate}
                            onChange={e => { setEndDate(e.target.value); setErrors(p => ({ ...p, endDate: '' })); }}
                            className="h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30"
                        />
                        {errors.endDate && <span className="text-xs text-red-500">{errors.endDate}</span>}
                    </div>

                    {/* Выбор техники */}
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium">Техника <span className="text-red-500">*</span></label>
                        <select
                            value={truckId}
                            onChange={e => { setTruckId(e.target.value); setErrors(p => ({ ...p, truckId: '' })); }}
                            className="h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30"
                            disabled={loadingTrucks}
                        >
                            <option value="">
                                {loadingTrucks ? 'Загрузка...' : 'Выберите технику...'}
                            </option>
                            {trucks.map(t => (
                                <option key={t.id} value={String(t.id)}>
                                    {getTruckOptionLabel(t)}
                                </option>
                            ))}
                        </select>
                        {trucksError && <span className="text-xs text-red-500">{trucksError}</span>}
                        {errors.truckId && <span className="text-xs text-red-500">{errors.truckId}</span>}
                    </div>

                    {/* Выбор терминала */}
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium">Терминал <span className="text-red-500">*</span></label>
                        <div className="flex gap-2 flex-wrap">
                            {TERMINALS.map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => {
                                        setSelectedTerminal(t);
                                        setSelectedLocation(null);
                                        setErrors(p => ({ ...p, terminal: '', zone: '' }));
                                    }}
                                    className={`px-3 h-8 rounded-md border text-sm font-medium transition-colors ${
                                        selectedTerminal === t
                                            ? 'bg-red-600 border-red-600 text-white'
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
                            <div className={`text-xs px-2 py-1 rounded border mt-1 ${TERMINAL_INFO[selectedTerminal]?.color}`}>
                                {TERMINAL_INFO[selectedTerminal]?.description}
                            </div>
                        )}
                    </div>

                    {/* Выбор здания/зоны */}
                    {selectedTerminal && (
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-medium">Здание / Зона <span className="text-red-500">*</span></label>
                            <select
                                value={selectedLocation?.id ?? ''}
                                onChange={e => {
                                    const loc = filteredLocations.find(l => l.id === parseInt(e.target.value)) ?? null;
                                    setSelectedLocation(loc);
                                    setErrors(p => ({ ...p, zone: '' }));
                                }}
                                className="h-9 rounded-md border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-600/30"
                            >
                                <option value="">Выберите здание...</option>
                                {filteredLocations.map(loc => (
                                    <option key={loc.id} value={loc.id}>
                                        {loc.building} | Гейт: {loc.gate} | {loc.status === 'active' ? '✓' : loc.status === 'pending' ? '🔧' : '○'}
                                    </option>
                                ))}
                            </select>
                            {errors.zone && <span className="text-xs text-red-500">{errors.zone}</span>}

                            {/* Карточка выбранной зоны */}
                            {selectedLocation && (
                                <div className="mt-1 p-3 rounded-md border border-border bg-muted/50 text-sm space-y-1">
                                    <div className="flex justify-between">
                                        <span className="font-medium">{selectedLocation.building}</span>
                                        <span className={`text-xs px-1.5 py-0.5 rounded-full border ${
                                            selectedLocation.status === 'active'
                                                ? 'bg-green-100 text-green-700 border-green-200'
                                                : selectedLocation.status === 'pending'
                                                    ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
                                                    : 'bg-gray-100 text-gray-500 border-gray-200'
                                        }`}>
                                            {selectedLocation.status === 'active' ? 'Активен' : selectedLocation.status === 'pending' ? 'Строится' : 'Пустой'}
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
                            <label className="text-xs font-medium text-muted-foreground">Адрес (автозаполнение)</label>
                            <div className="min-h-9 px-3 py-2 rounded-md border border-border bg-muted text-xs text-muted-foreground leading-relaxed">
                                {buildAddress(selectedTerminal, selectedLocation.building, selectedLocation.gate, selectedLocation.status, selectedLocation.purpose)}
                            </div>
                        </div>
                    )}

                    {/* Комментарий */}
                    <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium">Цель работ</label>
                        <textarea
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            placeholder="Монтаж, разгрузка, ремонт..."
                            rows={3}
                            className="rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-600/30 placeholder:text-muted-foreground"
                        />
                    </div>

                    {/* Фото */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium">Фото объекта (до 3 шт.)</label>
                        <div className="flex gap-2 flex-wrap">
                            {photos.map((url, i) => (
                                <div key={i} className="relative h-16 w-16 rounded-md border border-border overflow-hidden">
                                    <img src={url} alt="" className="h-full w-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => removePhoto(i)}
                                        className="absolute top-0 right-0 bg-red-600 text-white rounded-bl p-0.5"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                            {photos.length < 3 && (
                                <button
                                    type="button"
                                    onClick={() => fileRef.current?.click()}
                                    className="h-16 w-16 rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-red-400 hover:text-red-500 transition-colors"
                                >
                                    <Upload className="h-4 w-4" />
                                    <span className="text-[10px]">Фото</span>
                                </button>
                            )}
                        </div>
                        <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={handlePhotoChange}
                        />
                    </div>

                    {/* Кнопки */}
                    <div className="flex gap-2 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            className="flex-1"
                            onClick={onClose}
                            disabled={submitting}
                        >
                            Отмена
                        </Button>
                        <Button
                            type="button"
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
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


