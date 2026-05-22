import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import { type BreadcrumbItem } from '@/types';
import {
    Plus, ClipboardList, RefreshCw, ChevronDown, ChevronUp,
    Search, Truck, MapPin, Calendar, CheckCircle2, Clock, Pencil, Phone, XCircle, AlertTriangle, User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { type SpectechRequestData } from '@/components/spectech/RequestCard';
import PhotoGallery from '@/components/spectech/PhotoGallery';
import NewRequestModal from '@/components/spectech/NewRequestModal';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Спецтехника', href: '/spectech/requests' },
    { title: 'Мои заявки', href: '/spectech/requests' },
];

const STATUS_FILTERS = [
    { value: '', label: 'Все' },
    { value: 'new', label: 'Новые' },
    { value: 'departure', label: 'Выезд' },
    { value: 'on_location', label: 'На объекте' },
    { value: 'work_started', label: 'Работы начаты' },
    { value: 'completed', label: 'Выполнено' },
    { value: 'returned', label: 'Возврат' },
    { value: 'cancelled', label: 'Отменено' },
];

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
    new:          { bg: '#F5F5F5', text: '#555555', border: '#DDDDDD', dot: '#999' },
    departure:    { bg: '#FFF4E6', text: '#B45309', border: '#FDE68A', dot: '#F59E0B' },
    on_location:  { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', dot: '#3B82F6' },
    work_started: { bg: '#F5F3FF', text: '#6D28D9', border: '#DDD6FE', dot: '#7C3AED' },
    completed:    { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0', dot: '#22C55E' },
    returned:     { bg: '#F0FDF4', text: '#166534', border: '#86EFAC', dot: '#16A34A' },
    cancelled:    { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA', dot: '#EF4444' },
};


function formatDate(v?: string | null): string {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(v?: string | null): string {
    if (!v) return '—';
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function buildOperatorUpdateMessage(request: SpectechRequestData): string {
    const parts = [
        request.operator_updated_by_name ? `Оператор: ${request.operator_updated_by_name}` : null,
        request.operator_updated_at ? `Обновлено: ${formatDateTime(request.operator_updated_at)}` : null,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' · ') : 'Проверьте время, технику и адрес заявки.';
}

function getCurrentStage(request: SpectechRequestData): string {
    if (request.status === 'new') {
        return 'Пока планируем';
    }

    const done = (request.timeline ?? []).filter(s => s.time);
    return done.length > 0 ? done[done.length - 1].title : 'Заявка создана';
}

// ─── Модал отмены заявки ──────────────────────────────────────────────────────

const CancelModal: React.FC<{
    open: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => void;
    loading: boolean;
}> = ({ open, onClose, onConfirm, loading }) => {
    const [reason, setReason] = useState('');

    useEffect(() => { if (!open) setReason(''); }, [open]);

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-md p-0 gap-0">
                <DialogHeader className="border-b px-5 py-4">
                    <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
                        <XCircle className="h-4 w-4 text-red-600" />
                        Отмена заявки
                    </DialogTitle>
                </DialogHeader>
                <div className="px-5 py-4 flex flex-col gap-3">
                    <p className="text-xs text-[#666]">Укажите причину отмены. Это поможет улучшить работу сервиса.</p>
                    <textarea
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        rows={3}
                        placeholder="Причина отмены..."
                        className="w-full rounded-lg border border-[#E0E0E0] px-3 py-2 text-sm focus:border-red-300 focus:ring-2 focus:ring-red-100 outline-none resize-none"
                    />
                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>Назад</Button>
                        <Button
                            size="sm"
                            className="bg-red-600 hover:bg-red-700 text-white"
                            onClick={() => reason.trim() && onConfirm(reason.trim())}
                            disabled={loading || !reason.trim()}
                        >
                            {loading ? 'Отмена...' : 'Отменить заявку'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};


// ─── Карточка заявки ──────────────────────────────────────────────────────────

const RequestItem: React.FC<{
    req: SpectechRequestData;
    expanded: boolean;
    onToggle: () => void;
    onEdit: () => void;
    onCancel: () => void;
}> = ({ req, expanded, onToggle, onEdit, onCancel }) => {
    const st = STATUS_STYLES[req.status] ?? STATUS_STYLES.new;
    const timeline = req.timeline ?? [];
    const doneCount = timeline.filter(s => s.time).length;
    const progressPct = timeline.length > 0 ? Math.round((doneCount / timeline.length) * 100) : 0;
    const isCancelled = req.status === 'cancelled';
    const isPlanning = req.status === 'new';
    const hasOperatorUpdate = req.updated_by_operator === true;
    const hasPlanningConflict = (req.conflict_info ?? []).length > 0;

    const period = req.requested_start && req.requested_end
        ? `${formatDateTime(req.requested_start)} — ${formatDateTime(req.requested_end)}`
        : `${formatDate(req.start_date)} — ${formatDate(req.end_date)}`;

    return (
        <div className={`rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow ${isCancelled ? 'border-red-200' : 'border-[#E8E8E8]'}`}>
            {/* ── Шапка карточки ── */}
            <div className="flex items-start gap-3 p-4">
                {/* Иконка статуса */}
                <div
                    className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                    style={{ background: st.bg, border: `1px solid ${st.border}` }}
                >
                    <Truck className="h-4 w-4" style={{ color: st.dot }} />
                </div>

                {/* Основная инфо */}
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-[13px] font-semibold text-[#1A1A1A] truncate">{req.equipment_name}</span>
                        {req.plate_number && (
                            <span className="text-[11px] text-[#888] border border-[#E0E0E0] rounded px-1.5 py-0.5 flex-shrink-0">
                                {req.plate_number}
                            </span>
                        )}
                        <span className="flex-shrink-0 ml-auto">
                            <span
                                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                                style={{ background: st.bg, color: st.text, borderColor: st.border }}
                            >
                                <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: st.dot }} />
                                {req.status_label}
                            </span>
                        </span>
                    </div>

                    {/* Мета-инфо */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[#6B6B6B]">
                        <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 flex-shrink-0" />
                            {period}
                        </span>
                        <span className="flex items-center gap-1">
                            <User className="h-3 w-3 flex-shrink-0" />
                            {req.initiator_phone ? `${req.initiator_name || req.client_name || 'Инициатор'} · ${req.initiator_phone}` : `Инициатор: ${req.initiator_name || req.client_name || '—'}`}
                        </span>
                        <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3 flex-shrink-0" />
                            {req.driver_phone ? `${req.driver_name || 'Водитель'} · ${req.driver_phone}` : `Водитель: ${req.driver_name || '—'}`}
                        </span>
                        {req.address && (
                            <span className="flex items-center gap-1 truncate max-w-[260px]">
                                <MapPin className="h-3 w-3 flex-shrink-0" />
                                {req.address}
                            </span>
                        )}
                    </div>
                    {isCancelled && (
                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-red-700">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Заявка отменена
                                {req.cancelled_by && (
                                    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px]">
                                        {req.cancelled_by === 'operator' ? 'оператором' : 'заказчиком'}
                                    </span>
                                )}
                            </div>
                            <div className="mt-1 text-[12px] text-red-800">{req.cancellation_reason || 'Причина не указана'}</div>
                        </div>
                    )}
                    {isPlanning && (
                        <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-sky-700">
                                <Clock className="h-3.5 w-3.5" />
                                Пока планируем
                            </div>
                            <div className="mt-1 text-[12px] text-sky-800">Заявка принята. Диспетчер подбирает технику и планирует выезд.</div>
                        </div>
                    )}
                    {hasOperatorUpdate && (
                        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-amber-700">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Заявка обновлена оператором
                            </div>
                            <div className="mt-1 text-[12px] text-amber-900">{buildOperatorUpdateMessage(req)}</div>
                        </div>
                    )}
                    {hasPlanningConflict && (
                        <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-orange-700">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                Конфликт планирования
                            </div>
                            <div className="mt-1 text-[12px] text-orange-800">Детали конфликта доступны внутри заявки.</div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Прогресс и ID ── */}
            <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-[#AAA] flex-shrink-0">#{req.id}</span>
                <div className="flex-1 relative h-1.5 rounded-full bg-[#F0F0F0] overflow-hidden min-w-[60px]">
                    <div
                        className="absolute left-0 top-0 h-full rounded-full transition-all"
                        style={{ width: `${progressPct}%`, background: st.dot }}
                    />
                </div>
                <span className="text-[11px] text-[#888] flex-shrink-0">{isCancelled ? 'Отменена' : getCurrentStage(req)}</span>
                {!['completed', 'returned', 'cancelled'].includes(req.status) && (
                    <button
                        type="button"
                        onClick={onEdit}
                        className="flex-shrink-0 flex items-center gap-1 text-[11px] text-[#666] hover:text-[#1A1A1A] border border-[#E8E8E8] rounded-md px-2 py-1 hover:bg-[#FAFAFA]"
                    >
                        <Pencil className="h-3.5 w-3.5" />
                        Изменить
                    </button>
                )}
                <button
                    type="button"
                    onClick={onToggle}
                    className="flex-shrink-0 flex items-center gap-1 text-[11px] text-[#666] hover:text-[#1A1A1A] border border-[#E8E8E8] rounded-md px-2 py-1 hover:bg-[#FAFAFA]"
                >
                    {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    Детали
                </button>
                {!['completed', 'returned', 'cancelled'].includes(req.status) && (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="flex-shrink-0 flex items-center gap-1 text-[11px] text-red-600 hover:text-red-800 border border-red-200 rounded-md px-2 py-1 hover:bg-red-50"
                    >
                        <XCircle className="h-3.5 w-3.5" />
                        Отменить
                    </button>
                )}
            </div>

            {/* ── Раскрытые детали ── */}
            {expanded && (
                <div className="border-t border-[#F0F0F0] bg-[#FAFAFA] px-4 py-4 rounded-b-xl">
                    <div className="grid gap-6 sm:grid-cols-2">
                        {/* Лента */}
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#999] mb-2">Этапы выполнения</p>
                            <div className="space-y-2">
                                {timeline.map((step, i) => (
                                    <div key={i} className="flex items-start gap-2.5">
                                        <div className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
                                            step.time
                                                ? 'border-green-300 bg-green-50'
                                                : 'border-[#E0E0E0] bg-white'
                                        }`}>
                                            {step.time
                                                ? <CheckCircle2 className="h-3 w-3 text-green-600" />
                                                : <Clock className="h-3 w-3 text-[#CCC]" />}
                                        </div>
                                        <div>
                                            <div className={`text-[12px] ${step.time ? 'text-[#1A1A1A] font-medium' : 'text-[#999]'}`}>
                                                {step.title}
                                            </div>
                                            {step.time && (
                                                <div className="text-[11px] text-[#6B6B6B]">{formatDateTime(step.time)}</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Детали + фото */}
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#999] mb-2">Детали заявки</p>
                            <div className="mb-3 grid gap-2 text-[12px] text-[#444]">
                                <div><span className="font-medium">Инициатор:</span> {req.initiator_name || req.client_name || '—'}{req.initiator_phone ? ` · ${req.initiator_phone}` : ''}</div>
                                <div><span className="font-medium">Локация:</span> {req.terminal} / {req.zone}{req.gate ? ` / ${req.gate}` : ''}</div>
                                <div><span className="font-medium">Адрес:</span> {req.address || '—'}</div>
                                <div><span className="font-medium">Комментарий:</span> {req.comment || '—'}</div>
                            </div>
                            {(req.driver_name || req.driver_phone) && (
                                <p className="text-[12px] text-[#444] mb-2">
                                    <span className="font-medium">Водитель:</span> {req.driver_name || '—'}{req.driver_phone ? ` · ${req.driver_phone}` : ''}
                                </p>
                            )}
                            {req.status === 'cancelled' && req.cancellation_reason && (
                                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                                    <p className="text-[11px] font-semibold text-red-700 mb-0.5 flex items-center gap-1">
                                        <AlertTriangle className="h-3 w-3" />
                                        Причина отмены
                                        {req.cancelled_by && (
                                            <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px]">
                                                {req.cancelled_by === 'operator' ? 'оператор' : 'заказчик'}
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-[12px] text-red-800">{req.cancellation_reason}</p>
                                </div>
                            )}
                            {isPlanning && (
                                <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
                                    <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-sky-700">
                                        <Clock className="h-3 w-3" />
                                        Пока планируем
                                    </p>
                                    <p className="text-[12px] text-sky-800">Заявка в работе у диспетчера. После планирования статус обновится автоматически.</p>
                                </div>
                            )}
                            {hasOperatorUpdate && (
                                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                                    <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                                        <AlertTriangle className="h-3 w-3" />
                                        Заявка обновлена оператором
                                    </p>
                                    <p className="text-[12px] text-amber-900">{buildOperatorUpdateMessage(req)}</p>
                                </div>
                            )}
                            {hasPlanningConflict && (
                                <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                                    <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-orange-700">
                                        <AlertTriangle className="h-3 w-3" />
                                        Конфликтует с заявками
                                    </p>
                                    <div className="space-y-1.5 text-[12px] text-orange-900">
                                        {(req.conflict_info ?? []).map((conflict, idx) => (
                                            <div key={`${conflict.truck_name}-${idx}`} className="rounded border border-orange-100 bg-white px-2 py-1">
                                                <div className="font-medium">
                                                    {conflict.truck_name}{conflict.plate_number ? ` (${conflict.plate_number})` : ''}
                                                </div>
                                                {conflict.free_at && <div>Свободна с: {conflict.free_at}</div>}
                                                {(conflict.conflicts ?? []).map((item, itemIdx) => (
                                                    <div key={`${item.request_id ?? item.schedule_id ?? itemIdx}`} className="mt-1 border-t border-orange-100 pt-1">
                                                        <div className="font-semibold">
                                                            {item.request_id ? `Заявка #${item.request_id}` : item.schedule_id ? `План #${item.schedule_id}` : 'Конфликтующая заявка'}
                                                        </div>
                                                        <div>{item.from || item.scheduled_start || '—'} — {item.to || item.scheduled_end || '—'}</div>
                                                        <div>Инициатор: <span className="font-medium">{item.initiator_name || '—'}</span>{item.initiator_phone ? ` · ${item.initiator_phone}` : ''}</div>
                                                        {item.purpose && <div>Суть: {item.purpose}</div>}
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {req.source_label && (
                                <div className="mb-3">
                                    <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                                        {req.source_label}
                                    </span>
                                </div>
                            )}
                            {(req.photos ?? []).length > 0 && (
                                <>
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#999] mb-2">Фото</p>
                                    <PhotoGallery photos={req.photos ?? []} compact />
                                </>
                            )}
                            <div className="mt-3 text-[11px] text-[#999]">
                                Создана: {formatDate(req.created_at)}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Страница ─────────────────────────────────────────────────────────────────

export default function SpectechRequests() {
    const [requests, setRequests] = useState<SpectechRequestData[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [telegramOnly, setTelegramOnly] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingRequest, setEditingRequest] = useState<SpectechRequestData | null>(null);
    const [toast, setToast] = useState('');
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [cancelModalOpen, setCancelModalOpen] = useState(false);
    const [cancellingRequest, setCancellingRequest] = useState<SpectechRequestData | null>(null);
    const [cancelLoading, setCancelLoading] = useState(false);

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        try {
            const params = statusFilter ? { status: statusFilter } : {};
            const res = await axios.get('/spectech/api/requests', { params });
            const data = res.data?.data ?? res.data;
            if (Array.isArray(data)) {
                setRequests(data);
            }
        } catch { /* handled */ }
        finally { setLoading(false); }
    }, [statusFilter]);

    useEffect(() => { fetchRequests(); }, [fetchRequests]);

    const sorted = useMemo(() => [...requests].sort((a, b) => b.id - a.id), [requests]);

    const visible = useMemo(() => {
        const base = telegramOnly ? sorted.filter((req) => req.is_telegram_miniapp) : sorted;
        const q = searchQuery.trim().toLowerCase();
        if (!q) return base;
        return base.filter(req =>
            [String(req.id), req.equipment_name, req.address, req.comment ?? '', req.status_label, req.initiator_name ?? '', req.initiator_phone ?? '', req.driver_name ?? '', req.driver_phone ?? '', req.source_label ?? '']
                .join(' ').toLowerCase().includes(q)
        );
    }, [searchQuery, sorted, telegramOnly]);

    const stats = useMemo(() => {
        const active    = requests.filter(r => !['completed', 'returned'].includes(r.status)).length;
        const completed = requests.filter(r => r.status === 'completed').length;
        return [
            { label: 'Всего заявок', value: requests.length, color: 'text-[#1A1A1A]', bg: 'bg-white' },
            { label: 'В работе',     value: active,          color: 'text-red-600',    bg: 'bg-red-50' },
            { label: 'Выполнено',    value: completed,       color: 'text-green-700',  bg: 'bg-green-50' },
        ];
    }, [requests]);

    const showToast = (msg: string) => {
        setToast(msg);
        window.setTimeout(() => setToast(''), 2500);
    };

    const openCreateModal = () => {
        setEditingRequest(null);
        setModalOpen(true);
    };

    const openEditModal = (request: SpectechRequestData) => {
        setEditingRequest(request);
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditingRequest(null);
    };

    const handleSaved = async (savedRequest?: SpectechRequestData) => {
        const wasEditing = editingRequest !== null;

        if (savedRequest) {
            setRequests((prev) => {
                const exists = prev.some((item) => item.id === savedRequest.id);

                return exists
                    ? prev.map((item) => item.id === savedRequest.id ? savedRequest : item)
                    : [savedRequest, ...prev];
            });
            setExpandedId(savedRequest.id);
        }

        showToast(wasEditing ? 'Заявка обновлена' : 'Заявка успешно создана');
        closeModal();
        fetchRequests();
    };

    const openCancelModal = (req: SpectechRequestData) => {
        setCancellingRequest(req);
        setCancelModalOpen(true);
    };

    const handleCancel = async (reason: string) => {
        if (!cancellingRequest) return;
        setCancelLoading(true);
        try {
            const res = await axios.patch(`/spectech/api/requests/${cancellingRequest.id}/cancel`, { reason });
            const updated = res.data?.data;
            if (updated) {
                setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
            }
            showToast('Заявка отменена');
            setCancelModalOpen(false);
            setCancellingRequest(null);
        } catch (err: any) {
            showToast(err.response?.data?.message ?? 'Ошибка при отмене');
        } finally {
            setCancelLoading(false);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Мои заявки" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">

                {/* ── Хедер ── */}
                <section className="rounded-xl border border-[#E8E8E8] bg-gradient-to-r from-white to-[#FFF8F8] px-5 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-0.5">
                                <ClipboardList className="h-5 w-5 text-red-600" />
                                <h1 className="text-[14px] font-semibold text-[#1A1A1A]">Заявки на спецтехнику</h1>
                            </div>
                            <p className="text-[12px] text-[#6B6B6B]">Следите за статусами, ищите по любому полю.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={fetchRequests} disabled={loading}>
                                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            </Button>
                            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={openCreateModal}>
                                <Plus className="h-4 w-4 mr-1" />
                                Новая заявка
                            </Button>
                        </div>
                    </div>
                </section>

                {/* ── Статистика ── */}
                <div className="grid grid-cols-3 gap-3">
                    {stats.map(s => (
                        <div key={s.label} className={`rounded-xl border border-[#E8E8E8] ${s.bg} p-3`}>
                            <div className="text-[11px] text-[#888] mb-1">{s.label}</div>
                            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                        </div>
                    ))}
                </div>

                {/* ── Toast ── */}
                {toast && (
                    <div className="fixed bottom-4 right-4 z-50 rounded-md border border-[#E8E8E8] bg-white shadow-lg px-4 py-2.5 text-[13px] text-[#1A1A1A]">
                        {toast}
                    </div>
                )}

                {/* ── Поиск и фильтры ── */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative flex-1 max-w-sm">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Поиск по ID, технике, адресу…"
                            className="h-9 w-full rounded-lg border border-[#E0E0E0] bg-white pl-9 pr-3 text-sm outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                        />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            onClick={() => setTelegramOnly((current) => !current)}
                            className={`px-3 h-7 rounded-full text-xs font-medium border transition-colors ${
                                telegramOnly
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'border-[#E0E0E0] bg-white text-[#555] hover:bg-[#F5F5F5]'
                            }`}
                        >
                            Telegram Mini App
                        </button>
                        {STATUS_FILTERS.map(f => (
                            <button
                                key={f.value}
                                onClick={() => setStatusFilter(f.value)}
                                className={`px-3 h-7 rounded-full text-xs font-medium border transition-colors ${
                                    statusFilter === f.value
                                        ? 'bg-red-600 border-red-600 text-white'
                                        : 'border-[#E0E0E0] bg-white text-[#555] hover:bg-[#F5F5F5]'
                                }`}
                            >
                                {f.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Контент ── */}
                {loading && (
                    <div className="flex items-center justify-center py-16 text-sm text-[#888]">
                        <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Загрузка...
                    </div>
                )}

                {!loading && visible.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 gap-3 text-[#AAA]">
                        <ClipboardList className="h-12 w-12 opacity-30" />
                        <p className="text-sm">
                            {searchQuery ? 'Ничего не найдено.' : 'Заявок пока нет. Создайте первую!'}
                        </p>
                    </div>
                )}

                {!loading && visible.length > 0 && (
                    <div className="flex flex-col gap-3">
                        {visible.map(req => (
                            <RequestItem
                                key={req.id}
                                req={req}
                                expanded={expandedId === req.id}
                                onToggle={() => setExpandedId(expandedId === req.id ? null : req.id)}
                                onEdit={() => openEditModal(req)}
                                onCancel={() => openCancelModal(req)}
                            />
                        ))}
                    </div>
                )}

                {/* ── Модалы ── */}
                <NewRequestModal
                    open={modalOpen}
                    onClose={closeModal}
                    onSaved={handleSaved}
                    initialRequest={editingRequest}
                />
                <CancelModal
                    open={cancelModalOpen}
                    onClose={() => { setCancelModalOpen(false); setCancellingRequest(null); }}
                    onConfirm={handleCancel}
                    loading={cancelLoading}
                />
            </div>
        </AppLayout>
    );
}
