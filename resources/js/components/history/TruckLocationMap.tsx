import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { MapPin, Navigation, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MapContainer, TileLayer, Polygon, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Фикс для иконок Leaflet в webpack/vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Кастомная иконка для грузовика
const truckIcon = new L.DivIcon({
    html: `<div style="
        background: #ef4444;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 16px;
    ">🚛</div>`,
    className: 'truck-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
});

interface Zone {
    id: number;
    name: string;
    yard_name?: string;
    center_lat: number | null;
    center_lng: number | null;
    polygon: [number, number][] | null;
    color: string;
}

interface TruckInfo {
    id: number;
    name?: string;
    plate_number: string;
    truck_brand_name?: string;
    truck_model_name?: string;
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

// Функция форматирования времени пребывания
function formatDuration(minutes: number): string {
    if (minutes < 60) {
        return `${minutes} мин`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours < 24) {
        return mins > 0 ? `${hours} ч ${mins} мин` : `${hours} ч`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (remainingHours > 0) {
        return `${days} д ${remainingHours} ч`;
    }
    return `${days} д`;
}

// Функция открытия в навигаторе
function openInNavigator(lat: number, lng: number, service: 'google' | 'yandex' | '2gis' | 'apple') {
    const urls = {
        google: `https://www.google.com/maps?q=${lat},${lng}`,
        yandex: `https://yandex.ru/maps/?pt=${lng},${lat}&z=17`,
        '2gis': `https://2gis.kz/geo/${lng},${lat}?m=${lng},${lat}/17`,
        apple: `https://maps.apple.com/?ll=${lat},${lng}&z=17`,
    };
    window.open(urls[service], '_blank');
}

// Компонент для центрирования карты
function MapCenterController({ center, zoom }: { center: [number, number] | null; zoom?: number }) {
    const map = useMap();
    
    useEffect(() => {
        if (center) {
            map.flyTo(center, zoom || map.getZoom(), { duration: 0.5 });
        }
    }, [center, zoom, map]);
    
    return null;
}

// Компонент для подстройки карты под границы всех зон
function FitBoundsController({ bounds }: { bounds: [[number, number], [number, number]] | null }) {
    const map = useMap();
    
    useEffect(() => {
        if (bounds) {
            map.fitBounds(bounds, { padding: [20, 20], maxZoom: 17 });
        }
    }, [bounds, map]);
    
    return null;
}

export default function TruckLocationMap({ truckId }: TruckLocationMapProps) {
    const [zones, setZones] = useState<Zone[]>([]);
    const [truckInfo, setTruckInfo] = useState<TruckInfo | null>(null);
    const [currentZone, setCurrentZone] = useState<CurrentZone | null>(null);
    const [loading, setLoading] = useState(false);
    const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
    
    // Вычисляем центр и границы на основе всех зон
    const { defaultCenter, bounds } = useMemo(() => {
        if (!zones.length) {
            // Fallback если зон нет
            return { defaultCenter: [43.2375, 76.9457] as [number, number], bounds: null };
        }

        // Собираем все точки из всех полигонов
        const allPoints: [number, number][] = [];
        zones.forEach(zone => {
            if (zone.polygon) {
                allPoints.push(...zone.polygon);
            } else if (zone.center_lat && zone.center_lng) {
                allPoints.push([zone.center_lat, zone.center_lng]);
            }
        });

        if (!allPoints.length) {
            return { defaultCenter: [43.2375, 76.9457] as [number, number], bounds: null };
        }

        // Вычисляем границы
        const lats = allPoints.map(p => p[0]);
        const lngs = allPoints.map(p => p[1]);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);

        // Центр - среднее всех точек
        const centerLat = (minLat + maxLat) / 2;
        const centerLng = (minLng + maxLng) / 2;

        return {
            defaultCenter: [centerLat, centerLng] as [number, number],
            bounds: [[minLat, minLng], [maxLat, maxLng]] as [[number, number], [number, number]]
        };
    }, [zones]);

    const defaultZoom = 15;

    // Загрузка зон
    useEffect(() => {
        fetchZones();
    }, []);

    // Загрузка данных грузовика
    useEffect(() => {
        if (truckId) {
            fetchTruckInfo();
            fetchCurrentZone();
        } else {
            setTruckInfo(null);
            setCurrentZone(null);
            setMapCenter(null);
        }
    }, [truckId]);

    // Центрирование на текущей зоне грузовика
    useEffect(() => {
        if (currentZone && zones.length > 0) {
            const zone = zones.find(z => z.id === currentZone.zone_id);
            if (zone && zone.center_lat && zone.center_lng) {
                setMapCenter([zone.center_lat, zone.center_lng]);
            }
        }
    }, [currentZone, zones]);

    const fetchZones = async () => {
        try {
            const response = await axios.post('/zones/getzonesformap');
            if (response.data.status) {
                setZones(response.data.data);
            }
        } catch (error) {
            console.error('Ошибка загрузки зон:', error);
        }
    };

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

    // Позиция грузовика (центр текущей зоны)
    const truckPosition = useMemo(() => {
        if (!currentZone || !zones.length) return null;
        const zone = zones.find(z => z.id === currentZone.zone_id);
        if (zone && zone.center_lat && zone.center_lng) {
            return [zone.center_lat, zone.center_lng] as [number, number];
        }
        return null;
    }, [currentZone, zones]);

    if (!truckId) {
        return (
            <div className="h-full flex flex-col">
                <div className="p-4 border-b bg-card">
                    <h3 className="font-semibold">📍 Карта территории</h3>
                </div>
                <div className="flex-1 relative">
                    <MapContainer
                        center={defaultCenter}
                        zoom={defaultZoom}
                        style={{ height: '100%', width: '100%' }}
                        className="z-0"
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        
                        {/* Автоматическая подстройка под все зоны */}
                        <FitBoundsController bounds={bounds} />
                        
                        {/* Отображение всех зон */}
                        {zones.map((zone) => (
                            zone.polygon && (
                                <Polygon
                                    key={zone.id}
                                    positions={zone.polygon}
                                    pathOptions={{
                                        color: zone.color || '#3388ff',
                                        fillColor: zone.color || '#3388ff',
                                        fillOpacity: 0.2,
                                        weight: 2,
                                    }}
                                >
                                    <Tooltip permanent direction="center">
                                        {zone.name}
                                    </Tooltip>
                                </Polygon>
                            )
                        ))}
                    </MapContainer>
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-10">
                        <div className="bg-card p-4 rounded-lg shadow-lg text-center">
                            <Navigation className="mx-auto h-8 w-8 mb-2 text-muted-foreground" />
                            <p className="text-sm">Выберите грузовик для отслеживания</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center bg-muted/20">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Загрузка...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Информация о грузовике */}
            <div className="p-3 border-b bg-card">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-primary" />
                        <div>
                            <span className="font-semibold">{truckInfo?.plate_number}</span>
                            {truckInfo?.truck_brand_name && (
                                <span className="text-sm text-muted-foreground ml-2">
                                    {truckInfo.truck_brand_name} {truckInfo.truck_model_name}
                                </span>
                            )}
                        </div>
                    </div>
                    {currentZone && (
                        <div className="flex items-center gap-2 bg-primary/10 px-3 py-1 rounded-full">
                            <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                            <span className="text-sm font-medium">{currentZone.zone_name}</span>
                        </div>
                    )}
                </div>
            </div>
            
            {/* Карта */}
            <div className="flex-1 relative">
                <MapContainer
                    center={truckPosition || defaultCenter}
                    zoom={defaultZoom}
                    style={{ height: '100%', width: '100%' }}
                    className="z-0"
                >
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    
                    {/* Контроллер центрирования */}
                    <MapCenterController center={mapCenter} zoom={17} />
                    
                    {/* Отображение всех зон */}
                    {zones.map((zone) => (
                        zone.polygon && (
                            <Polygon
                                key={zone.id}
                                positions={zone.polygon}
                                pathOptions={{
                                    color: currentZone?.zone_id === zone.id ? '#ef4444' : (zone.color || '#3388ff'),
                                    fillColor: currentZone?.zone_id === zone.id ? '#ef4444' : (zone.color || '#3388ff'),
                                    fillOpacity: currentZone?.zone_id === zone.id ? 0.4 : 0.2,
                                    weight: currentZone?.zone_id === zone.id ? 3 : 2,
                                }}
                            >
                                <Tooltip direction="center">
                                    {zone.name}
                                </Tooltip>
                                <Popup>
                                    <div className="text-sm">
                                        <strong>{zone.name}</strong>
                                        {zone.yard_name && <p className="text-muted-foreground">{zone.yard_name}</p>}
                                    </div>
                                </Popup>
                            </Polygon>
                        )
                    ))}
                    
                    {/* Маркер грузовика */}
                    {truckPosition && (
                        <Marker position={truckPosition} icon={truckIcon}>
                            <Popup>
                                <div className="text-sm">
                                    <strong>🚛 {truckInfo?.plate_number}</strong>
                                    {currentZone && (
                                        <>
                                            <p className="mt-1">Зона: <strong>{currentZone.zone_name}</strong></p>
                                            <p>В зоне: {formatDuration(currentZone.duration_minutes)}</p>
                                            <p className="text-xs text-muted-foreground">
                                                Вход: {new Date(currentZone.entry_time).toLocaleString('ru-RU')}
                                            </p>
                                        </>
                                    )}
                                </div>
                            </Popup>
                        </Marker>
                    )}
                </MapContainer>
                
                {/* Информация о текущей зоне */}
                {currentZone && truckPosition && (
                    <div className="absolute bottom-4 left-4 right-4 bg-card/95 backdrop-blur border rounded-lg p-3 z-[1000]">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground">Текущая зона</p>
                                <p className="font-semibold">{currentZone.zone_name}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Вход: {new Date(currentZone.entry_time).toLocaleString('ru-RU')}
                                </p>
                            </div>
                            <div className="text-center">
                                <p className="text-xs text-muted-foreground">В зоне</p>
                                <p className="font-semibold text-lg">{formatDuration(currentZone.duration_minutes)}</p>
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="outline" className="gap-1">
                                        <ExternalLink className="h-4 w-4" />
                                        Открыть
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="z-[1100]">
                                    <DropdownMenuItem onClick={() => openInNavigator(truckPosition[0], truckPosition[1], 'google')}>
                                        🗺️ Google Maps
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openInNavigator(truckPosition[0], truckPosition[1], 'yandex')}>
                                        🟡 Яндекс Карты
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openInNavigator(truckPosition[0], truckPosition[1], '2gis')}>
                                        🟢 2ГИС
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openInNavigator(truckPosition[0], truckPosition[1], 'apple')}>
                                        🍎 Apple Maps
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                )}
                
                {/* Сообщение если грузовик не в зоне */}
                {!currentZone && !loading && (
                    <div className="absolute bottom-4 left-4 right-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 z-[1000]">
                        <p className="text-sm text-yellow-800">
                            ⚠️ Грузовик не находится ни в одной зоне
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
