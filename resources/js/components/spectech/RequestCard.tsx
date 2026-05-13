import PhotoGallery from '@/components/spectech/PhotoGallery';
import { Calendar, MapPin, Truck, User } from 'lucide-react';
import React from 'react';

export interface SpectechRequestData {
    id: number;
    equipment_id: number;
    equipment_name: string;
    plate_number?: string;
    start_date: string;
    end_date: string;
    requested_start?: string;
    requested_end?: string;
    terminal: string;
    zone: string;
    gate?: string;
    address: string;
    comment?: string;
    status: string;
    status_label: string;
    status_frozen?: boolean;
    status_frozen_reason?: string | null;
    effective_end_at?: string | null;
    photos: string[];
    timeline: { title: string; time: string | null }[];
    client_name?: string;
    schedule_id?: number | null;
    from_scheduling?: boolean;
    created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800 border-blue-200',
    departure: 'bg-orange-100 text-orange-800 border-orange-200',
    on_location: 'bg-purple-100 text-purple-800 border-purple-200',
    work_started: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    completed: 'bg-green-100 text-green-800 border-green-200',
    returned: 'bg-gray-100 text-gray-600 border-gray-200',
};

interface Props {
    request: SpectechRequestData;
    onStatusChange?: (id: number, status: string) => void;
    isOperator?: boolean;
}

const NEXT_STATUS: Record<string, { value: string; label: string }> = {
    new: { value: 'departure', label: 'Отправить в выезд' },
    departure: { value: 'on_location', label: 'Прибыл на объект' },
    on_location: { value: 'work_started', label: 'Начать работы' },
    work_started: { value: 'completed', label: 'Завершить работы' },
    completed: { value: 'returned', label: 'Техника вернулась' },
};

const RequestCard: React.FC<Props> = ({ request, onStatusChange, isOperator }) => {
    const colorClass = STATUS_COLORS[request.status] ?? 'bg-gray-100 text-gray-600';
    const next = NEXT_STATUS[request.status];

    return (
        <div className="border-border bg-card flex flex-col gap-3 rounded-lg border p-4 shadow-sm transition-shadow hover:shadow-md">
            {/* Заголовок */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <Truck className="h-4 w-4 shrink-0 text-red-600" />
                    <span className="truncate text-sm font-semibold">{request.equipment_name}</span>
                    {request.plate_number && <span className="text-muted-foreground shrink-0 text-xs">({request.plate_number})</span>}
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${colorClass}`}>{request.status_label}</span>
            </div>

            {request.status_frozen && (
                <div className="inline-flex w-fit items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    Заморожено
                </div>
            )}

            {/* Основная инфо */}
            <div className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                        {request.requested_start && request.requested_end
                            ? `${new Date(request.requested_start).toLocaleString('ru-RU')} — ${new Date(request.requested_end).toLocaleString('ru-RU')}`
                            : `${request.start_date} — ${request.end_date}`}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">
                        {request.terminal} / {request.zone}
                    </span>
                </div>
                {request.client_name && (
                    <div className="col-span-2 flex items-center gap-1">
                        <User className="h-3 w-3" />
                        <span>{request.client_name}</span>
                    </div>
                )}
                {request.comment && <div className="text-muted-foreground col-span-2 truncate text-xs italic">{request.comment}</div>}
            </div>

            {/* Timeline */}
            {request.timeline && request.timeline.length > 0 && (
                <div className="flex gap-1 overflow-x-auto pb-1">
                    {request.timeline.map((step, i) => (
                        <div key={i} className="flex min-w-fit flex-col items-center gap-0.5">
                            <div className={`h-2 w-2 rounded-full ${step.time ? 'bg-red-600' : 'bg-gray-200'}`} />
                            <span className="text-muted-foreground text-[10px] whitespace-nowrap">{step.title}</span>
                            {step.time && (
                                <span className="text-muted-foreground text-[9px]">
                                    {new Date(step.time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Фото */}
            <PhotoGallery photos={request.photos ?? []} compact />

            {/* Кнопка смены статуса (только оператор) */}
            {isOperator && next && (
                <button
                    onClick={() => onStatusChange?.(request.id, next.value)}
                    className="mt-1 h-8 w-full rounded-md bg-red-600 text-xs font-medium text-white transition-colors hover:bg-red-700"
                >
                    {next.label}
                </button>
            )}
        </div>
    );
};

export default RequestCard;
