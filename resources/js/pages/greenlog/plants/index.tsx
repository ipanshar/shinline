import AppLayout from '@/layouts/app-layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
    createGreenlogPlant,
    deleteGreenlogPlant,
    getGreenlogLocations,
    getGreenlogPlants,
    type GreenlogLocation,
    type GreenlogPlant,
    updateGreenlogPlant,
} from '@/lib/greenlog-api';
import { greenlogMoneyLabel, plantCategoryLabel, plantCostSourceLabel, plantStatusLabel } from '@/lib/greenlog-labels';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { ExternalLink, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Shin Line Flora', href: '/greenlog' },
    { title: 'Растения', href: '/greenlog/plants' },
];

const plantCategories = [
    { value: 'indoor', label: 'Комнатное' },
    { value: 'outdoor', label: 'Уличное' },
];

const plantStatuses = [
    { value: 'active', label: 'Активно' },
    { value: 'alive', label: 'В норме' },
    { value: 'needs_care', label: 'Требует ухода' },
    { value: 'written_off', label: 'Списано' },
];

type PlantForm = {
    inventory_number: string;
    name: string;
    biological_name: string;
    category: string;
    status: string;
    location_id: string;
    quantity: string;
    unit_cost: string;
    watering_frequency_days: string;
    fertilizing_frequency_days: string;
    notes: string;
};

const emptyForm: PlantForm = {
    inventory_number: '',
    name: '',
    biological_name: '',
    category: 'indoor',
    status: 'alive',
    location_id: 'none',
    quantity: '1',
    unit_cost: '',
    watering_frequency_days: '',
    fertilizing_frequency_days: '',
    notes: '',
};

const formatLocationLabel = (location?: Partial<GreenlogLocation> | null) =>
    location?.building || 'Без локации';

const getPlantDisplayName = (plant: GreenlogPlant) => plant.species?.name || plant.name || `Растение #${plant.id}`;

const getStatusVariant = (status: string) => {
    if (status === 'needs_care') {
        return 'secondary';
    }

    if (status === 'written_off') {
        return 'destructive';
    }

    return 'default';
};

