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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
    buildGreenlogLocationMeta,
    buildGreenlogLocationSearchValue,
    buildGreenlogLocationSubtitle,
    buildGreenlogLocationTitle,
    clampGreenlogMarkerSize,
} from '@/components/greenlog/GREENLOG_LOCATIONS';
import { GreenlogTerminalScheme } from '@/components/greenlog/GreenlogTerminalScheme';
import {
    createGreenlogLocation,
    deleteGreenlogLocation,
    getGreenlogLocationPlants,
    getGreenlogLocations,
    type GreenlogLocation,
    type GreenlogPlant,
    updateGreenlogLocation,
} from '@/lib/greenlog-api';
import { greenlogMoneyLabel, plantCategoryLabel, plantCostSourceLabel, plantStatusLabel } from '@/lib/greenlog-labels';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { Building2, Crosshair, Leaf, MapPinned, Pencil, Plus, Search, Trash2, Trees } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

const SHIN_LINE_FLORA_MAP_PATH = '/images/shin-line-flora-map.png';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Shin Line Flora', href: '/greenlog' },
    { title: 'Локации', href: '/greenlog/locations' },
];

type LocationForm = {
    building: string;
    floor: string;
    room: string;
    factory_zone: string;
    sector: string;
    description: string;
    parent_id: string;
    type: string;
};

const locationTypes = [
    { value: 'office', label: 'Офис' },
    { value: 'factory_zone', label: 'Заводская зона' },
    { value: 'sector', label: 'Сектор' },
    { value: 'room', label: 'Комната' },
];

const emptyForm: LocationForm = {
    building: '',
    floor: '',
    room: '',
    factory_zone: '',
    sector: '',
    description: '',
    parent_id: 'none',
    type: 'office',
};

const buildLocationAddress = (location?: Partial<GreenlogLocation> | null) => (
    location ? buildGreenlogLocationSubtitle(location as GreenlogLocation) : 'Локация без точного адреса'
);

const buildPlantTitle = (plant: GreenlogPlant) => plant.species?.name || plant.name || `Растение #${plant.id}`;

const locationTypeLabel = (value?: string | null) => locationTypes.find((item) => item.value === value)?.label ?? value ?? '—';

