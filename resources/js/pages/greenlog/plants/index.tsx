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
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    createGreenlogPlant,
    deleteGreenlogPlant,
    getGreenlogLocations,
    getGreenlogPlants,
    type GreenlogLocation,
    type GreenlogPlant,
    updateGreenlogPlant,
} from '@/lib/greenlog-api';
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
    branch: string;
    office: string;
    room: string;
    responsible_person: string;
    plant_type: string;
    height_value: string;
    height_unit: string;
    trunk_diameter_value: string;
    trunk_diameter_unit: string;
    condition_text: string;
    gps_coordinates: string;
    last_inspection_date: string;
    condition_notes: string;
    acquisition_date: string;
    last_inventory_date: string;
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
    branch: '',
    office: '',
    room: '',
    responsible_person: '',
    plant_type: '',
    height_value: '',
    height_unit: 'м',
    trunk_diameter_value: '',
    trunk_diameter_unit: 'см',
    condition_text: '',
    gps_coordinates: '',
    last_inspection_date: '',
    condition_notes: '',
    acquisition_date: '',
    last_inventory_date: '',
    watering_frequency_days: '',
    fertilizing_frequency_days: '',
    notes: '',
};

const formatLocationLabel = (location?: Partial<GreenlogLocation> | null) =>
    [location?.building, location?.room, location?.factory_zone].filter(Boolean).join(' / ') || 'Без локации';

const getPlantDisplayName = (plant: GreenlogPlant) => plant.species?.name || plant.name || `Растение #${plant.id}`;

const getPlantRoomLabel = (plant: GreenlogPlant, location?: GreenlogLocation) =>
    plant.room || formatLocationLabel(plant.location ?? location);

const formatDateInput = (value?: string | null) => (value ? value.slice(0, 10) : '');

