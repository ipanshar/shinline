import { useState, useEffect } from 'react';
import axios from 'axios';
import { MapPin, Navigation } from 'lucide-react';

interface TruckInfo {
    id: number;
    name?: string;
    plate_number: string;
    truck_brand_name?: string;
    truck_model_name?: string;
    last_location?: string;
    last_seen?: string;
}

interface CurrentZone {
    zone_id: number;
    zone_name: string;
    device_name: string;
    entry_time: string;
    duration_minutes: number;
}

interface TruckLocationMapProps {
    truckId: number | null;
}

export default function TruckLocationMap({ truckId }: TruckLocationMapProps) {
    const [truckInfo, setTruckInfo] = useState<TruckInfo | null>(null);
    const [currentZone, setCurrentZone] = useState<CurrentZone | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (truckId) {
            fetchTruckInfo();
            fetchCurrentZone();
        } else {
            setTruckInfo(null);
            setCurrentZone(null);
        }
    }, [truckId]);

    const fetchTruckInfo = async () => {
        setLoading(true);
        try {
            const response = await axios.post('/trucs/gettrucks', {
                truck_id: truckId
            });
            if (response.data.data && response.data.data.length > 0) {
                setTruckInfo(response.data.data[0]);
            }
        } catch (error) {
            console.error('Ошибка загрузки информации о грузовике:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchCurrentZone = async () => {
        try {
            const response = await axios.post('/dss/current-truck-zone', {
                truck_id: truckId
            });
            if (response.data.status && response.data.data) {
                setCurrentZone(response.data.data);
            } else {
                setCurrentZone(null);
            }
        } catch (error) {
            console.error('Ошибка загрузки текущей зоны:', error);
            setCurrentZone(null);
        }
    };

    if (!truckId) {
        return (
            <div className="h-full flex items-center justify-center bg-muted/20 rounded-lg">
                <div className="text-center text-muted-foreground">
                    <Navigation className="mx-auto h-16 w-16 mb-4 opacity-50" />
                    <p className="text-lg">Выберите грузовик для отображения местоположения</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center bg-muted/20 rounded-lg">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Загрузка...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-muted/20 rounded-lg overflow-hidden">
            {/* Информация о грузовике */}
            {truckInfo && (
                <div className="bg-card border-b p-4">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <MapPin className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-semibold text-lg">{truckInfo.plate_number}</h3>
                            <p className="text-sm text-muted-foreground">
                                {truckInfo.truck_brand_name} {truckInfo.truck_model_name}
                            </p>
                            {truckInfo.last_location && (
                                <p className="text-xs text-muted-foreground mt-1">
                                    Последнее местоположение: {truckInfo.last_location}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            {/* Заглушка для карты */}
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center text-muted-foreground">
                    <div className="w-full h-64 bg-muted/50 rounded-lg flex items-center justify-center mb-4">
                        <div className="text-center">
                            <MapPin className="mx-auto h-16 w-16 mb-2 opacity-30" />
                            <p className="text-sm">Карта будет здесь</p>
                            <p className="text-xs mt-1">Интеграция с картами в разработке</p>
                        </div>
                    </div>
                    {currentZone ? (
                        <div className="bg-primary/10 border border-primary/20 p-4 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                                <p className="font-semibold text-primary">Текущая зона</p>
                            </div>
                            <h3 className="text-xl font-bold mb-2">{currentZone.zone_name}</h3>
                            <div className="space-y-1 text-sm">
                                <p className="text-muted-foreground">
                                    Устройство: <span className="font-medium text-foreground">{currentZone.device_name}</span>
                                </p>
                                <p className="text-muted-foreground">
                                    В зоне: <span className="font-medium text-foreground">{currentZone.duration_minutes} мин</span>
                                </p>
                                <p className="text-muted-foreground">
                                    Вход: <span className="font-medium text-foreground">
                                        {new Date(currentZone.entry_time).toLocaleString('ru-RU')}
                                    </span>
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-muted/50 p-4 rounded-lg text-center">
                            <p className="text-muted-foreground">Грузовик не находится ни в одной зоне</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
