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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    completeGreenlogCareTask,
    createGreenlogCareTask,
    createGreenlogExpense,
    deleteGreenlogPlantPhoto,
    getGreenlogLocations,
    getGreenlogPlant,
    isPreviewableGreenlogPhoto,
    updateGreenlogPlant,
    validateGreenlogPlantPhotoFile,
    type GreenlogCareTask,
    type GreenlogExpense,
    type GreenlogLocation,
    type GreenlogPlant,
    type GreenlogPlantPhoto,
    uploadGreenlogPlantPhoto,
} from '@/lib/greenlog-api';
import { greenlogMoneyLabel, plantCostSourceLabel } from '@/lib/greenlog-labels';
import type { BreadcrumbItem, SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import {
    CalendarClock,
    ExternalLink,
    ImagePlus,
    LoaderCircle,
    MapPin,
    Pencil,
    Trash2,
    Upload,
} from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

const expenseCategories = [
    { value: 'purchase', label: 'Покупка' },
    { value: 'pot', label: 'Горшок' },
    { value: 'fertilizer', label: 'Удобрение' },
    { value: 'soil', label: 'Грунт' },
    { value: 'watering', label: 'Полив' },
    { value: 'service', label: 'Сервис' },
    { value: 'other', label: 'Другое' },
];

const careTaskTypes = [
    { value: 'watering', label: 'Полив' },
    { value: 'fertilizing', label: 'Подкормка' },
    { value: 'treatment', label: 'Обработка' },
    { value: 'inspection', label: 'Осмотр' },
    { value: 'other', label: 'Другое' },
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

type PlantPageProps = SharedData & {
    plantId: number;
};

type ExpenseForm = {
    category: string;
    amount: string;
    expense_date: string;
    description: string;
    document_number: string;
};

type CareTaskForm = {
    type: string;
    due_at: string;
    comment: string;
};

type PlantEditForm = {
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

const emptyExpenseForm: ExpenseForm = {
    category: 'purchase',
    amount: '',
    expense_date: '',
    description: '',
    document_number: '',
};

const emptyCareTaskForm: CareTaskForm = {
    type: 'watering',
    due_at: '',
    comment: '',
};

const emptyPlantEditForm: PlantEditForm = {
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

const formatDateTime = (value?: string | null) => {
    if (!value) {
        return '—';
    }

    return new Date(value).toLocaleString('ru-RU');
};

const formatDate = (value?: string | null) => {
    if (!value) {
        return '—';
    }

    return new Date(value).toLocaleDateString('ru-RU');
};

const formatDateInput = (value?: string | null) => (value ? value.slice(0, 10) : '');

const formatDimension = (value?: string | number | null, unit?: string | null) => {
    if (value === null || value === undefined || value === '') {
        return '—';
    }

    const normalizedUnit = unit?.trim() || '';

    return normalizedUnit !== '' ? `${value} ${normalizedUnit}` : String(value);
};

const formatLocationLabel = (location?: Partial<GreenlogLocation> | null) =>
    [location?.building, location?.floor, location?.room, location?.factory_zone].filter(Boolean).join(' / ') || 'Без локации';

const getStatusVariant = (status: string) => {
    if (status === 'needs_care') {
        return 'secondary';
    }

    if (status === 'written_off') {
        return 'destructive';
    }

    return 'default';
};

const resolvePhotoUrl = (photo: Pick<GreenlogPlantPhoto, 'url' | 'path'>): string | null => {
    if (photo.url && photo.url.trim() !== '') {
        return photo.url;
    }

    if (photo.path && photo.path.trim() !== '') {
        return `/storage/${photo.path.replace(/^\/+/, '')}`;
    }

    return null;
};

const buildPlantEditForm = (plant: GreenlogPlant): PlantEditForm => ({
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

function InfoField({ label, value }: { label: string; value: string }) {
    return (
        <div className="space-y-1">
            <div className="text-xs font-medium tracking-normal text-muted-foreground">{label}</div>
            <div className="min-h-6 text-sm leading-6 text-foreground">{value || '—'}</div>
        </div>
    );
}

function MetricTile({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border bg-muted/20 p-4">
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className="mt-1 text-base font-semibold">{value}</div>
        </div>
    );
}

export default function GreenLogPlantShow() {
    const { plantId } = usePage<PlantPageProps>().props;
    const [plant, setPlant] = useState<GreenlogPlant | null>(null);
    const [locations, setLocations] = useState<GreenlogLocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [locationsLoading, setLocationsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [savingExpense, setSavingExpense] = useState(false);
    const [savingTask, setSavingTask] = useState(false);
    const [savingCost, setSavingCost] = useState(false);
    const [savingPlant, setSavingPlant] = useState(false);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [fileError, setFileError] = useState<string | null>(null);
    const [brokenPhotos, setBrokenPhotos] = useState<Record<number, boolean>>({});
    const [unitCost, setUnitCost] = useState('');
    const [expenseForm, setExpenseForm] = useState<ExpenseForm>(emptyExpenseForm);
    const [careTaskForm, setCareTaskForm] = useState<CareTaskForm>(emptyCareTaskForm);
    const [editForm, setEditForm] = useState<PlantEditForm>(emptyPlantEditForm);

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            { title: 'Shin Line Flora', href: '/greenlog' },
            { title: 'Растения', href: '/greenlog/plants' },
            { title: plant?.name ?? `Растение #${plantId}`, href: `/greenlog/plants/${plantId}` },
        ],
        [plant?.name, plantId],
    );

    const loadPlant = async () => {
        try {
            setLoading(true);
            setError(null);
            const plantData = await getGreenlogPlant(plantId);

            setPlant(plantData);
            setEditForm(buildPlantEditForm(plantData));
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить карточку растения.');
        } finally {
            setLoading(false);
        }
    };

    const loadLocations = async () => {
        try {
            setLocationsLoading(true);
            setLocations(await getGreenlogLocations());
        } catch (locationsError) {
            toast.error(locationsError instanceof Error ? locationsError.message : 'Не удалось загрузить список локаций.');
        } finally {
            setLocationsLoading(false);
        }
    };

    useEffect(() => {
        void loadPlant();
        void loadLocations();
    }, [plantId]);

    useEffect(() => {
        setBrokenPhotos({});
    }, [plant?.id, plant?.photos?.length]);

    useEffect(() => {
        setUnitCost(plant?.unit_cost !== null && plant?.unit_cost !== undefined ? String(plant.unit_cost) : '');
    }, [plant?.id, plant?.unit_cost]);

    const openEditDialog = () => {
        if (!plant) {
            return;
        }

        setEditForm(buildPlantEditForm(plant));
        setEditDialogOpen(true);
    };

    const savePlant = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        try {
            setSavingPlant(true);
            await updateGreenlogPlant(plantId, {
                inventory_number: editForm.inventory_number.trim(),
                name: editForm.name.trim(),
                biological_name: editForm.biological_name.trim() || null,
                category: editForm.category,
                status: editForm.status,
                location_id: editForm.location_id === 'none' ? null : Number(editForm.location_id),
                quantity: editForm.quantity ? Number(editForm.quantity) : 1,
                unit_cost: editForm.unit_cost ? Number(editForm.unit_cost) : null,
                branch: editForm.branch.trim() || null,
                office: editForm.office.trim() || null,
                room: editForm.room.trim() || null,
                responsible_person: editForm.responsible_person.trim() || null,
                plant_type: editForm.plant_type.trim() || null,
                height_value: editForm.height_value ? Number(editForm.height_value) : null,
                height_unit: editForm.height_unit.trim() || 'м',
                trunk_diameter_value: editForm.trunk_diameter_value ? Number(editForm.trunk_diameter_value) : null,
                trunk_diameter_unit: editForm.trunk_diameter_unit.trim() || 'см',
                condition_text: editForm.condition_text.trim() || null,
                gps_coordinates: editForm.gps_coordinates.trim() || null,
                last_inspection_date: editForm.last_inspection_date || null,
                condition_notes: editForm.condition_notes.trim() || null,
                acquisition_date: editForm.acquisition_date || null,
                last_inventory_date: editForm.last_inventory_date || null,
                watering_frequency_days: editForm.watering_frequency_days ? Number(editForm.watering_frequency_days) : null,
                fertilizing_frequency_days: editForm.fertilizing_frequency_days ? Number(editForm.fertilizing_frequency_days) : null,
                notes: editForm.notes.trim() || null,
            });
            setEditDialogOpen(false);
            toast.success('Данные растения обновлены');
            await loadPlant();
        } catch (saveError) {
            toast.error(saveError instanceof Error ? saveError.message : 'Не удалось обновить растение.');
        } finally {
            setSavingPlant(false);
        }
    };

    const uploadPhoto = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!selectedFile) {
            setFileError('Выберите файл');
            toast.error('Выберите файл');
            return;
        }

        const validationError = validateGreenlogPlantPhotoFile(selectedFile);

        if (validationError) {
            setFileError(validationError);
            toast.error(validationError);
            return;
        }

        try {
            setUploading(true);
            const formData = new FormData();
            formData.append('photo', selectedFile);
            formData.append('type', 'plant');
            await uploadGreenlogPlantPhoto(plantId, formData);
            setSelectedFile(null);
            setFileError(null);
            toast.success('Фотография загружена');
            await loadPlant();
        } catch (uploadError) {
            toast.error(uploadError instanceof Error ? uploadError.message : 'Не удалось загрузить фотографию.');
        } finally {
            setUploading(false);
        }
    };

    const removePhoto = async (photo: GreenlogPlantPhoto) => {
        if (!window.confirm('Удалить фотографию?')) {
            return;
        }

        try {
            await deleteGreenlogPlantPhoto(photo.id);
            toast.success('Фотография удалена');
            await loadPlant();
        } catch (photoError) {
            toast.error(photoError instanceof Error ? photoError.message : 'Не удалось удалить фотографию.');
        }
    };

    const submitExpense = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        try {
            setSavingExpense(true);
            await createGreenlogExpense({
                plant_id: plantId,
                location_id: plant?.location_id ?? null,
                category: expenseForm.category,
                amount: expenseForm.amount,
                expense_date: expenseForm.expense_date,
                description: expenseForm.description.trim(),
                document_number: expenseForm.document_number.trim() || null,
            });
            setExpenseForm(emptyExpenseForm);
            toast.success('Расход добавлен');
            await loadPlant();
        } catch (expenseError) {
            toast.error(expenseError instanceof Error ? expenseError.message : 'Не удалось сохранить расход.');
        } finally {
            setSavingExpense(false);
        }
    };

    const submitCareTask = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        try {
            setSavingTask(true);
            await createGreenlogCareTask({
                plant_id: plantId,
                type: careTaskForm.type,
                due_at: careTaskForm.due_at,
                comment: careTaskForm.comment.trim() || null,
            });
            setCareTaskForm(emptyCareTaskForm);
            toast.success('Задача добавлена');
            await loadPlant();
        } catch (taskError) {
            toast.error(taskError instanceof Error ? taskError.message : 'Не удалось сохранить задачу.');
        } finally {
            setSavingTask(false);
        }
    };

    const completeTask = async (task: GreenlogCareTask) => {
        try {
            await completeGreenlogCareTask(task.id);
            toast.success('Задача отмечена выполненной');
            await loadPlant();
        } catch (taskError) {
            toast.error(taskError instanceof Error ? taskError.message : 'Не удалось завершить задачу.');
        }
    };

    const savePlantCost = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        try {
            setSavingCost(true);
            await updateGreenlogPlant(plantId, {
                unit_cost: unitCost.trim() === '' ? null : Number(unitCost),
            });
            toast.success('Стоимость растения обновлена');
            await loadPlant();
        } catch (costError) {
            toast.error(costError instanceof Error ? costError.message : 'Не удалось сохранить стоимость растения.');
        } finally {
            setSavingCost(false);
        }
    };

    const displayName = plant?.species?.name || plant?.name || `Растение #${plantId}`;
    const locationLabel = formatLocationLabel(plant?.location);
    const photoCount = plant?.photos?.length ?? 0;
    const expenseCount = plant?.expenses?.length ?? 0;
    const taskCount = plant?.care_tasks?.length ?? 0;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={plant?.name ?? 'Растение'} />
            <div className="flex h-full min-w-0 flex-1 flex-col gap-4 p-4">
                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>Ошибка загрузки</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                {loading ? (
                    <div className="flex min-h-[320px] items-center justify-center rounded-xl border">
                        <LoaderCircle className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : null}

                {!loading && plant ? (
                    <>
                        <Card className="overflow-hidden">
                            <CardHeader className="gap-5 border-b bg-muted/20">
                                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline">{plant.inventory_number}</Badge>
                                            <Badge variant={getStatusVariant(plant.status)}>
                                                {plantStatuses.find((item) => item.value === plant.status)?.label ?? plant.status}
                                            </Badge>
                                            <Badge variant="secondary">{plantCategories.find((item) => item.value === plant.category)?.label ?? plant.category}</Badge>
                                        </div>
                                        <div className="space-y-2">
                                            <CardTitle className="text-2xl leading-tight">{displayName}</CardTitle>
                                            <CardDescription className="max-w-3xl text-sm leading-6">
                                                {plant.biological_name || 'Паспорт, реестровые данные, фотогалерея и журнал ухода по выбранному растению.'}
                                            </CardDescription>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                                            <div className="flex items-center gap-2">
                                                <MapPin className="h-4 w-4" />
                                                <span>{plant.room || locationLabel}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <CalendarClock className="h-4 w-4" />
                                                <span>Последний осмотр: {formatDate(plant.last_inspection_date)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button variant="outline" onClick={openEditDialog}>
                                            <Pencil className="h-4 w-4" />
                                            Изменить данные
                                        </Button>
                                        <Button asChild variant="outline">
                                            <Link href="/greenlog/plants">К реестру</Link>
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-5">
                                <MetricTile label="Количество" value={String(plant.quantity ?? 1)} />
                                <MetricTile label="Стоимость за единицу" value={greenlogMoneyLabel(plant.unit_cost)} />
                                <MetricTile label="Общая стоимость" value={greenlogMoneyLabel(plant.total_cost)} />
                                <MetricTile label="Фотографий" value={String(photoCount)} />
                                <MetricTile label="Задач ухода" value={String(taskCount)} />
                            </CardContent>
                        </Card>

                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,0.95fr)]">
                            <div className="grid gap-4">
                                <Card>
                                    <CardHeader className="flex flex-row items-start justify-between gap-3">
                                        <div>
                                            <CardTitle>Реестр растения</CardTitle>
                                            <CardDescription>Основные учетные данные, размещение и привязка к объекту.</CardDescription>
                                        </div>
                                        <Button variant="outline" size="sm" onClick={openEditDialog}>
                                            <Pencil className="h-4 w-4" />
                                            Изменить
                                        </Button>
                                    </CardHeader>
                                    <CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                                        <InfoField label="Инвентарный номер" value={plant.inventory_number} />
                                        <InfoField label="Наименование" value={displayName} />
                                        <InfoField label="Биологическое название" value={plant.biological_name || '—'} />
                                        <InfoField label="Филиал" value={plant.branch || '—'} />
                                        <InfoField label="Магазин / офис" value={plant.office || '—'} />
                                        <InfoField label="Помещение" value={plant.room || locationLabel} />
                                        <InfoField label="Локация" value={locationLabel} />
                                        <InfoField label="Ответственный" value={plant.responsible_person || '—'} />
                                        <InfoField label="Источник стоимости" value={plantCostSourceLabel(plant.cost_source)} />
                                        <InfoField label="Дата приобретения" value={formatDate(plant.acquisition_date)} />
                                        <InfoField label="Последняя инвентаризация" value={formatDate(plant.last_inventory_date)} />
                                        <InfoField label="Примечание по состоянию" value={plant.condition_notes || '—'} />
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader className="flex flex-row items-start justify-between gap-3">
                                        <div>
                                            <CardTitle>Паспорт растения</CardTitle>
                                            <CardDescription>Параметры растения, осмотры и дополнительные атрибуты.</CardDescription>
                                        </div>
                                        <Button variant="outline" size="sm" onClick={openEditDialog}>
                                            <Pencil className="h-4 w-4" />
                                            Редактировать паспорт
                                        </Button>
                                    </CardHeader>
                                    <CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                                        <InfoField label="Вид растения" value={plant.plant_type || '—'} />
                                        <InfoField label="Высота" value={formatDimension(plant.height_value, plant.height_unit)} />
                                        <InfoField label="Диаметр ствола" value={formatDimension(plant.trunk_diameter_value, plant.trunk_diameter_unit)} />
                                        <InfoField label="Состояние" value={plant.condition_text || '—'} />
                                        <InfoField label="Координаты" value={plant.gps_coordinates || '—'} />
                                        <InfoField label="Последний осмотр" value={formatDate(plant.last_inspection_date)} />
                                        <InfoField label="Ответственный" value={plant.responsible_person || '—'} />
                                        <InfoField
                                            label="Периодичность полива"
                                            value={plant.watering_frequency_days ? `${plant.watering_frequency_days} дн.` : '—'}
                                        />
                                        <InfoField
                                            label="Периодичность подкормки"
                                            value={plant.fertilizing_frequency_days ? `${plant.fertilizing_frequency_days} дн.` : '—'}
                                        />
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle>Стоимость растения</CardTitle>
                                        <CardDescription>Пустое значение вернет авторасчет по категории растения.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <form className="flex flex-col gap-3 md:flex-row md:items-end" onSubmit={savePlantCost}>
                                            <div className="flex-1 space-y-2">
                                                <Label htmlFor="unit-cost">Стоимость за единицу</Label>
                                                <Input
                                                    id="unit-cost"
                                                    min="0"
                                                    step="0.01"
                                                    type="number"
                                                    value={unitCost}
                                                    onChange={(event) => setUnitCost(event.target.value)}
                                                />
                                            </div>
                                            <Button disabled={savingCost} type="submit">
                                                {savingCost ? 'Сохранение...' : 'Сохранить стоимость'}
                                            </Button>
                                        </form>
                                        <div className="grid gap-3 md:grid-cols-3">
                                            <MetricTile label="Количество" value={String(plant.quantity ?? 1)} />
                                            <MetricTile label="Стоимость за единицу" value={greenlogMoneyLabel(plant.unit_cost)} />
                                            <MetricTile label="Общая стоимость" value={greenlogMoneyLabel(plant.total_cost)} />
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            <div className="grid gap-4">
                                <Card className="overflow-hidden">
                                    <CardHeader>
                                        <CardTitle>Фотографии растения</CardTitle>
                                        <CardDescription>Просмотр и загрузка фото прямо из карточки растения.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <form className="space-y-3" onSubmit={uploadPhoto}>
                                            <div className="rounded-xl border border-dashed bg-muted/20 p-4">
                                                <Label htmlFor="plant-photo" className="mb-2 block text-sm font-medium">
                                                    Загрузить фото
                                                </Label>
                                                <Input
                                                    id="plant-photo"
                                                    type="file"
                                                    accept="image/jpeg,image/png,image/webp"
                                                    onChange={(event) => {
                                                        const file = event.target.files?.[0] ?? null;

                                                        setSelectedFile(file);
                                                        setFileError(file ? validateGreenlogPlantPhotoFile(file) : 'Выберите файл');
                                                    }}
                                                />
                                                <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
                                                    <span className="truncate">{selectedFile ? selectedFile.name : 'Файл не выбран'}</span>
                                                    <Button disabled={uploading} type="submit" size="sm">
                                                        <Upload className="h-4 w-4" />
                                                        {uploading ? 'Загрузка...' : 'Загрузить'}
                                                    </Button>
                                                </div>
                                            </div>
                                        </form>

                                        {fileError ? (
                                            <Alert variant="destructive">
                                                <AlertTitle>Неподдерживаемый файл</AlertTitle>
                                                <AlertDescription>{fileError}</AlertDescription>
                                            </Alert>
                                        ) : null}

                                        {photoCount > 0 ? (
                                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                                                {plant.photos?.map((photo) => {
                                                    const photoUrl = resolvePhotoUrl(photo);

                                                    return (
                                                        <div key={photo.id} className="overflow-hidden rounded-xl border bg-background">
                                                            {photoUrl && isPreviewableGreenlogPhoto(photo) && !brokenPhotos[photo.id] ? (
                                                                <a href={photoUrl} rel="noreferrer" target="_blank" className="block aspect-[4/3] overflow-hidden bg-muted/20">
                                                                    <img
                                                                        alt={photo.original_name ?? plant.name}
                                                                        className="h-full w-full object-cover transition-transform duration-200 hover:scale-[1.02]"
                                                                        src={photoUrl}
                                                                        onError={() => setBrokenPhotos((current) => ({ ...current, [photo.id]: true }))}
                                                                    />
                                                                </a>
                                                            ) : (
                                                                <div className="flex aspect-[4/3] items-center justify-center bg-muted/20 px-4 text-center text-sm text-muted-foreground">
                                                                    {brokenPhotos[photo.id] ? 'Фото недоступно' : photoUrl ? 'Предпросмотр недоступен' : 'Ссылка на фото недоступна'}
                                                                </div>
                                                            )}
                                                            <div className="space-y-3 p-3">
                                                                <div className="min-w-0">
                                                                    <div className="truncate text-sm font-medium" title={photo.original_name ?? 'Без названия'}>
                                                                        {photo.original_name ?? 'Без названия'}
                                                                    </div>
                                                                    <div className="text-xs text-muted-foreground">{formatDateTime(photo.created_at)}</div>
                                                                </div>
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <div className="text-xs text-muted-foreground">
                                                                        {photo.mime_type || 'Файл'}{photo.size ? ` • ${Math.round(photo.size / 1024)} KB` : ''}
                                                                    </div>
                                                                    <div className="flex items-center gap-1">
                                                                        {photoUrl ? (
                                                                            <Tooltip>
                                                                                <TooltipTrigger asChild>
                                                                                    <Button asChild variant="outline" size="icon">
                                                                                        <a href={photoUrl} rel="noreferrer" target="_blank" title="Открыть фото">
                                                                                            <ExternalLink className="h-4 w-4" />
                                                                                            <span className="sr-only">Открыть фото</span>
                                                                                        </a>
                                                                                    </Button>
                                                                                </TooltipTrigger>
                                                                                <TooltipContent>Открыть фото</TooltipContent>
                                                                            </Tooltip>
                                                                        ) : null}
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <Button variant="destructive" size="icon" onClick={() => void removePhoto(photo)} title="Удалить фото">
                                                                                    <Trash2 className="h-4 w-4" />
                                                                                    <span className="sr-only">Удалить фото</span>
                                                                                </Button>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent>Удалить</TooltipContent>
                                                                        </Tooltip>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                                                Фотографии пока не загружены.
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle>Примечания</CardTitle>
                                        <CardDescription>Комментарий к карточке растения и служебные заметки.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <InfoField label="Основное примечание" value={plant.notes || '—'} />
                                        <InfoField label="Примечание по состоянию" value={plant.condition_notes || '—'} />
                                        <div className="rounded-xl border bg-muted/20 p-4">
                                            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                                <ImagePlus className="h-4 w-4" />
                                                Файлы и осмотры
                                            </div>
                                            <div className="text-sm leading-6">
                                                {photoCount} фото, {expenseCount} расходов, {taskCount} задач ухода.
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle>Операции по растению</CardTitle>
                                <CardDescription>Расходы и задачи ухода без перехода на другие страницы.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Tabs defaultValue="expenses" className="space-y-4">
                                    <TabsList className="grid w-full grid-cols-2 md:w-[360px]">
                                        <TabsTrigger value="expenses">Расходы</TabsTrigger>
                                        <TabsTrigger value="tasks">Задачи ухода</TabsTrigger>
                                    </TabsList>

                                    <TabsContent value="expenses" className="space-y-4">
                                        <form className="grid gap-3 lg:grid-cols-[1fr_1fr]" onSubmit={submitExpense}>
                                            <div className="grid gap-3 md:grid-cols-2">
                                                <div className="space-y-2">
                                                    <Label htmlFor="expense-category">Категория</Label>
                                                    <select
                                                        id="expense-category"
                                                        className="bg-background border-input h-9 rounded-md border px-3 text-sm"
                                                        value={expenseForm.category}
                                                        onChange={(event) => setExpenseForm((prev) => ({ ...prev, category: event.target.value }))}
                                                    >
                                                        {expenseCategories.map((item) => (
                                                            <option key={item.value} value={item.value}>
                                                                {item.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="expense-amount">Сумма</Label>
                                                    <Input
                                                        id="expense-amount"
                                                        min="0.01"
                                                        step="0.01"
                                                        type="number"
                                                        value={expenseForm.amount}
                                                        onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: event.target.value }))}
                                                        required
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="expense-date">Дата</Label>
                                                    <Input
                                                        id="expense-date"
                                                        type="date"
                                                        value={expenseForm.expense_date}
                                                        onChange={(event) => setExpenseForm((prev) => ({ ...prev, expense_date: event.target.value }))}
                                                        required
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="expense-document">Документ</Label>
                                                    <Input
                                                        id="expense-document"
                                                        value={expenseForm.document_number}
                                                        onChange={(event) => setExpenseForm((prev) => ({ ...prev, document_number: event.target.value }))}
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="expense-description">Описание</Label>
                                                <Textarea
                                                    id="expense-description"
                                                    rows={5}
                                                    value={expenseForm.description}
                                                    onChange={(event) => setExpenseForm((prev) => ({ ...prev, description: event.target.value }))}
                                                    required
                                                />
                                            </div>
                                            <div className="lg:col-span-2">
                                                <Button disabled={savingExpense} type="submit">
                                                    {savingExpense ? 'Сохранение...' : 'Добавить расход'}
                                                </Button>
                                            </div>
                                        </form>

                                        {plant.expenses && plant.expenses.length > 0 ? (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Дата</TableHead>
                                                        <TableHead>Категория</TableHead>
                                                        <TableHead>Сумма</TableHead>
                                                        <TableHead>Описание</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {plant.expenses.map((expense: GreenlogExpense) => (
                                                        <TableRow key={expense.id}>
                                                            <TableCell>{formatDateTime(expense.expense_date)}</TableCell>
                                                            <TableCell>{expense.category}</TableCell>
                                                            <TableCell>{expense.amount}</TableCell>
                                                            <TableCell>{expense.description}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        ) : (
                                            <div className="rounded-lg border border-dashed px-4 py-8 text-center text-muted-foreground">Расходы пока не добавлены.</div>
                                        )}
                                    </TabsContent>

                                    <TabsContent value="tasks" className="space-y-4">
                                        <form className="grid gap-3 lg:grid-cols-[1fr_1fr]" onSubmit={submitCareTask}>
                                            <div className="grid gap-3 md:grid-cols-2">
                                                <div className="space-y-2">
                                                    <Label htmlFor="task-type">Тип задачи</Label>
                                                    <select
                                                        id="task-type"
                                                        className="bg-background border-input h-9 rounded-md border px-3 text-sm"
                                                        value={careTaskForm.type}
                                                        onChange={(event) => setCareTaskForm((prev) => ({ ...prev, type: event.target.value }))}
                                                    >
                                                        {careTaskTypes.map((item) => (
                                                            <option key={item.value} value={item.value}>
                                                                {item.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="task-due-at">Срок</Label>
                                                    <Input
                                                        id="task-due-at"
                                                        type="datetime-local"
                                                        value={careTaskForm.due_at}
                                                        onChange={(event) => setCareTaskForm((prev) => ({ ...prev, due_at: event.target.value }))}
                                                        required
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="task-comment">Комментарий</Label>
                                                <Textarea
                                                    id="task-comment"
                                                    rows={5}
                                                    value={careTaskForm.comment}
                                                    onChange={(event) => setCareTaskForm((prev) => ({ ...prev, comment: event.target.value }))}
                                                />
                                            </div>
                                            <div className="lg:col-span-2">
                                                <Button disabled={savingTask} type="submit">
                                                    {savingTask ? 'Сохранение...' : 'Добавить задачу'}
                                                </Button>
                                            </div>
                                        </form>

                                        {plant.care_tasks && plant.care_tasks.length > 0 ? (
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Тип</TableHead>
                                                        <TableHead>Срок</TableHead>
                                                        <TableHead>Статус</TableHead>
                                                        <TableHead>Комментарий</TableHead>
                                                        <TableHead className="w-[140px]">Действия</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {plant.care_tasks.map((task: GreenlogCareTask) => (
                                                        <TableRow key={task.id}>
                                                            <TableCell>{task.type}</TableCell>
                                                            <TableCell>{formatDateTime(task.due_at)}</TableCell>
                                                            <TableCell>
                                                                <Badge variant={task.status === 'done' ? 'default' : task.status === 'overdue' ? 'destructive' : 'secondary'}>
                                                                    {task.status}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell>{task.comment || '—'}</TableCell>
                                                            <TableCell>
                                                                {task.status !== 'done' ? (
                                                                    <Button size="sm" variant="outline" onClick={() => void completeTask(task)}>
                                                                        Выполнено
                                                                    </Button>
                                                                ) : (
                                                                    <span className="text-xs text-muted-foreground">{formatDateTime(task.completed_at)}</span>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        ) : (
                                            <div className="rounded-lg border border-dashed px-4 py-8 text-center text-muted-foreground">Задачи пока не добавлены.</div>
                                        )}
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>
                    </>
                ) : null}
            </div>

            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
                    <DialogHeader>
                        <DialogTitle>Редактирование растения</DialogTitle>
                        <DialogDescription>Правка паспортных, реестровых и учетных полей без перехода к общему реестру.</DialogDescription>
                    </DialogHeader>
                    <form className="space-y-6" onSubmit={savePlant}>
                        <div className="space-y-4">
                            <div>
                                <div className="text-sm font-medium">Основное</div>
                                <div className="text-sm text-muted-foreground">Базовые атрибуты растения и его размещение.</div>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                <div className="space-y-2">
                                    <Label htmlFor="inventory_number">Инвентарный номер</Label>
                                    <Input
                                        id="inventory_number"
                                        value={editForm.inventory_number}
                                        onChange={(event) => setEditForm((prev) => ({ ...prev, inventory_number: event.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="name">Название</Label>
                                    <Input
                                        id="name"
                                        value={editForm.name}
                                        onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="biological_name">Биологическое название</Label>
                                    <Input
                                        id="biological_name"
                                        value={editForm.biological_name}
                                        onChange={(event) => setEditForm((prev) => ({ ...prev, biological_name: event.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Категория</Label>
                                    <Select value={editForm.category} onValueChange={(value) => setEditForm((prev) => ({ ...prev, category: value }))}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Категория" />
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
                                    <Select value={editForm.status} onValueChange={(value) => setEditForm((prev) => ({ ...prev, status: value }))}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Статус" />
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
                                    <Label>Локация</Label>
                                    <Select value={editForm.location_id} onValueChange={(value) => setEditForm((prev) => ({ ...prev, location_id: value }))}>
                                        <SelectTrigger>
                                            <SelectValue placeholder={locationsLoading ? 'Загрузка...' : 'Без локации'} />
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
                                    <Label htmlFor="quantity">Количество</Label>
                                    <Input
                                        id="quantity"
                                        min="1"
                                        type="number"
                                        value={editForm.quantity}
                                        onChange={(event) => setEditForm((prev) => ({ ...prev, quantity: event.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="unit_cost_modal">Стоимость за единицу</Label>
                                    <Input
                                        id="unit_cost_modal"
                                        min="0"
                                        step="0.01"
                                        type="number"
                                        value={editForm.unit_cost}
                                        onChange={(event) => setEditForm((prev) => ({ ...prev, unit_cost: event.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="branch">Филиал</Label>
                                    <Input id="branch" value={editForm.branch} onChange={(event) => setEditForm((prev) => ({ ...prev, branch: event.target.value }))} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="office">Магазин / офис</Label>
                                    <Input id="office" value={editForm.office} onChange={(event) => setEditForm((prev) => ({ ...prev, office: event.target.value }))} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="room">Помещение</Label>
                                    <Input id="room" value={editForm.room} onChange={(event) => setEditForm((prev) => ({ ...prev, room: event.target.value }))} />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="responsible_person">Ответственный</Label>
                                    <Input
                                        id="responsible_person"
                                        value={editForm.responsible_person}
                                        onChange={(event) => setEditForm((prev) => ({ ...prev, responsible_person: event.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="acquisition_date">Дата приобретения</Label>
                                    <Input
                                        id="acquisition_date"
                                        type="date"
                                        value={editForm.acquisition_date}
                                        onChange={(event) => setEditForm((prev) => ({ ...prev, acquisition_date: event.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="last_inventory_date">Последняя инвентаризация</Label>
                                    <Input
                                        id="last_inventory_date"
                                        type="date"
                                        value={editForm.last_inventory_date}
                                        onChange={(event) => setEditForm((prev) => ({ ...prev, last_inventory_date: event.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <div className="text-sm font-medium">Паспорт растения</div>
                                <div className="text-sm text-muted-foreground">Физические параметры, состояние и осмотры.</div>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                <div className="space-y-2">
                                    <Label htmlFor="plant_type">Вид растения</Label>
                                    <Input
                                        id="plant_type"
                                        value={editForm.plant_type}
                                        onChange={(event) => setEditForm((prev) => ({ ...prev, plant_type: event.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="height_value">Высота</Label>
                                    <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
                                        <Input
                                            id="height_value"
                                            min="0"
                                            step="0.01"
                                            type="number"
                                            value={editForm.height_value}
                                            onChange={(event) => setEditForm((prev) => ({ ...prev, height_value: event.target.value }))}
                                        />
                                        <Input
                                            value={editForm.height_unit}
                                            onChange={(event) => setEditForm((prev) => ({ ...prev, height_unit: event.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="trunk_diameter_value">Диаметр ствола</Label>
                                    <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
                                        <Input
                                            id="trunk_diameter_value"
                                            min="0"
                                            step="0.01"
                                            type="number"
                                            value={editForm.trunk_diameter_value}
                                            onChange={(event) => setEditForm((prev) => ({ ...prev, trunk_diameter_value: event.target.value }))}
                                        />
                                        <Input
                                            value={editForm.trunk_diameter_unit}
                                            onChange={(event) => setEditForm((prev) => ({ ...prev, trunk_diameter_unit: event.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="condition_text">Состояние</Label>
                                    <Input
                                        id="condition_text"
                                        value={editForm.condition_text}
                                        onChange={(event) => setEditForm((prev) => ({ ...prev, condition_text: event.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="gps_coordinates">Координаты</Label>
                                    <Input
                                        id="gps_coordinates"
                                        value={editForm.gps_coordinates}
                                        onChange={(event) => setEditForm((prev) => ({ ...prev, gps_coordinates: event.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="last_inspection_date">Последний осмотр</Label>
                                    <Input
                                        id="last_inspection_date"
                                        type="date"
                                        value={editForm.last_inspection_date}
                                        onChange={(event) => setEditForm((prev) => ({ ...prev, last_inspection_date: event.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="watering_frequency_days">Полив, дней</Label>
                                    <Input
                                        id="watering_frequency_days"
                                        min="0"
                                        type="number"
                                        value={editForm.watering_frequency_days}
                                        onChange={(event) => setEditForm((prev) => ({ ...prev, watering_frequency_days: event.target.value }))}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="fertilizing_frequency_days">Подкормка, дней</Label>
                                    <Input
                                        id="fertilizing_frequency_days"
                                        min="0"
                                        type="number"
                                        value={editForm.fertilizing_frequency_days}
                                        onChange={(event) => setEditForm((prev) => ({ ...prev, fertilizing_frequency_days: event.target.value }))}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="condition_notes">Примечание по состоянию</Label>
                                <Textarea
                                    id="condition_notes"
                                    rows={4}
                                    value={editForm.condition_notes}
                                    onChange={(event) => setEditForm((prev) => ({ ...prev, condition_notes: event.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="notes">Общее примечание</Label>
                                <Textarea
                                    id="notes"
                                    rows={4}
                                    value={editForm.notes}
                                    onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))}
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                                Отмена
                            </Button>
                            <Button type="submit" disabled={savingPlant}>
                                {savingPlant ? 'Сохранение...' : 'Сохранить изменения'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
