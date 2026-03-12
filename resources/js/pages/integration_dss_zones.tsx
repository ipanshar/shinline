import React, { useEffect, useState } from "react";
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import axios from "axios";
import { Plus, Edit, MapPin, Pencil, X } from 'lucide-react';
import { MapContainer, TileLayer, Polygon, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Фикс иконок Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Зоны',
        href: '/integration_dss/zones',
    },
];

interface Zone {
    id: number;
    name: string;
    yard_id: number;
    yard_name?: string;
    center_lat?: number | null;
    center_lng?: number | null;
    polygon?: [number, number][] | null;
    color?: string;
}

interface Yard {
    id: number;
    name: string;
}

// Предопределённые цвета для зон
const ZONE_COLORS = [
    '#3388ff', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4',
    '#ffeaa7', '#dfe6e9', '#fd79a8', '#a29bfe', '#00b894',
];

// Компонент для рисования полигона на карте
function PolygonDrawer({ 
    polygon, 
    setPolygon, 
    isDrawing, 
    color 
}: { 
    polygon: [number, number][]; 
    setPolygon: (p: [number, number][]) => void;
    isDrawing: boolean;
    color: string;
}) {
    useMapEvents({
        click(e) {
            if (isDrawing) {
                setPolygon([...polygon, [e.latlng.lat, e.latlng.lng]]);
            }
        },
    });

    return (
        <>
            {polygon.length > 0 && (
                <Polygon 
                    positions={polygon} 
                    pathOptions={{ 
                        color: color, 
                        fillColor: color, 
                        fillOpacity: 0.3,
                        weight: 2,
                    }} 
                />
            )}
            {isDrawing && polygon.map((point, index) => (
                <Marker 
                    key={index} 
                    position={point}
                    eventHandlers={{
                        click: () => {
                            const newPolygon = polygon.filter((_, i) => i !== index);
                            setPolygon(newPolygon);
                        }
                    }}
                />
            ))}
        </>
    );
}

// Компонент для подгонки карты под все зоны
function FitBoundsToZones({ zones }: { zones: Zone[] }) {
    const map = useMap();
    
    useEffect(() => {
        const allPoints: [number, number][] = [];
        zones.forEach(zone => {
            if (zone.polygon) {
                allPoints.push(...zone.polygon);
            } else if (zone.center_lat && zone.center_lng) {
                allPoints.push([zone.center_lat, zone.center_lng]);
            }
        });

        if (allPoints.length > 0) {
            const lats = allPoints.map(p => p[0]);
            const lngs = allPoints.map(p => p[1]);
            const bounds: [[number, number], [number, number]] = [
                [Math.min(...lats), Math.min(...lngs)],
                [Math.max(...lats), Math.max(...lngs)]
            ];
            map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
        }
    }, [zones, map]);

    return null;
}

