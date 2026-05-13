import React from 'react';
import { Truck, Calendar, MapPin, User } from 'lucide-react';
import PhotoGallery from '@/components/spectech/PhotoGallery';

export interface SpectechRequestData {
    id: number;
    equipment_id: number;
    equipment_name: string;
    plate_number?: string;
    driver_name?: string;
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
    photos: string[];
    timeline: { title: string; time: string | null }[];
    client_name?: string;
    is_telegram_miniapp?: boolean;
    source_label?: string;
    schedule_id?: number | null;
    from_scheduling?: boolean;
    created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
    new:          'bg-blue-100 text-blue-800 border-blue-200',
    departure:    'bg-orange-100 text-orange-800 border-orange-200',
    on_location:  'bg-purple-100 text-purple-800 border-purple-200',
    work_started: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    completed:    'bg-green-100 text-green-800 border-green-200',
    returned:     'bg-gray-100 text-gray-600 border-gray-200',
};

interface Props {
    request: SpectechRequestData;
    onStatusChange?: (id: number, status: string) => void;
    isOperator?: boolean;
}

const NEXT_STATUS: Record<string, { value: string; label: string }> = {
    new:          { value: 'departure',    label: 'Отправить в выезд' },
    departure:    { value: 'on_location',  label: 'Прибыл на объект' },
    on_location:  { value: 'work_started', label: 'Начать работы' },
    work_started: { value: 'completed',    label: 'Завершить работы' },
    completed:    { value: 'returned',     label: 'Техника вернулась' },
};

const RequestCard: React.FC<Props> = ({ request, onStatusChange, isOperator }) => {
    const colorClass = STATUS_COLORS[request.status] ?? 'bg-gray-100 text-gray-600';
    const next = NEXT_STATUS[request.status];

    return (
        <div className="border border-border rounded-lg bg-card shadow-sm hover:shadow-md transition-shadow p-4 flex flex-col gap-3">
            {/* Заголовок */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Truck className="h-4 w-4 text-red-600 shrink-0" />
                    <span className="font-semibold text-sm truncate">{request.equipment_name}</span>
                    {request.plate_number && (
                        <span className="text-xs text-muted-foreground shrink-0">({request.plate_number})</span>
                    )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${colorClass}`}>
                    {request.status_label}
                </span>
            </div>

            {/* Основная инфо */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{request.requested_start && request.requested_end
                        ? `${new Date(request.requested_start).toLocaleString('ru-RU')} — ${new Date(request.requested_end).toLocaleString('ru-RU')}`
                        : `${request.start_date} — ${request.end_date}`}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span className="truncate">{request.terminal} / {request.zone}</span>
                </div>
                {request.client_name && (
                    <div className="flex items-center gap-1 col-span-2">
                        <User className="h-3 w-3" />
                        <span>{request.client_name}</span>
                    </div>
                )}
                {request.driver_name && (
                    <div className="col-span-2 text-xs text-muted-foreground">
                        Водитель: {request.driver_name}
                    </div>
                )}
                {request.source_label && (
                    <div className="col-span-2">
                        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                            {request.source_label}
                        </span>
                    </div>
                )}
                {request.comment && (
                    <div className="col-span-2 text-xs italic text-muted-foreground truncate">
                        {request.comment}
                    </div>
                )}
            </div>

            {/* Timeline */}
            {request.timeline && request.timeline.length > 0 && (
                <div className="flex gap-1 overflow-x-auto pb-1">
                    {request.timeline.map((step, i) => (
                        <div key={i} className="flex flex-col items-center gap-0.5 min-w-fit">
                            <div className={`w-2 h-2 rounded-full ${step.time ? 'bg-red-600' : 'bg-gray-200'}`} />
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{step.title}</span>
                            {step.time && (
                                <span className="text-[9px] text-muted-foreground">
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
                    className="mt-1 w-full h-8 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
                >
                    {next.label}
                </button>
            )}
        </div>
    );
};

export default RequestCard;


