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

interface TruckLocationMapProps {
    truckId: number | null;
}

export default function TruckLocationMap({ truckId }: TruckLocationMapProps) {
    const [truckInfo, setTruckInfo] = useState<TruckInfo | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (truckId) {
            fetchTruckInfo();
        } else {
            setTruckInfo(null);
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

    if (!truckId) {
        return (
            <div className="h-full flex items-center justify-center bg-muted/20 rounded-lg">
                <div className="text-center text-muted-foreground">
                    <Navigation className="mx-auto h-16 w-16 mb-4 opacity-50" />
                    <p className="text-lg">Выберите задачу для отображения местоположения</p>
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
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-card p-3 rounded-lg border">
                            <p className="text-muted-foreground mb-1">Текущий статус</p>
                            <p className="font-medium">В пути</p>
                        </div>
                        <div className="bg-card p-3 rounded-lg border">
                            <p className="text-muted-foreground mb-1">Последняя активность</p>
                            <p className="font-medium">Сегодня</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
