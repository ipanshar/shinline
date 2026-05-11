import { Button } from '@/components/ui/button';
import axios from 'axios';
import {
    AlertTriangle,
    Calendar,
    CalendarRange,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Clock,
    FileText,
    Plus,
    RefreshCw,
    Search,
    X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import NewRequestFromScheduleModal from './NewRequestFromScheduleModal';

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface EquipmentType {
    key: string;
    label: string;
    trucks: { id: number; name: string; plate_number: string | null }[];
}

interface ScheduleItem {
    id: number;
    user_id: number;
    client_name: string | null;
    truck_id: number | null;
    truck_name: string | null;
    plate_number: string | null;
    equipment_type_key: string;
    equipment_type_label: string;
    assigned_truck_name: string | null;
    scheduled_start: string;
    scheduled_end: string;
    purpose: string;
    address: string | null;
    notes: string | null;
    status: string;
    status_label: string;
    has_request?: boolean;
    request_id?: number | null;
    created_at: string;
}

interface ConflictTruck {
    truck_name: string;
    plate_number: string | null;
    free_at: string;
    conflicts: { from: string; to: string; purpose: string }[];
}

interface BookingResult {
    conflict: boolean;
    message: string;
    conflict_info?: ConflictTruck[];
    data?: ScheduleItem;
}

// ─── Константы ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    pending: { bg: '#F0F0F0', text: '#666', border: '#CCC' },
    confirmed: { bg: '#E8F4F8', text: '#0088CC', border: '#B3D9E6' },
    in_progress: { bg: '#E8F0FF', text: '#0051B3', border: '#B3CFFF' },
    done: { bg: '#E8F5E9', text: '#27AE60', border: '#A8D5BA' },
    cancelled: { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
};

const STATUS_LABELS: Record<string, string> = {
    all: 'Все',
    pending: 'Ожидает',
    confirmed: 'Подтверждено',
    in_progress: 'В работе',
    done: 'Выполнено',
    cancelled: 'Отменено',
};

function fmtDt(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDurationHours(start: string | null | undefined, end: string | null | undefined): string {
    if (!start || !end) return '—';

    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();

    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
        return '—';
    }

    const hours = (endMs - startMs) / (1000 * 60 * 60);

    if (hours < 1) {
        const minutes = Math.round(hours * 60);
        return `${minutes} мин`;
    }

    const rounded = Math.round(hours * 10) / 10;
    return `${String(rounded).replace('.', ',')} ч`;
}

function getDurationHours(start: string | null | undefined, end: string | null | undefined): number | null {
    if (!start || !end) return null;

    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();

    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
        return null;
    }

    return (endMs - startMs) / (1000 * 60 * 60);
}

function getDurationBadgeClass(hours: number | null): string {
    if (hours === null) return 'border-gray-200 bg-gray-50 text-gray-600';
    if (hours <= 2) return 'border-green-200 bg-green-50 text-green-700';
    if (hours <= 8) return 'border-amber-200 bg-amber-50 text-amber-700';
    return 'border-red-200 bg-red-50 text-red-700';
}

