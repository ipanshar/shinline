import React, { useEffect, useState } from "react";
import AppLayout from '@/layouts/app-layout';
import DSSLayout from '@/layouts/dss-layout';
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
import { Plus, Edit, Trash2 } from 'lucide-react';

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
}

interface Yard {
    id: number;
    name: string;
}

export default function Integration_dss_zones() {
    const [zones, setZones] = useState<Zone[]>([]);
    const [yards, setYards] = useState<Yard[]>([]);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({
        id: null as number | null,
        name: '',
        yard_id: '',
    });

    // Загрузка дворов
    const fetchYards = () => {
        axios.post("/yard/getyards")
            .then(response => {
                if (response.data.status) {
                    setYards(response.data.data);
                }
            })
            .catch(error => console.error("Ошибка загрузки дворов:", error));
    };

    // Загрузка зон
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

    // Создание или обновление зоны
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!formData.name || !formData.yard_id) {
            alert('Пожалуйста, заполните все поля');
            return;
        }

        const payload = {
            id: formData.id,
            name: formData.name,
            yard_id: parseInt(formData.yard_id),
        };

        axios.post("/zones/createorupdate", payload)
            .then(response => {
                if (response.data.status) {
                    fetchZones();
                    setFormData({ id: null, name: '', yard_id: '' });
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

    // Редактирование зоны
    const handleEdit = (zone: Zone) => {
        setFormData({
            id: zone.id,
            name: zone.name,
            yard_id: zone.yard_id.toString(),
        });
    };

    // Отмена редактирования
    const handleCancel = () => {
        setFormData({ id: null, name: '', yard_id: '' });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Зоны DSS" />
            <DSSLayout>
                <div className="space-y-6">
                    {/* Форма добавления/редактирования зоны */}
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {formData.id ? 'Редактировать зону' : 'Добавить новую зону'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Выбор двора */}
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

                                    {/* Название зоны */}
                                    <div className="space-y-2">
                                        <Label htmlFor="name">Название зоны</Label>
                                        <Input
                                            id="name"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="Введите название зоны"
                                        />
                                    </div>
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

                    {/* Список зон */}
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
                                            className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                                        >
                                            <div>
                                                <div className="font-semibold text-gray-900">{zone.name}</div>
                                                <div className="text-sm text-gray-500">
                                                    Двор: {zone.yard_name || yards.find(y => y.id === zone.yard_id)?.name || 'Неизвестно'}
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
            </DSSLayout>
        </AppLayout>
    );
}