export default function Integration_dss_zones() {
    const [zones, setZones] = useState<Zone[]>([]);
    const [yards, setYards] = useState<Yard[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDrawing, setIsDrawing] = useState(false);
    const [formData, setFormData] = useState({
        id: null as number | null,
        name: '',
        yard_id: '',
        center_lat: '',
        center_lng: '',
        polygon: [] as [number, number][],
        color: '#3388ff',
    });

    const fetchYards = () => {
        axios.post("/yard/getyards")
            .then(response => {
                if (response.data.status) {
                    setYards(response.data.data);
                }
            })
            .catch(error => console.error("Ошибка загрузки дворов:", error));
    };

    const fetchZones = () => {
        setLoading(true);
        axios.post("/zones/getzones")
            .then(response => {
                if (response.data.status) {
                    setZones(response.data.data);
                }
            })
            .catch(error => console.error("Ошибка загрузки зон:", error))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchYards();
        fetchZones();
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.name || !formData.yard_id) {
            alert('Пожалуйста, заполните все поля');
            return;
        }

        let centerLat = formData.center_lat ? parseFloat(formData.center_lat) : null;
        let centerLng = formData.center_lng ? parseFloat(formData.center_lng) : null;
        
        if (formData.polygon.length > 0 && (!centerLat || !centerLng)) {
            const lats = formData.polygon.map(p => p[0]);
            const lngs = formData.polygon.map(p => p[1]);
            centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
            centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
        }

        const payload = {
            id: formData.id,
            name: formData.name,
            yard_id: parseInt(formData.yard_id),
            center_lat: centerLat,
            center_lng: centerLng,
            polygon: formData.polygon.length > 0 ? formData.polygon : null,
            color: formData.color,
        };

        axios.post("/zones/createorupdate", payload)
            .then(response => {
                if (response.data.status) {
                    fetchZones();
                    handleCancel();
                    alert(formData.id ? 'Зона обновлена' : 'Зона создана');
                } else {
                    alert('Ошибка: ' + response.data.message);
                }
            })
            .catch(error => {
                console.error("Ошибка сохранения зоны:", error);
                alert('Ошибка сохранения зоны');
            });
    };

    const handleEdit = (zone: Zone) => {
        setFormData({
            id: zone.id,
            name: zone.name,
            yard_id: zone.yard_id.toString(),
            center_lat: zone.center_lat?.toString() || '',
            center_lng: zone.center_lng?.toString() || '',
            polygon: zone.polygon || [],
            color: zone.color || '#3388ff',
        });
        setIsDrawing(false);
    };

    const handleCancel = () => {
        setFormData({ 
            id: null, 
            name: '', 
            yard_id: '',
            center_lat: '',
            center_lng: '',
            polygon: [],
            color: '#3388ff',
        });
        setIsDrawing(false);
    };

    const handleClearPolygon = () => {
        setFormData({ ...formData, polygon: [], center_lat: '', center_lng: '' });
    };

    const defaultCenter: [number, number] = zones.length > 0 && zones[0].center_lat && zones[0].center_lng
        ? [zones[0].center_lat, zones[0].center_lng]
        : [43.2375, 76.9457];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Зоны DSS" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {formData.id ? 'Редактировать зону' : 'Добавить новую зону'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="yard">Двор</Label>
                                        <Select
                                            value={formData.yard_id}
                                            onValueChange={(value) => setFormData({ ...formData, yard_id: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Выберите двор" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {yards.map((yard) => (
                                                    <SelectItem key={yard.id} value={yard.id.toString()}>
                                                        {yard.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="name">Название зоны</Label>
                                        <Input
                                            id="name"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="Введите название зоны"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="color">Цвет зоны</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                id="color"
                                                type="color"
                                                value={formData.color}
                                                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                                                className="w-16 h-10 p-1 cursor-pointer"
                                            />
                                            <div className="flex gap-1 flex-wrap">
                                                {ZONE_COLORS.map((c) => (
                                                    <button
                                                        key={c}
                                                        type="button"
                                                        className={`w-6 h-6 rounded border-2 ${formData.color === c ? 'border-gray-800' : 'border-gray-300'}`}
                                                        style={{ backgroundColor: c }}
                                                        onClick={() => setFormData({ ...formData, color: c })}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Label>Границы зоны на карте</Label>
                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={isDrawing ? "default" : "outline"}
                                                onClick={() => setIsDrawing(!isDrawing)}
                                            >
                                                <Pencil className="h-4 w-4 mr-1" />
                                                {isDrawing ? 'Завершить' : 'Рисовать'}
                                            </Button>
                                            {formData.polygon.length > 0 && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={handleClearPolygon}
                                                >
                                                    <X className="h-4 w-4 mr-1" />
                                                    Очистить
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                    {isDrawing && (
                                        <p className="text-sm text-muted-foreground">
                                            Кликайте на карте чтобы добавить точки полигона. Клик на маркер удаляет точку.
                                        </p>
                                    )}
                                    <div className="h-[300px] border rounded-lg overflow-hidden">
                                        <MapContainer
                                            center={defaultCenter}
                                            zoom={15}
                                            style={{ height: '100%', width: '100%' }}
                                        >
                                            <TileLayer
                                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            />
                                            <FitBoundsToZones zones={zones} />
                                            
                                            {zones.filter(z => z.id !== formData.id).map((zone) => (
                                                zone.polygon && (
                                                    <Polygon
                                                        key={zone.id}
                                                        positions={zone.polygon}
                                                        pathOptions={{
                                                            color: zone.color || '#3388ff',
                                                            fillColor: zone.color || '#3388ff',
                                                            fillOpacity: 0.15,
                                                            weight: 1,
                                                            dashArray: '5, 5',
                                                        }}
                                                    />
                                                )
                                            ))}
                                            
                                            <PolygonDrawer
                                                polygon={formData.polygon}
                                                setPolygon={(p) => setFormData({ ...formData, polygon: p })}
                                                isDrawing={isDrawing}
                                                color={formData.color}
                                            />
                                        </MapContainer>
                                    </div>
                                    {formData.polygon.length > 0 && (
                                        <p className="text-sm text-muted-foreground">
                                            Точек в полигоне: {formData.polygon.length}
                                        </p>
                                    )}
                                </div>

                                <div className="flex gap-2">
                                    <Button type="submit" className="bg-red-600 hover:bg-red-700">
                                        <Plus className="h-4 w-4 mr-2" />
                                        {formData.id ? 'Обновить' : 'Добавить'}
                                    </Button>
                                    {formData.id && (
                                        <Button type="button" variant="outline" onClick={handleCancel}>
                                            Отмена
                                        </Button>
                                    )}
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Список зон</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {loading ? (
                                <div className="text-center py-8">Загрузка...</div>
                            ) : zones.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    Зоны не найдены. Добавьте первую зону.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {zones.map((zone) => (
                                        <div
                                            key={zone.id}
                                            className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div 
                                                    className="w-4 h-4 rounded-full border"
                                                    style={{ backgroundColor: zone.color || '#3388ff' }}
                                                />
                                                <div>
                                                    <div className="font-semibold">{zone.name}</div>
                                                    <div className="text-sm text-muted-foreground">
                                                        Двор: {zone.yard_name || yards.find(y => y.id === zone.yard_id)?.name || 'Неизвестно'}
                                                    </div>
                                                    {zone.polygon && zone.polygon.length > 0 ? (
                                                        <div className="text-xs text-green-600 flex items-center gap-1 mt-1">
                                                            <MapPin className="h-3 w-3" />
                                                            Координаты заданы ({zone.polygon.length} точек)
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-orange-500 mt-1">
                                                            ⚠️ Координаты не заданы
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleEdit(zone)}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </AppLayout>
    );
}