function toLocalInput(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Форма создания ───────────────────────────────────────────────────────────

interface CreateFormProps {
    equipmentTypes: EquipmentType[];
    onCreated: (item: ScheduleItem) => void;
    onConflict: (result: BookingResult) => void;
}

const CreateForm: React.FC<CreateFormProps> = ({ equipmentTypes, onCreated, onConflict }) => {
    const [typeKey, setTypeKey] = useState('');
    const [start, setStart] = useState('');
    const [end, setEnd] = useState('');
    const [purpose, setPurpose] = useState('');
    const [address, setAddress] = useState('');
    const [notes, setNotes] = useState('');
    const [checking, setChecking] = useState(false);
    const [availability, setAvailability] = useState<null | { has_available: boolean; available: any[]; occupied: any[] }>(null);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const selectedType = equipmentTypes.find((t) => t.key === typeKey);

    // Авто-проверка при изменении типа или периода
    const handleCheck = useCallback(async () => {
        if (!typeKey || !start || !end) {
            setAvailability(null);
            return;
        }
        setChecking(true);
        try {
            const res = await axios.get('/spectech/api/schedule/check-availability', {
                params: { equipment_type_key: typeKey, start: new Date(start).toISOString(), end: new Date(end).toISOString() },
            });
            if (res.data?.status) setAvailability(res.data);
        } catch {
            setAvailability(null);
        } finally {
            setChecking(false);
        }
    }, [typeKey, start, end]);

    useEffect(() => {
        const timer = window.setTimeout(handleCheck, 400);
        return () => window.clearTimeout(timer);
    }, [handleCheck]);

    const validate = () => {
        const errs: Record<string, string> = {};
        if (!typeKey) errs.typeKey = 'Выберите тип техники';
        if (!start) errs.start = 'Укажите дату начала';
        if (!end) errs.end = 'Укажите дату окончания';
        if (!purpose.trim()) errs.purpose = 'Укажите цель работ';
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
            const payload = {
                equipment_type_key: typeKey,
                equipment_type_label: selectedType?.label ?? typeKey,
                scheduled_start: new Date(start).toISOString(),
                scheduled_end: new Date(end).toISOString(),
                purpose: purpose.trim(),
                address: address.trim() || null,
                notes: notes.trim() || null,
            };
            const res = await axios.post('/spectech/api/schedule', payload);
            if (res.data?.status) {
                onCreated(res.data.data);
                setTypeKey('');
                setStart('');
                setEnd('');
                setPurpose('');
                setAddress('');
                setNotes('');
                setAvailability(null);
                setErrors({});
            }
        } catch (err: any) {
            const resp = err.response?.data;
            if (resp?.conflict) {
                onConflict(resp as BookingResult);
            } else if (resp?.errors) {
                const mapped: Record<string, string> = {};
                Object.entries(resp.errors).forEach(([k, v]) => {
                    mapped[k] = Array.isArray(v) ? (v[0] as string) : String(v);
                });
                setErrors(mapped);
            } else {
                setErrors({ global: resp?.message ?? 'Ошибка при создании' });
            }
        } finally {
            setSubmitting(false);
        }
    };

    const nowISOLocal = toLocalInput(new Date().toISOString());

    return (
        <div className="flex flex-col gap-4">
            {errors.global && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{errors.global}</div>}

            {/* Тип техники */}
            <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">
                    Тип техники <span className="text-red-500">*</span>
                </label>
                <select
                    value={typeKey}
                    onChange={(e) => {
                        setTypeKey(e.target.value);
                        setErrors((p) => ({ ...p, typeKey: '' }));
                    }}
                    className="border-border bg-background h-9 rounded-md border px-3 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                >
                    <option value="">Выберите тип...</option>
                    {equipmentTypes.map((t) => (
                        <option key={t.key} value={t.key}>
                            {t.label} ({t.trucks.length} ед.)
                        </option>
                    ))}
                </select>
                {errors.typeKey && <span className="text-xs text-red-500">{errors.typeKey}</span>}
                {selectedType && (
                    <div className="mt-1 flex max-h-24 flex-wrap gap-1 overflow-y-auto pr-1">
                        {selectedType.trucks.map((tr) => (
                            <span key={tr.id} className="border-border bg-muted text-muted-foreground rounded border px-1.5 py-0.5 text-[11px]">
                                {tr.name}
                                {tr.plate_number ? ` (${tr.plate_number})` : ''}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Период */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium">
                        Начало <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="datetime-local"
                        min={nowISOLocal}
                        value={start}
                        onChange={(e) => {
                            setStart(e.target.value);
                            setErrors((p) => ({ ...p, start: '' }));
                        }}
                        className="border-border bg-background h-9 rounded-md border px-3 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                    />
                    {errors.start && <span className="text-xs text-red-500">{errors.start}</span>}
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium">
                        Окончание <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="datetime-local"
                        min={start || nowISOLocal}
                        value={end}
                        onChange={(e) => {
                            setEnd(e.target.value);
                            setErrors((p) => ({ ...p, end: '' }));
                        }}
                        className="border-border bg-background h-9 rounded-md border px-3 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                    />
                    {errors.end && <span className="text-xs text-red-500">{errors.end}</span>}
                </div>
            </div>

            {/* Блок доступности */}
            {typeKey && start && end && (
                <div
                    className={`rounded-md border px-3 py-2.5 text-sm ${
                        checking
                            ? 'border-border bg-muted/50 text-muted-foreground'
                            : availability?.has_available
                              ? 'border-green-200 bg-green-50 text-green-800'
                              : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}
                >
                    {checking ? (
                        <span className="flex items-center gap-2">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Проверяю доступность...
                        </span>
                    ) : availability?.has_available ? (
                        <div>
                            <div className="flex items-center gap-2 font-medium">
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                                Свободна: {availability.available.map((t) => t.truck_name).join(', ')}
                            </div>
                            <div className="mt-0.5 text-xs text-green-700 opacity-80">Будет автоматически назначена первая свободная единица</div>
                        </div>
                    ) : availability && !availability.has_available ? (
                        <div>
                            <div className="flex items-center gap-2 font-medium">
                                <AlertTriangle className="h-4 w-4 text-amber-600" />
                                Все единицы заняты на этот период
                            </div>
                            {availability.occupied.map((t: any) => (
                                <div key={t.truck_id} className="mt-1.5 border-t border-amber-200 pt-1.5 text-xs">
                                    <span className="font-medium">{t.truck_name}</span>
                                    {t.conflicts?.map((c: any, i: number) => (
                                        <div key={i} className="text-amber-700">
                                            → {c.from} – {c.to}: {c.purpose}
                                        </div>
                                    ))}
                                    <div className="mt-0.5 font-medium text-green-700">
                                        Освободится:{' '}
                                        {t.free_at
                                            ? fmtDt(
                                                  new Date(t.free_at.replace(/(\d{2})\.(\d{2})\.(\d{4}) (\d{2}:\d{2})/, '$3-$2-$1T$4')).toISOString(),
                                              )
                                            : '—'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            )}

            {/* Цель работ */}
            <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">
                    Цель работ <span className="text-red-500">*</span>
                </label>
                <textarea
                    value={purpose}
                    onChange={(e) => {
                        setPurpose(e.target.value);
                        setErrors((p) => ({ ...p, purpose: '' }));
                    }}
                    placeholder="Например: разгрузка контейнеров на Т2"
                    rows={2}
                    className="border-border bg-background placeholder:text-muted-foreground resize-none rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                />
                {errors.purpose && <span className="text-xs text-red-500">{errors.purpose}</span>}
            </div>

            {/* Адрес */}
            <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Адрес / Место</label>
                <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Терминал, здание, гейт..."
                    className="border-border bg-background placeholder:text-muted-foreground h-9 rounded-md border px-3 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                />
            </div>

            {/* Примечания */}
            <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">Примечания</label>
                <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Дополнительная информация..."
                    rows={2}
                    className="border-border bg-background placeholder:text-muted-foreground resize-none rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-red-600/30 focus:outline-none"
                />
            </div>

            <Button
                type="button"
                className="w-full bg-red-600 text-white hover:bg-red-700"
                onClick={handleSubmit}
                disabled={submitting || (!!availability && !availability.has_available)}
            >
                {submitting ? 'Создание...' : 'Запланировать'}
            </Button>

            {availability && !availability.has_available && (
                <p className="text-center text-xs text-amber-700">Невозможно создать запись — выберите другое время</p>
            )}
        </div>
    );
};

// ─── Таймлайн (Gantt) ─────────────────────────────────────────────────────────

interface GanttProps {
    schedules: ScheduleItem[];
    equipmentTypes: EquipmentType[];
}

const GanttView: React.FC<GanttProps> = ({ schedules, equipmentTypes }) => {
    const active = useMemo(() => schedules.filter((s) => s.status !== 'cancelled' && s.status !== 'done'), [schedules]);

    if (active.length === 0) {
        return <div className="text-muted-foreground py-8 text-center text-sm">Нет активных записей расписания</div>;
    }

    // Определяем временной диапазон
    const starts = active.map((s) => new Date(s.scheduled_start).getTime());
    const ends = active.map((s) => new Date(s.scheduled_end).getTime());

    const rangeStart = Math.min(...starts);
    const rangeEnd = Math.max(...ends);
    const total = rangeEnd - rangeStart || 1;
    const totalHours = total / (1000 * 60 * 60);

    const getLeft = (iso: string) => ((new Date(iso).getTime() - rangeStart) / total) * 100;
    const getWidth = (s: string, e: string) => Math.max(((new Date(e).getTime() - new Date(s).getTime()) / total) * 100, 2);

    const formatAxisLabel = (date: Date): string => {
        if (totalHours <= 24) {
            return date.toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            });
        }

        if (totalHours <= 72) {
            return `${date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
        }

        return `${date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
    };

    // Группируем по типу техники
    const grouped = useMemo(() => {
        const map = new Map<string, ScheduleItem[]>();
        for (const s of active) {
            const arr = map.get(s.equipment_type_key) ?? [];
            arr.push(s);
            map.set(s.equipment_type_key, arr);
        }
        return map;
    }, [active]);

    return (
        <div className="overflow-x-auto">
            <div className="min-w-[600px]">
                {/* Заголовок шкалы: метки с учетом времени */}
                <div className="border-border relative mb-1 ml-28 h-9 border-b">
                    {[0, 20, 40, 60, 80, 100].map((pct) => {
                        const t = new Date(rangeStart + (total * pct) / 100);
                        return (
                            <span
                                key={pct}
                                className="text-muted-foreground absolute -translate-x-1/2 text-[10px] whitespace-nowrap"
                                style={{ left: `${pct}%` }}
                            >
                                {formatAxisLabel(t)}
                            </span>
                        );
                    })}
                </div>

                {/* Ряды по типам и единицам */}
                {Array.from(grouped.entries()).map(([typeKey, items]) => {
                    const typeLabel = items[0]?.equipment_type_label ?? typeKey;

                    // Собираем уникальные машины
                    const trucks = equipmentTypes.find((t) => t.key === typeKey)?.trucks ?? [];

                    return (
                        <div key={typeKey} className="mb-3">
                            <div className="text-muted-foreground mb-1 text-xs font-semibold">{typeLabel}</div>
                            {trucks.map((truck) => {
                                const truckItems = items.filter((s) => s.truck_id === truck.id);
                                return (
                                    <div key={truck.id} className="mb-1 flex items-center gap-2">
                                        <div className="text-muted-foreground w-28 flex-shrink-0 truncate pr-2 text-right text-[11px]">
                                            {truck.name}
                                        </div>
                                        <div className="bg-muted/30 border-border/50 relative h-7 flex-1 overflow-hidden rounded border">
                                            {truckItems.map((s) => {
                                                const left = getLeft(s.scheduled_start);
                                                const width = getWidth(s.scheduled_start, s.scheduled_end);
                                                const col = STATUS_COLORS[s.status] ?? STATUS_COLORS.pending;
                                                return (
                                                    <div
                                                        key={s.id}
                                                        title={`${s.purpose}\n${fmtDt(s.scheduled_start)} – ${fmtDt(s.scheduled_end)}`}
                                                        className="absolute top-0.5 bottom-0.5 flex cursor-default items-center overflow-hidden rounded px-1 text-[10px]"
                                                        style={{
                                                            left: `${left}%`,
                                                            width: `${width}%`,
                                                            background: col.bg,
                                                            color: col.text,
                                                            borderLeft: `2px solid ${col.border}`,
                                                        }}
                                                    >
                                                        <span className="truncate">{s.purpose}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ─── Строка расписания ─────────────────────────────────────────────────────────

interface RowProps {
    item: ScheduleItem;
    isOperator: boolean;
    onCancel: (id: number) => void;
    onStatusChange: (id: number, status: string) => void;
    onCreateRequest?: (scheduleId: number) => void;
}

const ScheduleRow: React.FC<RowProps> = ({ item, isOperator, onCancel, onStatusChange, onCreateRequest }) => {
    const [expanded, setExpanded] = useState(false);
    const col = STATUS_COLORS[item.status] ?? STATUS_COLORS.pending;
    const durationHours = getDurationHours(item.scheduled_start, item.scheduled_end);

    return (
        <>
            <tr className="border-b border-[#E8E8E8] text-[12.5px] hover:bg-[#FAFAFA]">
                <td className="px-3 py-2 font-medium">#{item.id}</td>
                <td className="px-3 py-2">{item.equipment_type_label}</td>
                <td className="text-muted-foreground px-3 py-2">{item.assigned_truck_name ?? '—'}</td>
                <td className="max-w-[200px] truncate px-3 py-2" title={item.purpose}>
                    {item.purpose}
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">
                    <div>{fmtDt(item.scheduled_start)}</div>
                    <div className="text-muted-foreground">→ {fmtDt(item.scheduled_end)}</div>
                </td>
                <td className="px-3 py-2 text-xs font-medium whitespace-nowrap text-[#1A1A1A]">
                    <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${getDurationBadgeClass(durationHours)}`}
                    >
                        {fmtDurationHours(item.scheduled_start, item.scheduled_end)}
                    </span>
                </td>
                <td className="px-3 py-2">
                    <span
                        className="rounded border px-2 py-0.5 text-[11px] font-medium"
                        style={{ background: col.bg, color: col.text, borderColor: col.border }}
                    >
                        {item.status_label}
                    </span>
                </td>
                <td className="text-muted-foreground px-3 py-2 text-xs">{item.client_name}</td>
                <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                        <button
                            onClick={() => setExpanded((v) => !v)}
                            className="hover:bg-muted inline-flex h-7 items-center gap-1 rounded border border-[#E0E0E0] px-2 text-[11px]"
                        >
                            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                        {['pending', 'confirmed'].includes(item.status) &&
                            onCreateRequest &&
                            (item.has_request ? (
                                <span
                                    title={item.request_id ? `Заявка #${item.request_id} уже создана` : 'Заявка уже создана'}
                                    className="inline-flex h-7 items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 text-[11px] text-blue-700"
                                >
                                    <FileText className="h-3 w-3" />
                                    <span className="hidden sm:inline">Заявка #{item.request_id ?? '—'}</span>
                                </span>
                            ) : (
                                <button
                                    onClick={() => onCreateRequest(item.id)}
                                    title="Создать заявку из планирования"
                                    className="inline-flex h-7 items-center gap-1 rounded border border-green-200 bg-green-50 px-2 text-[11px] text-green-700 hover:bg-green-100"
                                >
                                    <FileText className="h-3 w-3" />
                                    <span className="hidden sm:inline">Заявка</span>
                                </button>
                            ))}
                        {isOperator && item.status !== 'cancelled' && item.status !== 'done' && (
                            <select
                                value={item.status}
                                onChange={(e) => onStatusChange(item.id, e.target.value)}
                                className="border-border bg-background h-7 rounded border px-1 text-[11px]"
                            >
                                <option value="pending">Ожидает</option>
                                <option value="confirmed">Подтверждено</option>
                                <option value="in_progress">В работе</option>
                                <option value="done">Выполнено</option>
                                <option value="cancelled">Отменено</option>
                            </select>
                        )}
                        {item.status !== 'cancelled' && item.status !== 'done' && (
                            <button
                                onClick={() => onCancel(item.id)}
                                title="Отменить запись"
                                className="flex h-7 w-7 items-center justify-center rounded border border-red-200 text-red-500 hover:bg-red-50"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                </td>
            </tr>

            {expanded && (
                <tr className="border-b border-[#E8E8E8] bg-[#FCFCFC]">
                    <td colSpan={9} className="px-4 py-3">
                        <div className="grid gap-3 text-xs text-[#2C2C2C] md:grid-cols-2">
                            <div>
                                {item.address && (
                                    <div>
                                        <span className="font-medium">Адрес:</span> {item.address}
                                    </div>
                                )}
                                {item.notes && (
                                    <div className="mt-1">
                                        <span className="font-medium">Примечания:</span> {item.notes}
                                    </div>
                                )}
                                <div className="mt-1">
                                    <span className="font-medium">Связь с заявкой:</span>{' '}
                                    {item.has_request ? `создана заявка #${item.request_id ?? '—'}` : 'заявка ещё не создана'}
                                </div>
                                <div className="mt-1">
                                    <span className="font-medium">Время:</span>{' '}
                                    <span
                                        className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${getDurationBadgeClass(durationHours)}`}
                                    >
                                        {fmtDurationHours(item.scheduled_start, item.scheduled_end)}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <div>
                                    <span className="font-medium">Создано:</span> {fmtDt(item.created_at)}
                                </div>
                                <div>
                                    <span className="font-medium">Создал:</span> {item.client_name ?? '—'}
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};

// ─── Конфликт-попап ───────────────────────────────────────────────────────────

const ConflictAlert: React.FC<{ result: BookingResult; onClose: () => void }> = ({ result, onClose }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-amber-200 bg-white shadow-2xl">
            <div className="flex items-center gap-2 rounded-t-xl border-b border-amber-200 bg-amber-50 px-4 py-3">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <span className="font-semibold text-amber-900">Вся техника занята</span>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-auto">
                    <X className="h-4 w-4" />
                </button>
            </div>
            <div className="space-y-3 overflow-y-auto p-4">
                <p className="text-sm text-[#2C2C2C]">На выбранный период ни одна единица техники не доступна. Выберите другое время.</p>
                {result.conflict_info?.map((truck, i) => (
                    <div key={i} className="border-border bg-muted/30 rounded-md border p-3 text-sm">
                        <div className="font-semibold text-[#1A1A1A]">
                            {truck.truck_name}
                            {truck.plate_number ? ` (${truck.plate_number})` : ''}
                        </div>
                        {truck.conflicts.map((c, j) => (
                            <div key={j} className="text-muted-foreground mt-0.5 flex gap-1 text-xs">
                                <Clock className="mt-0.5 h-3 w-3 flex-shrink-0" />
                                <span>
                                    Занят: {c.from} – {c.to} | {c.purpose}
                                </span>
                            </div>
                        ))}
                        <div className="mt-1 flex items-center gap-1 text-xs font-medium text-green-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Освободится: {truck.free_at}
                        </div>
                    </div>
                ))}
            </div>
            <div className="px-4 pb-4">
                <Button className="w-full" variant="outline" onClick={onClose}>
                    Закрыть и выбрать другое время
                </Button>
            </div>
        </div>
    </div>
);

// ─── Главный компонент ────────────────────────────────────────────────────────

const SpectechPlanningManager: React.FC = () => {
    const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
    const [equipmentTypes, setEquipmentTypes] = useState<EquipmentType[]>([]);
    const [loading, setLoading] = useState(true);
    const [formOpen, setFormOpen] = useState(false);
    const [view, setView] = useState<'list' | 'gantt'>('list');
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [durationSort, setDurationSort] = useState<'default' | 'short' | 'long'>('default');
    const [conflictResult, setConflictResult] = useState<BookingResult | null>(null);
    const [toast, setToast] = useState('');

    // Состояние для модального окна создания заявки
    const [requestModalOpen, setRequestModalOpen] = useState(false);
    const [selectedSchedule, setSelectedSchedule] = useState<ScheduleItem | null>(null);

    // Имитируем проверку роли упрощённо (оператор = manage spectech)
    const [isOperator] = useState(true);

    const showToast = (msg: string) => {
        setToast(msg);
        window.setTimeout(() => setToast(''), 3000);
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [schedRes, typesRes] = await Promise.all([
                axios.get('/spectech/api/schedule', { params: { status: statusFilter !== 'all' ? statusFilter : undefined } }),
                axios.get('/spectech/api/schedule/equipment-types'),
            ]);
            if (schedRes.data?.status) setSchedules(schedRes.data.data ?? []);
            if (typesRes.data?.status) setEquipmentTypes(typesRes.data.data ?? []);
        } catch {
            // Ошибки обработаны выше
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCreated = (item: ScheduleItem) => {
        setSchedules((prev) => [item, ...prev]);
        setFormOpen(false);
        showToast(`Запланировано: ${item.assigned_truck_name ?? item.equipment_type_label}`);
    };

    const handleConflict = (result: BookingResult) => {
        setConflictResult(result);
    };

    const handleCancel = async (id: number) => {
        if (!window.confirm('Отменить запись расписания?')) return;
        try {
            await axios.delete(`/spectech/api/schedule/${id}`);
            setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, status: 'cancelled', status_label: 'Отменено' } : s)));
            showToast('Запись отменена');
        } catch {
            showToast('Ошибка при отмене');
        }
    };

    const handleStatusChange = async (id: number, status: string) => {
        try {
            const res = await axios.patch(`/spectech/api/schedule/${id}/status`, { status });
            if (res.data?.status) {
                setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, ...res.data.data } : s)));
                showToast('Статус обновлён');
            }
        } catch {
            showToast('Ошибка обновления статуса');
        }
    };

    const handleCreateRequest = (scheduleId: number) => {
        const schedule = schedules.find((s) => s.id === scheduleId);
        if (schedule) {
            if (schedule.has_request) {
                showToast(schedule.request_id ? `Заявка #${schedule.request_id} уже создана` : 'Для этого планирования заявка уже создана');
                return;
            }
            setSelectedSchedule(schedule);
            setRequestModalOpen(true);
        }
    };

    const handleRequestCreated = () => {
        showToast('Заявка успешно создана');
        setRequestModalOpen(false);
        setSelectedSchedule(null);
        fetchData();
    };

    const filtered = useMemo(() => {
        if (statusFilter === 'all') return schedules;
        return schedules.filter((s) => s.status === statusFilter);
    }, [schedules, statusFilter]);

    const visible = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const searched = !q
            ? filtered
            : filtered.filter((s) => {
                  const haystack = [
                      String(s.id),
                      s.equipment_type_label,
                      s.assigned_truck_name ?? '',
                      s.purpose,
                      s.address ?? '',
                      s.client_name ?? '',
                      s.request_id ? `#${s.request_id}` : '',
                  ]
                      .join(' ')
                      .toLowerCase();
                  return haystack.includes(q);
              });

        if (durationSort === 'default') {
            return searched;
        }

        return [...searched].sort((a, b) => {
            const aHours = getDurationHours(a.scheduled_start, a.scheduled_end) ?? 0;
            const bHours = getDurationHours(b.scheduled_start, b.scheduled_end) ?? 0;
            return durationSort === 'short' ? aHours - bHours : bHours - aHours;
        });
    }, [filtered, searchQuery, durationSort]);

    const stats = useMemo(() => {
        const active = schedules.filter((s) => ['pending', 'confirmed', 'in_progress'].includes(s.status)).length;
        const done = schedules.filter((s) => s.status === 'done').length;
        const cancelled = schedules.filter((s) => s.status === 'cancelled').length;
        const linked = schedules.filter((s) => s.has_request).length;
        return [
            { label: 'Всего', value: schedules.length, tone: 'text-foreground' },
            { label: 'Активных', value: active, tone: 'text-blue-700' },
            { label: 'Со связанной заявкой', value: linked, tone: 'text-emerald-700' },
            { label: 'Выполнено', value: done, tone: 'text-green-700' },
            { label: 'Отменено', value: cancelled, tone: 'text-muted-foreground' },
        ];
    }, [schedules]);

    return (
        <div className="flex flex-col gap-4">
            {/* Модальное окно создания заявки из планирования */}
            {selectedSchedule && (
                <NewRequestFromScheduleModal
                    open={requestModalOpen}
                    onClose={() => {
                        setRequestModalOpen(false);
                        setSelectedSchedule(null);
                    }}
                    onCreated={handleRequestCreated}
                    scheduleId={selectedSchedule.id}
                    scheduleTruckName={selectedSchedule.assigned_truck_name ?? undefined}
                    scheduleStart={selectedSchedule.scheduled_start}
                    scheduleEnd={selectedSchedule.scheduled_end}
                />
            )}

            {/* Конфликт-попап */}
            {conflictResult && <ConflictAlert result={conflictResult} onClose={() => setConflictResult(null)} />}

            {/* Toast */}
            {toast && (
                <div className="fixed right-4 bottom-4 z-50 rounded-md border border-[#E8E8E8] bg-white px-4 py-2.5 text-[13px] text-[#1A1A1A] shadow-lg">
                    {toast}
                </div>
            )}

            {/* Header */}
            <section className="rounded-xl border border-[#E8E8E8] bg-gradient-to-r from-white to-[#FFF8F8] px-4 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <CalendarRange className="h-5 w-5 text-red-600" />
                            <p className="text-[13px] font-semibold text-[#1A1A1A]">Планирование спецтехники</p>
                        </div>
                        <p className="text-xs text-[#6B6B6B]">
                            Умное бронирование — система автоматически выбирает свободную единицу и предупреждает о конфликтах.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button size="sm" className="w-full bg-red-600 text-white hover:bg-red-700 sm:w-auto" onClick={() => setFormOpen((v) => !v)}>
                            <Plus className="mr-1 h-4 w-4" />
                            {formOpen ? 'Свернуть' : 'Запланировать'}
                        </Button>
                    </div>
                </div>
            </section>

            {/* Форма */}
            {formOpen && (
                <section className="rounded-lg border border-[#E8E8E8] bg-white p-4">
                    <p className="mb-3 text-[12.5px] font-semibold text-[#1A1A1A]">Новое бронирование</p>
                    {equipmentTypes.length === 0 ? (
                        <div className="text-muted-foreground text-sm">
                            Спецтехника не найдена. Добавьте технику в раздел «Спецтехника → Справочник».
                        </div>
                    ) : (
                        <CreateForm equipmentTypes={equipmentTypes} onCreated={handleCreated} onConflict={handleConflict} />
                    )}
                </section>
            )}

            {/* Статистика */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {stats.map((s) => (
                    <div key={s.label} className="border-border bg-card rounded-lg border p-3">
                        <div className="text-muted-foreground text-[11px]">{s.label}</div>
                        <div className={`mt-1 text-2xl font-semibold ${s.tone}`}>{s.value}</div>
                    </div>
                ))}
            </div>

            {/* Фильтры и переключатель вида */}
            <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    {Object.entries(STATUS_LABELS).map(([val, lbl]) => (
                        <button
                            key={val}
                            onClick={() => setStatusFilter(val)}
                            className={`h-7 rounded-full border px-3 text-xs font-medium transition-colors ${
                                statusFilter === val ? 'border-red-600 bg-red-600 text-white' : 'border-border bg-background hover:bg-muted'
                            }`}
                        >
                            {lbl}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:flex xl:flex-wrap xl:justify-end">
                    <div className="relative min-w-0 md:col-span-2 xl:w-56">
                        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Поиск по ID, технике, цели"
                            className="border-border bg-background h-9 w-full rounded-md border pr-3 pl-8 text-sm outline-none focus:ring-2 focus:ring-red-600/20 xl:h-7 xl:px-2 xl:pl-8 xl:text-xs"
                        />
                    </div>
                    <select
                        value={durationSort}
                        onChange={(e) => setDurationSort(e.target.value as 'default' | 'short' | 'long')}
                        className="border-border bg-background h-9 w-full rounded-md border px-3 text-sm outline-none focus:ring-2 focus:ring-red-600/20 xl:h-7 xl:w-auto xl:px-2 xl:text-xs"
                    >
                        <option value="default">Сортировка: по умолчанию</option>
                        <option value="short">Сначала короткие</option>
                        <option value="long">Сначала длинные</option>
                    </select>
                    <div className="border-border grid grid-cols-2 overflow-hidden rounded-md border">
                        <button
                            onClick={() => setView('list')}
                            className={`flex h-9 items-center justify-center gap-1 px-3 text-sm xl:h-7 xl:text-xs ${view === 'list' ? 'bg-muted' : 'bg-background hover:bg-muted/50'}`}
                        >
                            <Calendar className="h-3.5 w-3.5" />
                            Список
                        </button>
                        <button
                            onClick={() => setView('gantt')}
                            className={`border-border flex h-9 items-center justify-center gap-1 border-l px-3 text-sm xl:h-7 xl:text-xs ${view === 'gantt' ? 'bg-muted' : 'bg-background hover:bg-muted/50'}`}
                        >
                            <CalendarRange className="h-3.5 w-3.5" />
                            Таймлайн
                        </button>
                    </div>
                </div>
            </div>

            {/* Контент */}
            <section className="min-h-[200px] rounded-lg border border-[#E8E8E8] bg-white p-4">
                {loading && <p className="text-muted-foreground text-[12.5px]">Загрузка...</p>}

                {!loading && view === 'gantt' && <GanttView schedules={visible} equipmentTypes={equipmentTypes} />}

                {!loading && view === 'list' && visible.length === 0 && (
                    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 py-12">
                        <CalendarRange className="h-10 w-10 opacity-30" />
                        <span className="text-sm">Записей не найдено. Измени фильтры или поиск.</span>
                    </div>
                )}

                {!loading && view === 'list' && visible.length > 0 && (
                    <>
                        <div className="space-y-3 lg:hidden">
                            {visible.map((item) => {
                                const col = STATUS_COLORS[item.status] ?? STATUS_COLORS.pending;
                                const durationHours = getDurationHours(item.scheduled_start, item.scheduled_end);

                                return (
                                    <article key={item.id} className="rounded-xl border border-[#E8E8E8] bg-white p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-[#1A1A1A]">
                                                    #{item.id} {item.equipment_type_label}
                                                </p>
                                                <p className="mt-1 text-xs text-[#6B6B6B]">
                                                    {item.assigned_truck_name ?? 'Техника будет назначена автоматически'}
                                                </p>
                                            </div>
                                            <span
                                                className="shrink-0 rounded border px-2 py-1 text-[11px] font-medium"
                                                style={{ background: col.bg, color: col.text, borderColor: col.border }}
                                            >
                                                {item.status_label}
                                            </span>
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <span
                                                className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${getDurationBadgeClass(durationHours)}`}
                                            >
                                                {fmtDurationHours(item.scheduled_start, item.scheduled_end)}
                                            </span>
                                            {item.has_request ? (
                                                <span className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                                                    Заявка #{item.request_id ?? '—'}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center rounded border border-[#E8E8E8] bg-[#FAFAFA] px-2 py-0.5 text-[11px] text-[#8A8A8A]">
                                                    Заявка не создана
                                                </span>
                                            )}
                                        </div>

                                        <div className="mt-3 space-y-2 text-xs text-[#2C2C2C]">
                                            <div>
                                                <span className="font-medium">Цель:</span>{' '}
                                                <span className="break-words text-[#6B6B6B]">{item.purpose}</span>
                                            </div>
                                            <div>
                                                <span className="font-medium">Период:</span>{' '}
                                                <span className="break-words text-[#6B6B6B]">
                                                    {fmtDt(item.scheduled_start)} → {fmtDt(item.scheduled_end)}
                                                </span>
                                            </div>
                                            {item.address && (
                                                <div>
                                                    <span className="font-medium">Адрес:</span>{' '}
                                                    <span className="break-words text-[#6B6B6B]">{item.address}</span>
                                                </div>
                                            )}
                                            {item.notes && (
                                                <div>
                                                    <span className="font-medium">Примечания:</span>{' '}
                                                    <span className="break-words text-[#6B6B6B]">{item.notes}</span>
                                                </div>
                                            )}
                                            <div className="text-[#6B6B6B]">Создал: {item.client_name ?? '—'}</div>
                                        </div>

                                        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                                            {['pending', 'confirmed'].includes(item.status) &&
                                                (item.has_request ? (
                                                    <div className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-3 text-[12px] text-blue-700">
                                                        <FileText className="h-3.5 w-3.5" />
                                                        Заявка #{item.request_id ?? '—'}
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => handleCreateRequest(item.id)}
                                                        className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-green-200 bg-green-50 px-3 text-[12px] text-green-700 hover:bg-green-100"
                                                    >
                                                        <FileText className="h-3.5 w-3.5" />
                                                        Создать заявку
                                                    </button>
                                                ))}

                                            {isOperator && item.status !== 'cancelled' && item.status !== 'done' && (
                                                <select
                                                    value={item.status}
                                                    onChange={(e) => handleStatusChange(item.id, e.target.value)}
                                                    className="border-border bg-background h-9 rounded-md border px-3 text-[12px]"
                                                >
                                                    <option value="pending">Ожидает</option>
                                                    <option value="confirmed">Подтверждено</option>
                                                    <option value="in_progress">В работе</option>
                                                    <option value="done">Выполнено</option>
                                                    <option value="cancelled">Отменено</option>
                                                </select>
                                            )}

                                            {item.status !== 'cancelled' && item.status !== 'done' && (
                                                <button
                                                    onClick={() => handleCancel(item.id)}
                                                    title="Отменить запись"
                                                    className="inline-flex h-9 items-center justify-center rounded-md border border-red-200 px-3 text-[12px] text-red-500 hover:bg-red-50"
                                                >
                                                    Отменить
                                                </button>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>

                        <div className="hidden overflow-x-auto lg:block">
                            <table className="min-w-full border-collapse text-left text-[12.5px]">
                                <thead>
                                    <tr className="border-b border-[#E8E8E8] text-[#6B6B6B]">
                                        <th className="px-3 py-2">ID</th>
                                        <th className="px-3 py-2">Тип техники</th>
                                        <th className="px-3 py-2">Назначена</th>
                                        <th className="px-3 py-2">Цель</th>
                                        <th className="px-3 py-2">Период</th>
                                        <th className="px-3 py-2">Время</th>
                                        <th className="px-3 py-2">Статус</th>
                                        <th className="px-3 py-2">Создал</th>
                                        <th className="px-3 py-2">Действия</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map((item) => (
                                        <ScheduleRow
                                            key={item.id}
                                            item={item}
                                            isOperator={isOperator}
                                            onCancel={handleCancel}
                                            onStatusChange={handleStatusChange}
                                            onCreateRequest={handleCreateRequest}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>
        </div>
    );
};

export default SpectechPlanningManager;