export default function GreenLogPlantsIndex() {
    const [plants, setPlants] = useState<GreenlogPlant[]>([]);
    const [locations, setLocations] = useState<GreenlogLocation[]>([]);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('all');
    const [status, setStatus] = useState('all');
    const [locationId, setLocationId] = useState('all');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingPlant, setEditingPlant] = useState<GreenlogPlant | null>(null);
    const [form, setForm] = useState<PlantForm>(emptyForm);

    const loadPlants = async () => {
        try {
            setLoading(true);
            setError(null);

            const [plantsData, locationsData] = await Promise.all([
                getGreenlogPlants({
                    search: search.trim() || undefined,
                    category: category !== 'all' ? category : undefined,
                    status: status !== 'all' ? status : undefined,
                    location_id: locationId !== 'all' ? Number(locationId) : undefined,
                }),
                getGreenlogLocations(),
            ]);

            setPlants(plantsData);
            setLocations(locationsData);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить растения Shin Line Flora.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadPlants();
    }, [search, category, status, locationId]);

    const locationMap = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);

    const resetDialog = () => {
        setEditingPlant(null);
        setForm(emptyForm);
        setIsDialogOpen(false);
    };

    const openCreateDialog = () => {
        setEditingPlant(null);
        setForm(emptyForm);
        setIsDialogOpen(true);
    };

    const openEditDialog = (plant: GreenlogPlant) => {
        setEditingPlant(plant);
        setForm({
            inventory_number: plant.inventory_number,
            name: plant.name,
            biological_name: plant.biological_name ?? '',
            category: plant.category,
            status: plant.status,
            location_id: plant.location_id ? String(plant.location_id) : 'none',
            quantity: String(plant.quantity ?? 1),
            unit_cost: plant.unit_cost !== null && plant.unit_cost !== undefined ? String(plant.unit_cost) : '',
            watering_frequency_days: plant.watering_frequency_days ? String(plant.watering_frequency_days) : '',
            fertilizing_frequency_days: plant.fertilizing_frequency_days ? String(plant.fertilizing_frequency_days) : '',
            notes: plant.notes ?? '',
        });
        setIsDialogOpen(true);
    };

    const submitForm = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        try {
            setSaving(true);

            const payload = {
                inventory_number: form.inventory_number.trim(),
                name: form.name.trim(),
                biological_name: form.biological_name.trim() || null,
                category: form.category,
                status: form.status,
                location_id: form.location_id === 'none' ? null : Number(form.location_id),
                quantity: form.quantity ? Number(form.quantity) : 1,
                unit_cost: form.unit_cost ? Number(form.unit_cost) : null,
                watering_frequency_days: form.watering_frequency_days ? Number(form.watering_frequency_days) : null,
                fertilizing_frequency_days: form.fertilizing_frequency_days ? Number(form.fertilizing_frequency_days) : null,
                notes: form.notes.trim() || null,
            };

            if (editingPlant) {
                await updateGreenlogPlant(editingPlant.id, payload);
                toast.success('Растение обновлено');
            } else {
                await createGreenlogPlant(payload);
                toast.success('Растение создано');
            }

            resetDialog();
            await loadPlants();
        } catch (submitError) {
            toast.error(submitError instanceof Error ? submitError.message : 'Не удалось сохранить растение.');
        } finally {
            setSaving(false);
        }
    };

    const removePlant = async (plant: GreenlogPlant) => {
        if (!window.confirm(`Удалить растение "${plant.name}"?`)) {
            return;
        }

        try {
            await deleteGreenlogPlant(plant.id);
            toast.success('Растение удалено');
            await loadPlants();
        } catch (deleteError) {
            toast.error(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить растение.');
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Растения" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <Card>
                    <CardHeader className="gap-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <CardTitle>Растения</CardTitle>
                                <CardDescription>Учет растений с фильтрами, привязкой к локациям и переходом в карточку растения.</CardDescription>
                            </div>
                            <Button onClick={openCreateDialog}>
                                <Plus className="h-4 w-4" />
                                Добавить растение
                            </Button>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <div className="relative">
                                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    className="pl-9"
                                    placeholder="Поиск по номеру или названию"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                />
                            </div>
                            <Select value={category} onValueChange={setCategory}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Категория" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Все категории</SelectItem>
                                    {plantCategories.map((item) => (
                                        <SelectItem key={item.value} value={item.value}>
                                            {item.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Статус" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Все статусы</SelectItem>
                                    {plantStatuses.map((item) => (
                                        <SelectItem key={item.value} value={item.value}>
                                            {item.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={locationId} onValueChange={setLocationId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Локация" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Все локации</SelectItem>
                                    {locations.map((location) => (
                                        <SelectItem key={location.id} value={String(location.id)}>
                                            {formatLocationLabel(location)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {error ? (
                            <Alert variant="destructive" className="mb-4">
                                <AlertTitle>Ошибка загрузки</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        ) : null}

                        {loading ? (
                            <div className="space-y-3">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ) : null}

                        {!loading && !error && plants.length === 0 ? (
                            <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center">
                                Растения по текущим фильтрам не найдены.
                            </div>
                        ) : null}

                        {!loading && !error && plants.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Инвентарный номер</TableHead>
                                        <TableHead>Вид растения</TableHead>
                                        <TableHead>Количество</TableHead>
                                        <TableHead>Стоимость за ед.</TableHead>
                                        <TableHead>Общая стоимость</TableHead>
                                        <TableHead>Статус</TableHead>
                                        <TableHead>Локация</TableHead>
                                        <TableHead className="w-[220px]">Действия</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {plants.map((plant) => (
                                        <TableRow key={plant.id}>
                                            <TableCell className="font-medium">{plant.inventory_number}</TableCell>
                                            <TableCell>
                                                <div className="font-medium">{getPlantDisplayName(plant)}</div>
                                                <div className="text-muted-foreground text-xs">
                                                    {plantCategoryLabel(plant.category)}
                                                    {' · '}
                                                    {plantCostSourceLabel(plant.cost_source)}
                                                </div>
                                            </TableCell>
                                            <TableCell>{plant.quantity ?? 1}</TableCell>
                                            <TableCell>{greenlogMoneyLabel(plant.unit_cost)}</TableCell>
                                            <TableCell>{greenlogMoneyLabel(plant.total_cost)}</TableCell>
                                            <TableCell>
                                                <Badge variant={getStatusVariant(plant.status)}>
                                                    {plantStatuses.find((item) => item.value === plant.status)?.label ?? plant.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{formatLocationLabel(plant.location ?? locationMap.get(plant.location_id ?? 0))}</TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Button asChild variant="outline" size="sm">
                                                        <Link href={`/greenlog/plants/${plant.id}`}>
                                                            <ExternalLink className="h-4 w-4" />
                                                            Карточка
                                                        </Link>
                                                    </Button>
                                                    <Button variant="outline" size="sm" onClick={() => openEditDialog(plant)}>
                                                        <Pencil className="h-4 w-4" />
                                                        Изменить
                                                    </Button>
                                                    <Button variant="destructive" size="sm" onClick={() => void removePlant(plant)}>
                                                        <Trash2 className="h-4 w-4" />
                                                        Удалить
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : null}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={(open) => (!open ? resetDialog() : setIsDialogOpen(open))}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingPlant ? 'Редактирование растения' : 'Новое растение'}</DialogTitle>
                        <DialogDescription>Базовые поля растения и связь с локацией.</DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={submitForm}>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="inventory_number">Инвентарный номер</Label>
                                <Input
                                    id="inventory_number"
                                    value={form.inventory_number}
                                    onChange={(event) => setForm((prev) => ({ ...prev, inventory_number: event.target.value }))}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="name">Название</Label>
                                <Input id="name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="biological_name">Биологическое название</Label>
                                <Input
                                    id="biological_name"
                                    value={form.biological_name}
                                    onChange={(event) => setForm((prev) => ({ ...prev, biological_name: event.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Локация</Label>
                                <Select value={form.location_id} onValueChange={(value) => setForm((prev) => ({ ...prev, location_id: value }))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Без локации" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Без локации</SelectItem>
                                        {locations.map((location) => (
                                            <SelectItem key={location.id} value={String(location.id)}>
                                                {formatLocationLabel(location)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Категория</Label>
                                <Select value={form.category} onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {plantCategories.map((item) => (
                                            <SelectItem key={item.value} value={item.value}>
                                                {item.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Статус</Label>
                                <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {plantStatuses.map((item) => (
                                            <SelectItem key={item.value} value={item.value}>
                                                {item.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="quantity">Количество</Label>
                                <Input
                                    id="quantity"
                                    min={1}
                                    type="number"
                                    value={form.quantity}
                                    onChange={(event) => setForm((prev) => ({ ...prev, quantity: event.target.value }))}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="unit_cost">Стоимость за единицу</Label>
                                <Input
                                    id="unit_cost"
                                    min={0}
                                    step="0.01"
                                    type="number"
                                    value={form.unit_cost}
                                    onChange={(event) => setForm((prev) => ({ ...prev, unit_cost: event.target.value }))}
                                />
                                <div className="text-muted-foreground text-xs">Пустое значение сохранит авторасчет стоимости.</div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="watering_frequency_days">Полив, дней</Label>
                                <Input
                                    id="watering_frequency_days"
                                    min={1}
                                    type="number"
                                    value={form.watering_frequency_days}
                                    onChange={(event) => setForm((prev) => ({ ...prev, watering_frequency_days: event.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="fertilizing_frequency_days">Подкормка, дней</Label>
                                <Input
                                    id="fertilizing_frequency_days"
                                    min={1}
                                    type="number"
                                    value={form.fertilizing_frequency_days}
                                    onChange={(event) => setForm((prev) => ({ ...prev, fertilizing_frequency_days: event.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="notes">Примечание</Label>
                            <Textarea
                                id="notes"
                                rows={4}
                                value={form.notes}
                                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={resetDialog}>
                                Отмена
                            </Button>
                            <Button type="submit" disabled={saving}>
                                {saving ? 'Сохранение...' : editingPlant ? 'Сохранить' : 'Создать'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
