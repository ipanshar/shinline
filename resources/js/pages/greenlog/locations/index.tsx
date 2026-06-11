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
    buildGreenlogLocationTitle,
    clampGreenlogMarkerSize,
} from '@/components/greenlog/GREENLOG_LOCATIONS';
import { LocationDetailsPanel } from '@/components/greenlog/map/LocationDetailsPanel';
import { MapToolbar } from '@/components/greenlog/map/MapToolbar';
import { ShinLineFloraKonvaMap } from '@/components/greenlog/map/ShinLineFloraKonvaMap';
import { UnplacedLocationsPanel } from '@/components/greenlog/map/UnplacedLocationsPanel';
import {
    createGreenlogLocation,
    deleteGreenlogLocation,
    getGreenlogLocationPlants,
    getGreenlogLocations,
    type GreenlogLocation,
    type GreenlogPlant,
    updateGreenlogLocation,
} from '@/lib/greenlog-api';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Leaf, Plus, Search, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
    clampMapPercent,
    clampRectangleOrigin,
    DEFAULT_RECTANGLE_HEIGHT,
    DEFAULT_RECTANGLE_WIDTH,
    clampZoom,
    getLocationShape,
    getPolygonAnchor,
    hasMapPoint,
    hasRenderableShape,
    normalizePolygonPoints,
    type GreenlogPolygonPoint,
    type GreenlogMapShape,
} from '@/components/greenlog/map/map-utils';

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
    const [shapeSaving, setShapeSaving] = useState(false);
    const [dimensionsSaving, setDimensionsSaving] = useState(false);
    const [polygonSaving, setPolygonSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [plantsError, setPlantsError] = useState<string | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingLocation, setEditingLocation] = useState<GreenlogLocation | null>(null);
    const [placementLocationId, setPlacementLocationId] = useState<number | null>(null);
    const [polygonDraftLocationId, setPolygonDraftLocationId] = useState<number | null>(null);
    const [polygonDraftPoints, setPolygonDraftPoints] = useState<GreenlogPolygonPoint[]>([]);
    const [gridEnabled, setGridEnabled] = useState(true);
    const [panEnabled, setPanEnabled] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [mapZoom, setMapZoom] = useState(1);
    const [mapViewport, setMapViewport] = useState({ x: 0, y: 0 });
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

    const polygonDraftLocation = useMemo(
        () => locations.find((location) => location.id === polygonDraftLocationId) ?? null,
        [locations, polygonDraftLocationId],
    );

    const unplacedLocations = useMemo(
        () => filteredLocations.filter((location) => !hasRenderableShape(location)),
        [filteredLocations],
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
        if (getLocationShape(location) === 'polygon') {
            toast.info('Для полигона используйте режим построения вершин.');
            return;
        }

        setPolygonDraftLocationId(null);
        setPolygonDraftPoints([]);
        setSelectedLocationId(location.id);
        setPlacementLocationId(location.id);
        setPanEnabled(false);
        toast.info(getLocationShape(location) === 'rectangle'
            ? 'Кликните по карте, чтобы сохранить верхний левый угол зоны.'
            : 'Кликните по карте, чтобы сохранить точку локации.');
    };

    const handlePlaceLocation = async ({ map_x, map_y }: { map_x: number; map_y: number }) => {
        if (!placementLocation) {
            return;
        }

        try {
            setPlacementSaving(true);
            const shape = getLocationShape(placementLocation);
            const updatedLocation = await updateGreenlogLocation(placementLocation.id, {
                map_x,
                map_y,
                ...(shape === 'rectangle' ? {
                    map_width: placementLocation.map_width ?? DEFAULT_RECTANGLE_WIDTH,
                    map_height: placementLocation.map_height ?? DEFAULT_RECTANGLE_HEIGHT,
                } : {}),
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

    const startPolygonEditing = (location: GreenlogLocation) => {
        setPlacementLocationId(null);
        setPanEnabled(false);
        setSelectedLocationId(location.id);
        setPolygonDraftLocationId(location.id);
        setPolygonDraftPoints(normalizePolygonPoints(location));
        toast.info('Кликайте по карте, чтобы добавить вершины полигона.');
    };

    const addPolygonPoint = (point: GreenlogPolygonPoint) => {
        setPolygonDraftPoints((current) => [...current, point]);
    };

    const cancelPolygonEditing = () => {
        setPolygonDraftLocationId(null);
        setPolygonDraftPoints([]);
    };

    const removeLastPolygonPoint = () => {
        setPolygonDraftPoints((current) => current.slice(0, -1));
    };

    const savePolygon = async () => {
        if (!polygonDraftLocation) {
            return;
        }

        if (polygonDraftPoints.length < 3) {
            toast.error('Для полигона нужно передать минимум 3 точки.');
            return;
        }

        const anchor = getPolygonAnchor(polygonDraftPoints);
        const payload: Partial<GreenlogLocation> = {
            map_shape: 'polygon',
            map_polygon: polygonDraftPoints,
            map_x: anchor?.x ?? null,
            map_y: anchor?.y ?? null,
        };

        applyLocationUpdate(polygonDraftLocation.id, payload);

        try {
            setPolygonSaving(true);
            const updatedLocation = await updateGreenlogLocation(polygonDraftLocation.id, payload);
            applyLocationUpdate(polygonDraftLocation.id, updatedLocation);
            setPolygonDraftLocationId(null);
            setPolygonDraftPoints([]);
            toast.success('Полигон сохранён');
        } catch (polygonError) {
            toast.error(polygonError instanceof Error ? polygonError.message : 'Не удалось сохранить полигон.');
            await loadLocations(polygonDraftLocation.id);
        } finally {
            setPolygonSaving(false);
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

    const handleMoveLocation = async (
        location: GreenlogLocation,
        { map_x, map_y }: { map_x: number; map_y: number; map_width?: number; map_height?: number },
    ) => {
        applyLocationUpdate(location.id, { map_x, map_y });

        try {
            const updatedLocation = await updateGreenlogLocation(location.id, {
                map_x,
                map_y,
            });

            applyLocationUpdate(location.id, updatedLocation);
            toast.success('Координаты локации обновлены');
        } catch (moveError) {
            toast.error(moveError instanceof Error ? moveError.message : 'Не удалось сохранить новые координаты.');
            await loadLocations(location.id);
        }
    };

    const handleMovePolygon = async (
        location: GreenlogLocation,
        { map_x, map_y, map_polygon }: { map_x: number; map_y: number; map_polygon: GreenlogPolygonPoint[] },
    ) => {
        const payload: Partial<GreenlogLocation> = {
            map_shape: 'polygon',
            map_x,
            map_y,
            map_polygon,
        };

        applyLocationUpdate(location.id, payload);

        try {
            const updatedLocation = await updateGreenlogLocation(location.id, payload);
            applyLocationUpdate(location.id, updatedLocation);
            toast.success('Полигон перемещён');
        } catch (moveError) {
            toast.error(moveError instanceof Error ? moveError.message : 'Не удалось переместить полигон.');
            await loadLocations(location.id);
        }
    };

    const handleShapeChange = async (location: GreenlogLocation, shape: GreenlogMapShape) => {
        const payload: Partial<GreenlogLocation> = {
            map_shape: shape,
        };

        if (shape === 'rectangle') {
            const nextWidth = location.map_width ?? DEFAULT_RECTANGLE_WIDTH;
            const nextHeight = location.map_height ?? DEFAULT_RECTANGLE_HEIGHT;
            const centerX = location.map_x ?? 0;
            const centerY = location.map_y ?? 0;

            payload.map_width = nextWidth;
            payload.map_height = nextHeight;
            payload.map_x = clampRectangleOrigin(centerX - (nextWidth / 2), nextWidth);
            payload.map_y = clampRectangleOrigin(centerY - (nextHeight / 2), nextHeight);
        }

        applyLocationUpdate(location.id, payload);

        try {
            setShapeSaving(true);
            const updatedLocation = await updateGreenlogLocation(location.id, payload);
            applyLocationUpdate(location.id, updatedLocation);
            toast.success('Форма локации обновлена');
        } catch (shapeError) {
            toast.error(shapeError instanceof Error ? shapeError.message : 'Не удалось сохранить форму локации.');
            await loadLocations(location.id);
        } finally {
            setShapeSaving(false);
        }
    };

    const handleRectangleSizeChange = async (
        location: GreenlogLocation,
        nextSize: { map_width: number; map_height: number },
    ) => {
        const currentWidth = location.map_width ?? DEFAULT_RECTANGLE_WIDTH;
        const currentHeight = location.map_height ?? DEFAULT_RECTANGLE_HEIGHT;
        const currentX = location.map_x ?? 0;
        const currentY = location.map_y ?? 0;
        const centerX = currentX + (currentWidth / 2);
        const centerY = currentY + (currentHeight / 2);

        const payload = {
            map_width: nextSize.map_width,
            map_height: nextSize.map_height,
            map_x: clampRectangleOrigin(centerX - (nextSize.map_width / 2), nextSize.map_width),
            map_y: clampRectangleOrigin(centerY - (nextSize.map_height / 2), nextSize.map_height),
        };

        applyLocationUpdate(location.id, payload);

        try {
            setDimensionsSaving(true);
            const updatedLocation = await updateGreenlogLocation(location.id, payload);
            applyLocationUpdate(location.id, updatedLocation);
            toast.success('Размер зоны обновлён');
        } catch (dimensionsError) {
            toast.error(dimensionsError instanceof Error ? dimensionsError.message : 'Не удалось сохранить размеры зоны.');
            await loadLocations(location.id);
        } finally {
            setDimensionsSaving(false);
        }
    };

    const resetMapView = () => {
        setMapZoom(1);
        setMapViewport({ x: 0, y: 0 });
        setPanEnabled(false);
    };

    const removeLocation = async (location: GreenlogLocation) => {
        if (!window.confirm(`Удалить локацию "${buildGreenlogLocationTitle(location)}"?`)) {
            return;
        }

        try {
            await deleteGreenlogLocation(location.id);
            toast.success('Локация удалена');
            setPlacementLocationId((current) => current === location.id ? null : current);
            setPolygonDraftLocationId((current) => current === location.id ? null : current);
            setPolygonDraftPoints((current) => polygonDraftLocationId === location.id ? [] : current);

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
                        <h1 className="text-lg font-semibold">Локации</h1>
                        <p className="text-muted-foreground text-sm">
                            Общая карта Shin Line Flora на `react-konva`, точки локаций и привязка растений к местам завода.
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
                                    Приоритетный путь карты: `public/images/shin-line-flora-map.jpeg`, fallback: `public/images/shin-line-flora-map.png`.
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
                        <MapToolbar
                            canEdit
                            gridEnabled={gridEnabled}
                            panEnabled={panEnabled}
                            zoom={mapZoom}
                            mappedCount={locations.filter((location) => hasRenderableShape(location)).length}
                            placementMode={Boolean(placementLocation)}
                            editMode={editMode}
                            onToggleGrid={setGridEnabled}
                            onTogglePan={setPanEnabled}
                            onToggleEditMode={setEditMode}
                            onZoomIn={() => setMapZoom((current) => clampZoom(current + 0.2))}
                            onZoomOut={() => setMapZoom((current) => clampZoom(current - 0.2))}
                            onResetView={resetMapView}
                        />

                        {loading ? (
                            <Skeleton className="h-[720px] w-full rounded-3xl" />
                        ) : (
                            <ShinLineFloraKonvaMap
                                locations={locations}
                                selectedLocationId={selectedLocationId}
                                placementLocation={placementLocation}
                                polygonDraft={polygonDraftLocationId ? { locationId: polygonDraftLocationId, points: polygonDraftPoints } : null}
                                gridEnabled={gridEnabled}
                                panEnabled={panEnabled}
                                editMode={editMode}
                                zoom={mapZoom}
                                viewport={mapViewport}
                                canEdit
                                onSelectLocation={setSelectedLocationId}
                                onPlaceLocation={handlePlaceLocation}
                                onAddPolygonPoint={addPolygonPoint}
                                onMovePolygon={handleMovePolygon}
                                onMoveLocation={handleMoveLocation}
                                onViewportChange={setMapViewport}
                            />
                        )}

                        {placementLocation || polygonDraftLocationId ? (
                            <div className="flex justify-end">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setPlacementLocationId(null);
                                        cancelPolygonEditing();
                                    }}
                                    disabled={placementSaving || polygonSaving}
                                >
                                    Отменить режим карты
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
                                Выберите локацию для просмотра, удаления или установки точки на карте.
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
                                            const hasPoint = hasRenderableShape(location);

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
                                                            <div className="text-muted-foreground mt-1 text-xs">
                                                                {buildGreenlogLocationMeta(location) || location.description || 'Без уточнения'}
                                                            </div>
                                                        </div>
                                                        <Badge variant="secondary" className="shrink-0">
                                                            {location.plants_count ?? 0}
                                                        </Badge>
                                                    </div>
                                                    <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-2 text-xs">
                                                        <span>{locationTypeLabel(location.type)}</span>
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
                                Детальная карточка локации, размер точки и список растений.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 pb-6">
                            <LocationDetailsPanel
                                location={selectedLocation}
                                plants={selectedPlants}
                                plantsLoading={plantsLoading}
                                plantsError={plantsError}
                                markerSizeSaving={markerSizeSaving}
                                shapeSaving={shapeSaving}
                                dimensionsSaving={dimensionsSaving}
                                polygonEditing={polygonDraftLocationId === selectedLocation?.id}
                                polygonSaving={polygonSaving}
                                polygonDraftPoints={polygonDraftLocationId === selectedLocation?.id ? polygonDraftPoints : []}
                                onEditLocation={openEditDialog}
                                onStartPlacement={startPlacement}
                                onCommitMarkerSize={handleMarkerSizeChange}
                                onCommitShape={handleShapeChange}
                                onCommitRectangleSize={handleRectangleSizeChange}
                                onStartPolygonEditing={startPolygonEditing}
                                onSavePolygon={savePolygon}
                                onCancelPolygon={cancelPolygonEditing}
                                onRemoveLastPolygonPoint={removeLastPolygonPoint}
                            />

                            {selectedLocation ? (
                                <Button variant="destructive" onClick={() => void removeLocation(selectedLocation)}>
                                    <Trash2 className="h-4 w-4" />
                                    Удалить локацию
                                </Button>
                            ) : null}

                            <UnplacedLocationsPanel
                                locations={unplacedLocations}
                                selectedLocationId={selectedLocationId}
                                onSelectLocation={setSelectedLocationId}
                                onStartPlacement={startPlacement}
                            />
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Dialog open={isDialogOpen} onOpenChange={(open) => (!open ? resetDialog() : setIsDialogOpen(open))}>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingLocation ? 'Редактирование локации' : 'Новая локация'}</DialogTitle>
                        <DialogDescription>
                            Сначала сохраните параметры локации. Затем установите точку на карте завода отдельным кликом по Konva-карте.
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