const getResponsiblePerson = (plant: GreenlogPlant) => {
    if (plant.responsible_person && plant.responsible_person.trim() !== '') {
        return plant.responsible_person;
    }

    const match = plant.notes?.match(/^Ответственный:\s*(.+)$/iu);

    return match?.[1]?.trim() || '—';
};

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
    }, [search, status, locationId]);

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
            branch: plant.branch ?? '',
            office: plant.office ?? '',
            room: plant.room ?? '',
            responsible_person: plant.responsible_person ?? '',
            plant_type: plant.plant_type ?? '',
            height_value: plant.height_value !== null && plant.height_value !== undefined ? String(plant.height_value) : '',
            height_unit: plant.height_unit ?? 'м',
            trunk_diameter_value: plant.trunk_diameter_value !== null && plant.trunk_diameter_value !== undefined ? String(plant.trunk_diameter_value) : '',
            trunk_diameter_unit: plant.trunk_diameter_unit ?? 'см',
            condition_text: plant.condition_text ?? '',
            gps_coordinates: plant.gps_coordinates ?? '',
            last_inspection_date: formatDateInput(plant.last_inspection_date),
            condition_notes: plant.condition_notes ?? '',
            acquisition_date: formatDateInput(plant.acquisition_date),
            last_inventory_date: formatDateInput(plant.last_inventory_date),
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
                branch: form.branch.trim() || null,
                office: form.office.trim() || null,
                room: form.room.trim() || null,
                responsible_person: form.responsible_person.trim() || null,
                plant_type: form.plant_type.trim() || null,
                height_value: form.height_value ? Number(form.height_value) : null,
                height_unit: form.height_unit.trim() || 'м',
                trunk_diameter_value: form.trunk_diameter_value ? Number(form.trunk_diameter_value) : null,
                trunk_diameter_unit: form.trunk_diameter_unit.trim() || 'см',
                condition_text: form.condition_text.trim() || null,
                gps_coordinates: form.gps_coordinates.trim() || null,
                last_inspection_date: form.last_inspection_date || null,
                condition_notes: form.condition_notes.trim() || null,
                acquisition_date: form.acquisition_date || null,
                last_inventory_date: form.last_inventory_date || null,
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
            <div className="flex h-full min-w-0 flex-1 flex-col gap-4 overflow-hidden rounded-xl p-4 w-full max-w-full">
                <Card className="w-full max-w-full overflow-hidden">
                    <CardHeader className="gap-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <CardTitle>Реестр растений</CardTitle>
                                <CardDescription>Инвентарный учет растений Shin Line Flora по филиалам, помещениям и ответственным.</CardDescription>
                            </div>
                            <Button onClick={openCreateDialog}>
                                <Plus className="h-4 w-4" />
                                Добавить растение
                            </Button>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                            <div className="relative">
                                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                <Input
                                    className="pl-9"
                                    placeholder="Поиск по номеру, названию, помещению"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                />
                            </div>
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
                    <CardContent className="min-w-0 overflow-hidden px-0 pb-0 w-full max-w-full">
                        {error ? (
                            <Alert variant="destructive" className="mx-6 mb-4">
                                <AlertTitle>Ошибка загрузки</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        ) : null}

                        {loading ? (
                            <div className="mx-6 mb-6 w-auto max-w-full overflow-x-auto rounded-md border">
                                <div className="min-w-[1080px] space-y-2 p-3">
                                    <Skeleton className="h-8 w-full" />
                                    <Skeleton className="h-8 w-full" />
                                    <Skeleton className="h-8 w-full" />
                                    <Skeleton className="h-8 w-full" />
                                </div>
                            </div>
                        ) : null}

                        {!loading && !error && plants.length === 0 ? (
                            <div className="text-muted-foreground mx-6 mb-6 rounded-lg border border-dashed px-4 py-10 text-center">
                                Растения по текущим фильтрам не найдены.
                            </div>
                        ) : null}

                        {!loading && !error && plants.length > 0 ? (
                            <div className="h-[calc(100vh-260px)] min-h-[620px] w-full max-w-full overflow-x-auto overflow-y-auto border-t">
                                <table className="min-w-[1200px] table-fixed border-collapse text-sm">
                                    <colgroup>
                                        <col className="w-[130px]" />
                                        <col className="w-[260px]" />
                                        <col className="w-[150px]" />
                                        <col className="w-[170px]" />
                                        <col className="w-[240px]" />
                                        <col className="w-[240px]" />
                                        <col className="w-[80px]" />
                                        <col className="w-[130px]" />
                                        <col className="w-[150px]" />
                                    </colgroup>
                                    <thead className="sticky top-0 z-20 bg-white">
                                        <tr className="border-b">
                                            <th className="h-10 bg-white px-4 text-left align-middle font-medium whitespace-nowrap text-muted-foreground">Инв. №</th>
                                            <th className="h-10 bg-white px-4 text-left align-middle font-medium text-muted-foreground">Наименование</th>
                                            <th className="h-10 px-4 text-left align-middle font-medium whitespace-nowrap text-muted-foreground">Филиал</th>
                                            <th className="h-10 px-4 text-left align-middle font-medium whitespace-nowrap text-muted-foreground">Магазин/Офис</th>
                                            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Помещение</th>
                                            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Ответственный</th>
                                            <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">Кол-во</th>
                                            <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Статус</th>
                                            <th className="sticky right-0 z-40 h-10 bg-white px-4 text-left align-middle font-medium text-muted-foreground shadow-[-10px_0_14px_-14px_rgba(0,0,0,0.45)]">
                                                Действия
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {plants.map((plant) => {
                                            const location = locationMap.get(plant.location_id ?? 0);
                                            const displayName = getPlantDisplayName(plant);
                                            const roomLabel = getPlantRoomLabel(plant, location);
                                            const responsiblePerson = getResponsiblePerson(plant);

                                            return (
                                            <tr key={plant.id} className="group h-16 min-h-[64px] border-b transition-colors hover:bg-muted/50">
                                                    <td className="px-4 py-4 align-middle font-medium whitespace-nowrap">{plant.inventory_number}</td>
                                                    <td className="px-4 py-4 align-middle">
                                                        <div className="line-clamp-1 font-medium leading-5" title={displayName}>{displayName}</div>
                                                        <div
                                                            className="text-muted-foreground line-clamp-1 text-xs leading-4"
                                                            title={plant.inventory_number || roomLabel}
                                                        >
                                                            {plant.inventory_number || roomLabel}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 align-middle whitespace-nowrap">{plant.branch || '—'}</td>
                                                    <td className="px-4 py-4 align-middle whitespace-nowrap">{plant.office || '—'}</td>
                                                    <td className="px-4 py-4 align-middle">
                                                        <div className="line-clamp-2 leading-5" title={roomLabel}>{roomLabel}</div>
                                                    </td>
                                                    <td className="px-4 py-4 align-middle">
                                                        <div className="line-clamp-2 leading-5" title={responsiblePerson}>{responsiblePerson}</div>
                                                    </td>
                                                    <td className="px-4 py-4 text-right align-middle tabular-nums">{plant.quantity ?? 1}</td>
                                                    <td className="px-4 py-4 align-middle">
                                                        <Badge variant={getStatusVariant(plant.status)}>
                                                            {plantStatuses.find((item) => item.value === plant.status)?.label ?? plant.status}
                                                        </Badge>
                                                    </td>
                                                    <td className="sticky right-0 z-20 bg-white px-4 py-4 align-middle shadow-[-10px_0_14px_-14px_rgba(0,0,0,0.45)] group-hover:bg-muted/50">
                                                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button asChild variant="outline" size="icon" title="Открыть">
                                                                        <Link href={`/greenlog/plants/${plant.id}`}>
                                                                            <ExternalLink className="h-4 w-4" />
                                                                            <span className="sr-only">Открыть</span>
                                                                        </Link>
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Открыть</TooltipContent>
                                                            </Tooltip>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button variant="outline" size="icon" title="Изменить" onClick={() => openEditDialog(plant)}>
                                                                        <Pencil className="h-4 w-4" />
                                                                        <span className="sr-only">Изменить</span>
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Изменить</TooltipContent>
                                                            </Tooltip>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button variant="destructive" size="icon" title="Удалить" onClick={() => void removePlant(plant)}>
                                                                        <Trash2 className="h-4 w-4" />
                                                                        <span className="sr-only">Удалить</span>
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent>Удалить</TooltipContent>
                                                            </Tooltip>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={(open) => (!open ? resetDialog() : setIsDialogOpen(open))}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                    <DialogHeader>
                        <DialogTitle>{editingPlant ? 'Редактирование растения' : 'Новое растение'}</DialogTitle>
                        <DialogDescription>Реестровые данные растения, привязка к локации и параметры ухода.</DialogDescription>
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
                                <Label htmlFor="branch">Филиал</Label>
                                <Input
                                    id="branch"
                                    value={form.branch}
                                    onChange={(event) => setForm((prev) => ({ ...prev, branch: event.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="office">Магазин/Офис</Label>
                                <Input
                                    id="office"
                                    value={form.office}
                                    onChange={(event) => setForm((prev) => ({ ...prev, office: event.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="room">Помещение</Label>
                                <Input
                                    id="room"
                                    value={form.room}
                                    onChange={(event) => setForm((prev) => ({ ...prev, room: event.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="responsible_person">Ответственный</Label>
                                <Input
                                    id="responsible_person"
                                    value={form.responsible_person}
                                    onChange={(event) => setForm((prev) => ({ ...prev, responsible_person: event.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="plant_type">Вид растения</Label>
                                <Input
                                    id="plant_type"
                                    value={form.plant_type}
                                    onChange={(event) => setForm((prev) => ({ ...prev, plant_type: event.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="condition_text">Состояние</Label>
                                <Input
                                    id="condition_text"
                                    value={form.condition_text}
                                    onChange={(event) => setForm((prev) => ({ ...prev, condition_text: event.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="gps_coordinates">Координаты</Label>
                                <Input
                                    id="gps_coordinates"
                                    value={form.gps_coordinates}
                                    onChange={(event) => setForm((prev) => ({ ...prev, gps_coordinates: event.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="last_inspection_date">Последний осмотр</Label>
                                <Input
                                    id="last_inspection_date"
                                    type="date"
                                    value={form.last_inspection_date}
                                    onChange={(event) => setForm((prev) => ({ ...prev, last_inspection_date: event.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="height_value">Высота</Label>
                                <div className="grid grid-cols-[1fr_92px] gap-2">
                                    <Input
                                        id="height_value"
                                        min="0"
                                        step="0.01"
                                        type="number"
                                        value={form.height_value}
                                        onChange={(event) => setForm((prev) => ({ ...prev, height_value: event.target.value }))}
                                    />
                                    <Input
                                        aria-label="Единица высоты"
                                        value={form.height_unit}
                                        onChange={(event) => setForm((prev) => ({ ...prev, height_unit: event.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="trunk_diameter_value">Диаметр ствола</Label>
                                <div className="grid grid-cols-[1fr_92px] gap-2">
                                    <Input
                                        id="trunk_diameter_value"
                                        min="0"
                                        step="0.01"
                                        type="number"
                                        value={form.trunk_diameter_value}
                                        onChange={(event) => setForm((prev) => ({ ...prev, trunk_diameter_value: event.target.value }))}
                                    />
                                    <Input
                                        aria-label="Единица диаметра"
                                        value={form.trunk_diameter_unit}
                                        onChange={(event) => setForm((prev) => ({ ...prev, trunk_diameter_unit: event.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="acquisition_date">Дата приобретения</Label>
                                <Input
                                    id="acquisition_date"
                                    type="date"
                                    value={form.acquisition_date}
                                    onChange={(event) => setForm((prev) => ({ ...prev, acquisition_date: event.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="last_inventory_date">Дата последней инвентаризации</Label>
                                <Input
                                    id="last_inventory_date"
                                    type="date"
                                    value={form.last_inventory_date}
                                    onChange={(event) => setForm((prev) => ({ ...prev, last_inventory_date: event.target.value }))}
                                />
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
                            <Label htmlFor="condition_notes">Примечание по состоянию</Label>
                            <Textarea
                                id="condition_notes"
                                rows={3}
                                value={form.condition_notes}
                                onChange={(event) => setForm((prev) => ({ ...prev, condition_notes: event.target.value }))}
                            />
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