export default function GreenLogLocationsIndex() {
    const [locations, setLocations] = useState<GreenlogLocation[]>([]);
    const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
    const [selectedPlants, setSelectedPlants] = useState<GreenlogPlant[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [plantsLoading, setPlantsLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [placementSaving, setPlacementSaving] = useState(false);
    const [markerSizeSaving, setMarkerSizeSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [plantsError, setPlantsError] = useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingLocation, setEditingLocation] = useState<GreenlogLocation | null>(null);
    const [placementLocationId, setPlacementLocationId] = useState<number | null>(null);
    const [form, setForm] = useState<LocationForm>(emptyForm);

    const filteredLocations = useMemo(() => {
        const query = search.trim().toLowerCase();
        const sorted = [...locations].sort((a, b) =>
            buildGreenlogLocationTitle(a).localeCompare(buildGreenlogLocationTitle(b), 'ru'),
        );

        if (query === '') {
            return sorted;
        }

        return sorted.filter((location) => buildGreenlogLocationSearchValue(location).includes(query));
    }, [locations, search]);

    const selectedLocation = useMemo(
        () => locations.find((location) => location.id === selectedLocationId) ?? null,
        [locations, selectedLocationId],
    );

    const placementLocation = useMemo(
        () => locations.find((location) => location.id === placementLocationId) ?? null,
        [locations, placementLocationId],
    );

    const applyLocationUpdate = (locationId: number, updates: Partial<GreenlogLocation>) => {
        setLocations((current) => current.map((location) => (
            location.id === locationId ? { ...location, ...updates } : location
        )));
    };

    const loadLocations = async (nextSelectedLocationId?: number | null) => {
        try {
            setLoading(true);
            setError(null);
            const data = await getGreenlogLocations();

            setLocations(data);
            setSelectedLocationId((previous) => (
                nextSelectedLocationId !== undefined ? nextSelectedLocationId : previous ?? data[0]?.id ?? null
            ));
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить локации Shin Line Flora.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadLocations();
    }, []);

    useEffect(() => {
        if (!selectedLocationId && filteredLocations[0]) {
            setSelectedLocationId(filteredLocations[0].id);
        }
    }, [filteredLocations, selectedLocationId]);

    useEffect(() => {
        if (!selectedLocationId) {
            setSelectedPlants([]);
            return;
        }

        let isMounted = true;

        const loadPlants = async () => {
            try {
                setPlantsLoading(true);
                setPlantsError(null);
                const data = await getGreenlogLocationPlants(selectedLocationId);

                if (isMounted) {
                    setSelectedPlants(data);
                }
            } catch (loadError) {
                if (isMounted) {
                    setPlantsError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить растения локации.');
                }
            } finally {
                if (isMounted) {
                    setPlantsLoading(false);
                }
            }
        };

        void loadPlants();

        return () => {
            isMounted = false;
        };
    }, [selectedLocationId]);

    const openCreateDialog = () => {
        setEditingLocation(null);
        setForm(emptyForm);
        setIsDialogOpen(true);
    };

    const openEditDialog = (location: GreenlogLocation) => {
        setEditingLocation(location);
        setForm({
            building: location.building ?? '',
            floor: location.floor ?? '',
            room: location.room ?? '',
            factory_zone: location.factory_zone ?? '',
            sector: location.sector ?? '',
            description: location.description ?? '',
            parent_id: location.parent_id ? String(location.parent_id) : 'none',
            type: location.type ?? 'office',
        });
        setIsDialogOpen(true);
    };

    const resetDialog = () => {
        setIsDialogOpen(false);
        setEditingLocation(null);
        setForm(emptyForm);
    };

    const submitForm = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        try {
            setSaving(true);
            const payload = {
                building: form.building.trim() || null,
                floor: form.floor.trim() || null,
                room: form.room.trim() || null,
                factory_zone: form.factory_zone.trim() || null,
                sector: form.sector.trim() || null,
                description: form.description.trim() || null,
                parent_id: form.parent_id === 'none' ? null : Number(form.parent_id),
                type: form.type || null,
            };

            if (editingLocation) {
                const updatedLocation = await updateGreenlogLocation(editingLocation.id, payload);
                toast.success('Локация обновлена');
                applyLocationUpdate(editingLocation.id, updatedLocation);
                resetDialog();
                await loadLocations(editingLocation.id);
                return;
            }

            const createdLocation = await createGreenlogLocation(payload);
            toast.success('Локация создана. Теперь выберите точку на карте.');
            resetDialog();
            setSelectedLocationId(createdLocation.id);
            setPlacementLocationId(createdLocation.id);
            await loadLocations(createdLocation.id);
        } catch (submitError) {
            toast.error(submitError instanceof Error ? submitError.message : 'Не удалось сохранить локацию.');
        } finally {
            setSaving(false);
        }
    };

    const startPlacement = (location: GreenlogLocation) => {
        setSelectedLocationId(location.id);
        setPlacementLocationId(location.id);
        toast.info('Кликните по карте, чтобы сохранить точку локации.');
    };

    const handlePlaceLocation = async ({ map_x, map_y }: { map_x: number; map_y: number }) => {
        if (!placementLocation) {
            return;
        }

        try {
            setPlacementSaving(true);
            const updatedLocation = await updateGreenlogLocation(placementLocation.id, {
                map_x,
                map_y,
            });

            applyLocationUpdate(placementLocation.id, updatedLocation);
            setSelectedLocationId(placementLocation.id);
            setPlacementLocationId(null);
            toast.success('Точка на карте сохранена');
        } catch (placementError) {
            toast.error(placementError instanceof Error ? placementError.message : 'Не удалось сохранить точку локации.');
            await loadLocations(placementLocation.id);
        } finally {
            setPlacementSaving(false);
        }
    };

    const handleMarkerSizeChange = async (location: GreenlogLocation, nextSize: number) => {
        const markerSize = clampGreenlogMarkerSize(nextSize);

        if (clampGreenlogMarkerSize(location.marker_size) === markerSize) {
            return;
        }

        applyLocationUpdate(location.id, { marker_size: markerSize });

        try {
            setMarkerSizeSaving(true);
            const updatedLocation = await updateGreenlogLocation(location.id, {
                marker_size: markerSize,
            });

            applyLocationUpdate(location.id, updatedLocation);
        } catch (markerSizeError) {
            toast.error(markerSizeError instanceof Error ? markerSizeError.message : 'Не удалось сохранить размер точки.');
            await loadLocations(location.id);
        } finally {
            setMarkerSizeSaving(false);
        }
    };

    const removeLocation = async (location: GreenlogLocation) => {
        if (!window.confirm(`Удалить локацию "${buildGreenlogLocationTitle(location)}"?`)) {
            return;
        }

        try {
            await deleteGreenlogLocation(location.id);
            toast.success('Локация удалена');
            setPlacementLocationId((current) => current === location.id ? null : current);

            const nextLocationId = selectedLocationId === location.id
                ? filteredLocations.find((item) => item.id !== location.id)?.id ?? null
                : selectedLocationId;

            await loadLocations(nextLocationId);
        } catch (deleteError) {
            toast.error(deleteError instanceof Error ? deleteError.message : 'Не удалось удалить локацию.');
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Локации" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                        <h1 className="flex items-center gap-2 text-lg font-semibold">
                            <MapPinned className="h-5 w-5 text-green-700" />
                            Локации
                        </h1>
                        <p className="text-muted-foreground text-sm">
                            Общая карта Shin Line Flora, точки локаций и список растений по выбранной зоне.
                        </p>
                    </div>
                    <Button onClick={openCreateDialog}>
                        <Plus className="h-4 w-4" />
                        Добавить локацию
                    </Button>
                </div>

                {error ? (
                    <Alert variant="destructive">
                        <AlertTitle>Ошибка загрузки</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                ) : null}

                <Card className="py-0">
                    <CardHeader className="gap-4">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Leaf className="h-5 w-5 text-green-700" />
                                    Карта Shin Line Flora
                                </CardTitle>
                                <CardDescription>
                                    PNG-карта компании из `public/images/shin-line-flora-map.png` с точками поверх изображения.
                                </CardDescription>
                            </div>
                            <div className="flex w-full flex-col gap-3 sm:flex-row xl:max-w-[520px] xl:justify-end">
                                <div className="relative flex-1">
                                    <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                    <Input
                                        className="pl-9"
                                        placeholder="Поиск по корпусу, комнате, зоне, сектору"
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                    />
                                </div>
                                <Badge variant="outline" className="justify-center px-3 py-2">
                                    Локаций: {locations.length}
                                </Badge>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pb-6">
                        {loading ? (
                            <Skeleton className="h-[720px] w-full rounded-3xl" />
                        ) : (
                            <GreenlogTerminalScheme
                                locations={locations}
                                mapAssetPath={SHIN_LINE_FLORA_MAP_PATH}
                                selectedLocationId={selectedLocationId}
                                onSelectLocation={setSelectedLocationId}
                                placementLocation={placementLocation}
                                onPlaceLocation={placementLocation ? handlePlaceLocation : undefined}
                            />
                        )}

                        {placementLocation ? (
                            <div className="flex justify-end">
                                <Button
                                    variant="outline"
                                    onClick={() => setPlacementLocationId(null)}
                                    disabled={placementSaving}
                                >
                                    Отменить выбор точки
                                </Button>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>

                <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
                    <Card className="py-0">
                        <CardHeader className="pb-3">
                            <CardTitle>Список локаций</CardTitle>
                            <CardDescription>
                                Выберите локацию из списка и задайте для нее точку на общей карте компании.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pb-6">
                            {loading ? (
                                <div className="space-y-3">
                                    <Skeleton className="h-24 w-full" />
                                    <Skeleton className="h-24 w-full" />
                                    <Skeleton className="h-24 w-full" />
                                </div>
                            ) : null}

                            {!loading && filteredLocations.length === 0 ? (
                                <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center">
                                    Локации не найдены.
                                </div>
                            ) : null}

                            {!loading && filteredLocations.length > 0 ? (
                                <ScrollArea className="h-[720px] pr-3">
                                    <div className="space-y-3">
                                        {filteredLocations.map((location) => {
                                            const isSelected = selectedLocationId === location.id;
                                            const hasPoint = location.map_x !== null && location.map_y !== null;

                                            return (
                                                <button
                                                    key={location.id}
                                                    type="button"
                                                    onClick={() => setSelectedLocationId(location.id)}
                                                    className={`w-full rounded-xl border p-4 text-left transition ${
                                                        isSelected
                                                            ? 'border-green-300 bg-green-50 shadow-sm'
                                                            : 'border-border bg-card hover:bg-muted/40'
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-semibold">{buildGreenlogLocationTitle(location)}</div>
                                                            <div className="text-muted-foreground mt-1 text-xs">{buildLocationAddress(location)}</div>
                                                        </div>
                                                        <Badge variant="secondary" className="shrink-0">
                                                            {location.plants_count ?? 0}
                                                        </Badge>
                                                    </div>
                                                    <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-xs">
                                                        <span>{buildGreenlogLocationMeta(location) || location.description || locationTypeLabel(location.type)}</span>
                                                        <span className={`rounded-full px-2 py-0.5 ${hasPoint ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>
                                                            {hasPoint ? 'Точка выбрана' : 'Без точки'}
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </ScrollArea>
                            ) : null}
                        </CardContent>
                    </Card>

                    <Card className="py-0">
                        <CardHeader className="pb-3">
                            <CardTitle>Выбранная локация</CardTitle>
                            <CardDescription>
                                Карточка локации, растения внутри нее и управление точкой на карте.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 pb-6">
                            {!selectedLocation && !loading ? (
                                <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center">
                                    Выберите локацию из списка или кликните по точке на карте.
                                </div>
                            ) : null}

                            {selectedLocation ? (
                                <>
                                    <div className="rounded-2xl border p-4">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <div className="flex items-center gap-2 text-base font-semibold">
                                                    <Building2 className="h-4 w-4 text-green-700" />
                                                    {buildGreenlogLocationTitle(selectedLocation)}
                                                </div>
                                                <div className="text-muted-foreground mt-1 text-sm">
                                                    {buildLocationAddress(selectedLocation)}
                                                </div>
                                            </div>
                                            <Badge variant="outline">
                                                {selectedLocation.plants_count ?? selectedPlants.length} растений
                                            </Badge>
                                        </div>

                                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                            <div className="rounded-lg border bg-muted/20 p-3">
                                                <div className="text-muted-foreground text-xs">Тип</div>
                                                <div className="font-medium">{locationTypeLabel(selectedLocation.type)}</div>
                                            </div>
                                            <div className="rounded-lg border bg-muted/20 p-3">
                                                <div className="text-muted-foreground text-xs">Корпус</div>
                                                <div className="font-medium">{selectedLocation.building || '—'}</div>
                                            </div>
                                            <div className="rounded-lg border bg-muted/20 p-3">
                                                <div className="text-muted-foreground text-xs">Комната</div>
                                                <div className="font-medium">{selectedLocation.room || '—'}</div>
                                            </div>
                                            <div className="rounded-lg border bg-muted/20 p-3">
                                                <div className="text-muted-foreground text-xs">Зона</div>
                                                <div className="font-medium">{selectedLocation.factory_zone || '—'}</div>
                                            </div>
                                            <div className="rounded-lg border bg-muted/20 p-3">
                                                <div className="text-muted-foreground text-xs">Сектор</div>
                                                <div className="font-medium">{selectedLocation.sector || '—'}</div>
                                            </div>
                                            <div className="rounded-lg border bg-muted/20 p-3">
                                                <div className="text-muted-foreground text-xs">Точка на карте</div>
                                                <div className="font-medium">
                                                    {selectedLocation.map_x !== null && selectedLocation.map_y !== null
                                                        ? `${selectedLocation.map_x}% / ${selectedLocation.map_y}%`
                                                        : 'Не выбрана'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-4 text-sm">
                                            <div className="font-medium">Описание</div>
                                            <div className="text-muted-foreground mt-1">
                                                {selectedLocation.description || 'Описание для этой локации пока не заполнено.'}
                                            </div>
                                        </div>

                                        <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_220px]">
                                            <div className="space-y-3">
                                                <Label htmlFor="marker_size">Размер точки</Label>
                                                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                                                    <Input
                                                        id="marker_size"
                                                        type="range"
                                                        min="6"
                                                        max="32"
                                                        value={clampGreenlogMarkerSize(selectedLocation.marker_size)}
                                                        onChange={(event) => void handleMarkerSizeChange(selectedLocation, event.currentTarget.valueAsNumber)}
                                                    />
                                                    <Input
                                                        className="w-full md:w-24"
                                                        type="number"
                                                        min="6"
                                                        max="32"
                                                        value={clampGreenlogMarkerSize(selectedLocation.marker_size)}
                                                        onChange={(event) => {
                                                            const nextValue = event.currentTarget.valueAsNumber;

                                                            if (!Number.isNaN(nextValue)) {
                                                                void handleMarkerSizeChange(selectedLocation, nextValue);
                                                            }
                                                        }}
                                                    />
                                                </div>
                                                <div className="text-muted-foreground text-xs">
                                                    {markerSizeSaving ? 'Сохраняем размер точки...' : 'Минимум 6px, максимум 32px. По умолчанию используется 10px.'}
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-2">
                                                <Button variant="outline" onClick={() => openEditDialog(selectedLocation)}>
                                                    <Pencil className="h-4 w-4" />
                                                    Изменить
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => startPlacement(selectedLocation)}
                                                    disabled={placementSaving}
                                                >
                                                    <Crosshair className="h-4 w-4" />
                                                    Изменить точку
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => startPlacement(selectedLocation)}
                                                    disabled={placementSaving}
                                                >
                                                    <MapPinned className="h-4 w-4" />
                                                    Выбрать точку на карте
                                                </Button>
                                                <Button variant="destructive" onClick={() => void removeLocation(selectedLocation)}>
                                                    <Trash2 className="h-4 w-4" />
                                                    Удалить
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    {plantsError ? (
                                        <Alert variant="destructive">
                                            <AlertTitle>Ошибка загрузки растений</AlertTitle>
                                            <AlertDescription>{plantsError}</AlertDescription>
                                        </Alert>
                                    ) : null}

                                    <div className="rounded-2xl border p-4">
                                        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                                            <Trees className="h-4 w-4 text-green-700" />
                                            Растения в локации
                                        </div>

                                        {plantsLoading ? (
                                            <div className="space-y-2">
                                                <Skeleton className="h-16 w-full" />
                                                <Skeleton className="h-16 w-full" />
                                            </div>
                                        ) : null}

                                        {!plantsLoading && selectedPlants.length === 0 ? (
                                            <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center">
                                                В этой локации пока нет растений.
                                            </div>
                                        ) : null}

                                        {!plantsLoading && selectedPlants.length > 0 ? (
                                            <div className="space-y-2">
                                                {selectedPlants.map((plant) => (
                                                    <div key={plant.id} className="rounded-xl border p-3">
                                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                                            <div>
                                                                <div className="font-medium">{buildPlantTitle(plant)}</div>
                                                                <div className="text-muted-foreground text-xs">{plant.inventory_number}</div>
                                                            </div>
                                                            <div className="text-right text-xs">
                                                                <div>Кол-во: {plant.quantity ?? 1}</div>
                                                                <div>Цена: {greenlogMoneyLabel(plant.unit_cost)}</div>
                                                                <div>Сумма: {greenlogMoneyLabel(plant.total_cost)}</div>
                                                            </div>
                                                        </div>
                                                        <div className="text-muted-foreground mt-2 flex flex-wrap gap-3 text-xs">
                                                            <span>{plantStatusLabel(plant.status)}</span>
                                                            <span>{plantCategoryLabel(plant.category)}</span>
                                                            <span>{plantCostSourceLabel(plant.cost_source)}</span>
                                                        </div>
                                                        <div className="mt-3">
                                                            <Button asChild size="sm" variant="outline">
                                                                <Link href={`/greenlog/plants/${plant.id}`}>Открыть растение</Link>
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                </>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={(open) => (!open ? resetDialog() : setIsDialogOpen(open))}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingLocation ? 'Редактирование локации' : 'Новая локация'}</DialogTitle>
                        <DialogDescription>
                            Сначала сохраните параметры локации. Точку на общей карте Shin Line Flora можно выбрать отдельным кликом по PNG-карте.
                        </DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4" onSubmit={submitForm}>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="building">Корпус</Label>
                                <Input id="building" value={form.building} onChange={(event) => setForm((prev) => ({ ...prev, building: event.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="floor">Этаж</Label>
                                <Input id="floor" value={form.floor} onChange={(event) => setForm((prev) => ({ ...prev, floor: event.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="room">Комната</Label>
                                <Input id="room" value={form.room} onChange={(event) => setForm((prev) => ({ ...prev, room: event.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="factory_zone">Заводская зона</Label>
                                <Input id="factory_zone" value={form.factory_zone} onChange={(event) => setForm((prev) => ({ ...prev, factory_zone: event.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="sector">Сектор</Label>
                                <Input id="sector" value={form.sector} onChange={(event) => setForm((prev) => ({ ...prev, sector: event.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label>Тип</Label>
                                <Select value={form.type} onValueChange={(value) => setForm((prev) => ({ ...prev, type: value }))}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {locationTypes.map((type) => (
                                            <SelectItem key={type.value} value={type.value}>
                                                {type.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label>Родительская локация</Label>
                                <Select value={form.parent_id} onValueChange={(value) => setForm((prev) => ({ ...prev, parent_id: value }))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Без родителя" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Без родителя</SelectItem>
                                        {locations
                                            .filter((location) => location.id !== editingLocation?.id)
                                            .map((location) => (
                                                <SelectItem key={location.id} value={String(location.id)}>
                                                    {buildGreenlogLocationTitle(location)}
                                                </SelectItem>
                                            ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Описание</Label>
                            <Textarea
                                id="description"
                                rows={4}
                                value={form.description}
                                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                            />
                        </div>

                        <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-sm">
                            <div className="font-medium">Выбор точки на карте</div>
                            <div className="text-muted-foreground mt-1">
                                После сохранения используйте кнопки «Выбрать точку на карте» или «Изменить точку». Координаты будут сохранены как `map_x` и `map_y` в процентах.
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={resetDialog}>
                                Отмена
                            </Button>
                            <Button type="submit" disabled={saving}>
                                {saving ? 'Сохранение...' : editingLocation ? 'Сохранить' : 'Создать'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
