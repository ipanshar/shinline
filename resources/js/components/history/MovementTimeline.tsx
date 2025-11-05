import { useState, useEffect } from 'react';
import axios from 'axios';
import { MapPin, Clock, Camera } from 'lucide-react';

interface ZoneHistoryItem {
    id: number;
    truck_id: number;
    zone_id: number;
    zone_name: string;
    device_id: number;
    device_name: string;
    device_type: string;
    task_id?: number;
    task_name?: string;
    entry_time: string;
    exit_time?: string;
    duration?: number;
    created_at: string;
}

interface MovementTimelineProps {
    truckId: number | null;
}

export default function MovementTimeline({ truckId }: MovementTimelineProps) {
    const [history, setHistory] = useState<ZoneHistoryItem[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (truckId) {
            fetchHistory();
        } else {
            setHistory([]);
        }
    }, [truckId]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const response = await axios.post('/dss/truck-zone-history', {
                truck_id: truckId
            });
            if (response.data.status) {
                setHistory(response.data.data);
            }
        } catch (error) {
            console.error('Ошибка загрузки истории:', error);
            setHistory([]);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        try {
            const date = new Date(dateString);
            return date.toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return dateString;
        }
    };

    if (!truckId) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                    <MapPin className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>Выберите грузовик для просмотра истории</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Загрузка истории...</p>
                </div>
            </div>
        );
    }

    if (history.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                    <Camera className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>История передвижений пуста</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto p-4 space-y-4">
            <h3 className="text-lg font-semibold mb-4">История передвижений</h3>
            <div className="relative space-y-6">
                {/* Вертикальная линия */}
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border"></div>
                
                {history.map((item, index) => (
                    <div key={item.id} className="relative flex gap-4">
                        {/* Точка на timeline */}
                        <div className="relative flex-shrink-0">
                            <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center z-10 ${
                                !item.exit_time 
                                    ? 'bg-primary/20 border-primary animate-pulse' 
                                    : 'bg-primary/10 border-primary'
                            }`}>
                                <MapPin className="h-5 w-5 text-primary" />
                            </div>
                        </div>
                        
                        {/* Контент */}
                        <div className="flex-1 bg-card border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h4 className="font-semibold text-lg">{item.zone_name}</h4>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        {item.device_name} • {item.device_type === 'Entry' ? '🟢 Вход' : '🔴 Выход'}
                                    </p>
                                    {item.task_name && (
                                        <p className="text-xs text-muted-foreground mt-1">
                                            📋 Задача: {item.task_name}
                                        </p>
                                    )}
                                </div>
                                {!item.exit_time && (
                                    <span className="px-2 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">
                                        Сейчас здесь
                                    </span>
                                )}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="bg-muted/50 p-3 rounded-lg">
                                    <span className="text-muted-foreground block text-xs mb-1">⏰ Время входа</span>
                                    <span className="font-medium">{formatDate(item.entry_time)}</span>
                                </div>
                                {item.exit_time ? (
                                    <div className="bg-muted/50 p-3 rounded-lg">
                                        <span className="text-muted-foreground block text-xs mb-1">⏱️ Время выхода</span>
                                        <span className="font-medium">{formatDate(item.exit_time)}</span>
                                    </div>
                                ) : (
                                    <div className="bg-primary/10 p-3 rounded-lg border border-primary/20">
                                        <span className="text-primary block text-xs mb-1">📍 Статус</span>
                                        <span className="font-medium text-primary">В зоне</span>
                                    </div>
                                )}
                            </div>
                            
                            {item.duration && (
                                <div className="mt-3 pt-3 border-t">
                                    <span className="text-muted-foreground text-sm">⏳ Длительность пребывания:</span>
                                    <span className="ml-2 font-semibold text-primary">{item.duration} мин</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
