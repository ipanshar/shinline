import { useState, useEffect } from 'react';
import axios from 'axios';
import { MapPin, Clock, Camera } from 'lucide-react';

interface VehicleCapture {
    id: number;
    devaice_id: number;
    truck_id: number;
    plateNo: string;
    capturePicture: string;
    plateNoPicture: string;
    vehicleBrandName: string;
    captureTime: string;
    vehicleColorName: string;
    vehicleModelName: string;
    local_capturePicture?: string;
    device_name?: string;
}

interface MovementTimelineProps {
    truckId: number | null;
}

export default function MovementTimeline({ truckId }: MovementTimelineProps) {
    const [captures, setCaptures] = useState<VehicleCapture[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (truckId) {
            fetchCaptures();
        } else {
            setCaptures([]);
        }
    }, [truckId]);

    const fetchCaptures = async () => {
        setLoading(true);
        try {
            // Здесь нужно будет создать API endpoint для получения истории
            // Пока используем заглушку
            const response = await axios.post('/api/vehicle-captures', {
                truck_id: truckId
            });
            if (response.data.status) {
                setCaptures(response.data.data);
            }
        } catch (error) {
            console.error('Ошибка загрузки истории:', error);
            setCaptures([]);
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
                    <p>Выберите задачу для просмотра истории передвижений</p>
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

    if (captures.length === 0) {
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
                
                {captures.map((capture, index) => (
                    <div key={capture.id} className="relative flex gap-4">
                        {/* Точка на timeline */}
                        <div className="relative flex-shrink-0">
                            <div className="w-12 h-12 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center z-10">
                                <MapPin className="h-5 w-5 text-primary" />
                            </div>
                        </div>
                        
                        {/* Контент */}
                        <div className="flex-1 bg-card border rounded-lg p-4 shadow-sm">
                            <div className="flex items-start justify-between mb-2">
                                <div>
                                    <h4 className="font-medium">{capture.device_name || `Устройство #${capture.devaice_id}`}</h4>
                                    <p className="text-sm text-muted-foreground">
                                        {capture.vehicleBrandName} {capture.vehicleModelName}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    {formatDate(capture.captureTime)}
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                    <span className="text-muted-foreground">Номер:</span>
                                    <span className="ml-2 font-medium">{capture.plateNo}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground">Цвет:</span>
                                    <span className="ml-2">{capture.vehicleColorName}</span>
                                </div>
                            </div>
                            
                            {capture.local_capturePicture && (
                                <div className="mt-3">
                                    <img 
                                        src={capture.local_capturePicture} 
                                        alt="Захват транспорта"
                                        className="w-full h-32 object-cover rounded-md"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
