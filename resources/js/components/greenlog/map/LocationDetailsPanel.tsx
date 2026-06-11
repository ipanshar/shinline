import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type GreenlogLocation, type GreenlogPlant } from '@/lib/greenlog-api';
import { Link } from '@inertiajs/react';
import { Building2, Crosshair, Pencil, Shapes, Trees } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
    buildGreenlogLocationMeta,
    buildGreenlogLocationSubtitle,
    buildGreenlogLocationTitle,
    clampGreenlogMarkerSize,
} from '@/components/greenlog/GREENLOG_LOCATIONS';
import { greenlogMoneyLabel, plantCategoryLabel, plantCostSourceLabel, plantStatusLabel } from '@/lib/greenlog-labels';
import {
    DEFAULT_GREENLOG_MARKER_SIZE,
    DEFAULT_RECTANGLE_HEIGHT,
    DEFAULT_RECTANGLE_WIDTH,
    MAX_GREENLOG_MARKER_SIZE,
    MIN_GREENLOG_MARKER_SIZE,
    getLocationShape,
    getPlantSpeciesCount,
    getRectangleHeight,
    getRectangleWidth,
    getTotalPlantsQuantity,
    normalizePolygonPoints,
    type GreenlogPolygonPoint,
    type GreenlogMapShape,
} from './map-utils';

interface LocationDetailsPanelProps {
    location: GreenlogLocation | null;
    plants: GreenlogPlant[];
    plantsLoading: boolean;
    plantsError: string | null;
    markerSizeSaving: boolean;
    shapeSaving: boolean;
    dimensionsSaving: boolean;
    polygonEditing: boolean;
    polygonSaving: boolean;
    polygonDraftPoints: GreenlogPolygonPoint[];
    onEditLocation: (location: GreenlogLocation) => void;
    onStartPlacement: (location: GreenlogLocation) => void;
    onCommitMarkerSize: (location: GreenlogLocation, nextSize: number) => Promise<void>;
    onCommitShape: (location: GreenlogLocation, shape: GreenlogMapShape) => Promise<void>;
    onCommitRectangleSize: (
        location: GreenlogLocation,
        nextSize: { map_width: number; map_height: number },
    ) => Promise<void>;
    onStartPolygonEditing: (location: GreenlogLocation) => void;
    onSavePolygon: () => Promise<void>;
    onCancelPolygon: () => void;
    onRemoveLastPolygonPoint: () => void;
}

const buildPlantTitle = (plant: GreenlogPlant) => plant.species?.name || plant.name || `Растение #${plant.id}`;

export function LocationDetailsPanel({
    location,
    plants,
    plantsLoading,
    plantsError,
    markerSizeSaving,
    shapeSaving,
    dimensionsSaving,
    polygonEditing,
    polygonSaving,
    polygonDraftPoints,
    onEditLocation,
    onStartPlacement,
    onCommitMarkerSize,
    onCommitShape,
    onCommitRectangleSize,
    onStartPolygonEditing,
    onSavePolygon,
    onCancelPolygon,
    onRemoveLastPolygonPoint,
}: LocationDetailsPanelProps) {
    const [draftMarkerSize, setDraftMarkerSize] = useState(DEFAULT_GREENLOG_MARKER_SIZE);
    const [draftShape, setDraftShape] = useState<GreenlogMapShape>('point');
    const [draftWidth, setDraftWidth] = useState(DEFAULT_RECTANGLE_WIDTH);
    const [draftHeight, setDraftHeight] = useState(DEFAULT_RECTANGLE_HEIGHT);

    useEffect(() => {
        setDraftMarkerSize(clampGreenlogMarkerSize(location?.marker_size));
        setDraftShape(getLocationShape(location));
        setDraftWidth(getRectangleWidth(location));
        setDraftHeight(getRectangleHeight(location));
    }, [location?.id, location?.marker_size, location?.map_shape, location?.map_width, location?.map_height]);

    if (!location) {
        return (
            <div className="text-muted-foreground rounded-2xl border border-dashed px-4 py-8 text-center">
                Выберите локацию на карте или в списке.
            </div>
        );
    }

    const speciesCount = getPlantSpeciesCount(plants);
    const totalPlants = getTotalPlantsQuantity(plants);
    const shape = getLocationShape(location);
    const displayShape: GreenlogMapShape = polygonEditing || draftShape === 'polygon' ? 'polygon' : shape;
    const polygonPoints = normalizePolygonPoints(location);
    const hasPolygonData = polygonPoints.length >= 3;
    const activePolygonPoints = polygonEditing ? polygonDraftPoints : polygonPoints;

    const commitMarkerSize = async () => {
        const nextValue = Math.min(MAX_GREENLOG_MARKER_SIZE, Math.max(MIN_GREENLOG_MARKER_SIZE, draftMarkerSize));
        setDraftMarkerSize(nextValue);
        await onCommitMarkerSize(location, nextValue);
    };

    const commitRectangleSize = async () => {
        const nextWidth = Math.min(100, Math.max(1, Number(draftWidth.toFixed(2))));
        const nextHeight = Math.min(100, Math.max(1, Number(draftHeight.toFixed(2))));
        setDraftWidth(nextWidth);
        setDraftHeight(nextHeight);
        await onCommitRectangleSize(location, {
            map_width: nextWidth,
            map_height: nextHeight,
        });
    };

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 text-base font-semibold">
                            <Building2 className="h-4 w-4 text-green-700" />
                            {buildGreenlogLocationTitle(location)}
                        </div>
                        <div className="text-muted-foreground mt-1 text-sm">
                            {buildGreenlogLocationSubtitle(location)}
                        </div>
                    </div>
                    <Badge variant="outline">{plants.length} записей</Badge>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="text-muted-foreground text-xs">Видов растений</div>
                        <div className="font-medium">{speciesCount}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="text-muted-foreground text-xs">Общее количество</div>
                        <div className="font-medium">{totalPlants}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="text-muted-foreground text-xs">Форма на карте</div>
                        <div className="font-medium capitalize">{displayShape}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="text-muted-foreground text-xs">Координаты</div>
                        <div className="font-medium">
                            {location.map_x !== null && location.map_y !== null
                                ? `${location.map_x}% / ${location.map_y}%`
                                : 'Не размещена'}
                        </div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="text-muted-foreground text-xs">Размер маркера</div>
                        <div className="font-medium">{displayShape === 'point' ? clampGreenlogMarkerSize(location.marker_size) : '—'}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                        <div className="text-muted-foreground text-xs">Размер зоны</div>
                        <div className="font-medium">
                            {displayShape === 'rectangle' ? `${getRectangleWidth(location)}% × ${getRectangleHeight(location)}%` : '—'}
                        </div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3 md:col-span-2">
                        <div className="text-muted-foreground text-xs">Метаданные</div>
                        <div className="font-medium">{buildGreenlogLocationMeta(location) || 'Без уточнения'}</div>
                    </div>
                    {displayShape === 'polygon' ? (
                        <div className="rounded-lg border bg-muted/20 p-3">
                            <div className="text-muted-foreground text-xs">Вершин полигона</div>
                            <div className="font-medium">{activePolygonPoints.length}</div>
                        </div>
                    ) : null}
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Форма локации</Label>
                            <Select
                                value={draftShape}
                                onValueChange={(value) => {
                                    const nextShape = value as GreenlogMapShape;

                                    if (nextShape === 'polygon') {
                                        setDraftShape(nextShape);
                                        onStartPolygonEditing(location);
                                        return;
                                    }

                                    setDraftShape(nextShape);
                                    void onCommitShape(location, nextShape);
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="point">Точка</SelectItem>
                                    <SelectItem value="rectangle">Прямоугольник</SelectItem>
                                    <SelectItem value="polygon">Полигон</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="text-muted-foreground text-xs">
                                {shapeSaving
                                    ? 'Сохраняем форму локации...'
                                    : polygonEditing
                                        ? 'Режим построения полигона активен. Кликайте по карте, чтобы добавлять вершины.'
                                        : hasPolygonData
                                            ? 'Polygon доступен для просмотра и редактирования вершин через карту.'
                                            : 'Можно переключиться в polygon и нарисовать его кликами по карте.'}
                            </div>
                        </div>

                        {displayShape === 'point' ? (
                            <div className="space-y-3">
                                <Label htmlFor="marker-size-range">Размер точки</Label>
                                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                                    <Input
                                        id="marker-size-range"
                                        type="range"
                                        min={String(MIN_GREENLOG_MARKER_SIZE)}
                                        max={String(MAX_GREENLOG_MARKER_SIZE)}
                                        value={draftMarkerSize}
                                        onChange={(event) => setDraftMarkerSize(event.currentTarget.valueAsNumber)}
                                        onMouseUp={() => void commitMarkerSize()}
                                        onTouchEnd={() => void commitMarkerSize()}
                                    />
                                    <Input
                                        className="w-full md:w-24"
                                        type="number"
                                        min={String(MIN_GREENLOG_MARKER_SIZE)}
                                        max={String(MAX_GREENLOG_MARKER_SIZE)}
                                        value={draftMarkerSize}
                                        onChange={(event) => {
                                            if (!Number.isNaN(event.currentTarget.valueAsNumber)) {
                                                setDraftMarkerSize(event.currentTarget.valueAsNumber);
                                            }
                                        }}
                                        onBlur={() => void commitMarkerSize()}
                                    />
                                </div>
                                <div className="text-muted-foreground text-xs">
                                    {markerSizeSaving
                                        ? 'Сохраняем размер точки...'
                                        : `Минимум ${MIN_GREENLOG_MARKER_SIZE}px, максимум ${MAX_GREENLOG_MARKER_SIZE}px. Значение по умолчанию ${DEFAULT_GREENLOG_MARKER_SIZE}px.`}
                                </div>
                            </div>
                        ) : null}

                        {displayShape === 'rectangle' ? (
                            <div className="space-y-3">
                                <Label>Размер прямоугольника</Label>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="map-width">Ширина зоны, %</Label>
                                        <Input
                                            id="map-width"
                                            type="number"
                                            min="1"
                                            max="100"
                                            step="0.01"
                                            value={draftWidth}
                                            onChange={(event) => {
                                                if (!Number.isNaN(event.currentTarget.valueAsNumber)) {
                                                    setDraftWidth(event.currentTarget.valueAsNumber);
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="map-height">Высота зоны, %</Label>
                                        <Input
                                            id="map-height"
                                            type="number"
                                            min="1"
                                            max="100"
                                            step="0.01"
                                            value={draftHeight}
                                            onChange={(event) => {
                                                if (!Number.isNaN(event.currentTarget.valueAsNumber)) {
                                                    setDraftHeight(event.currentTarget.valueAsNumber);
                                                }
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-start">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => void commitRectangleSize()}
                                        disabled={dimensionsSaving}
                                    >
                                        Сохранить размер зоны
                                    </Button>
                                </div>
                                <div className="text-muted-foreground text-xs">
                                    {dimensionsSaving ? 'Сохраняем размеры зоны...' : 'Размеры хранятся в процентах от карты.'}
                                </div>
                            </div>
                        ) : null}

                        {displayShape === 'polygon' ? (
                            <div className="space-y-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-sm">
                                <div className="font-medium">{polygonEditing ? 'Построение полигона' : 'Полигон'}</div>
                                <div className="text-muted-foreground">
                                    {polygonEditing
                                        ? `Добавлено вершин: ${activePolygonPoints.length}. Минимум для сохранения: 3.`
                                        : `Вершин: ${activePolygonPoints.length}.`}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {!polygonEditing ? (
                                        <Button type="button" variant="outline" onClick={() => onStartPolygonEditing(location)}>
                                            Начать/редактировать полигон
                                        </Button>
                                    ) : null}
                                    {polygonEditing ? (
                                        <>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => onRemoveLastPolygonPoint()}
                                                disabled={polygonDraftPoints.length === 0 || polygonSaving}
                                            >
                                                Удалить последнюю точку
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={() => onCancelPolygon()}
                                                disabled={polygonSaving}
                                            >
                                                Отменить
                                            </Button>
                                            <Button
                                                type="button"
                                                onClick={() => void onSavePolygon()}
                                                disabled={polygonDraftPoints.length < 3 || polygonSaving}
                                            >
                                                {polygonSaving ? 'Сохраняем...' : 'Сохранить полигон'}
                                            </Button>
                                        </>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="flex flex-col gap-2">
                        <Button variant="outline" onClick={() => onEditLocation(location)}>
                            <Pencil className="h-4 w-4" />
                            Изменить
                        </Button>
                        <Button variant="outline" onClick={() => onStartPlacement(location)} disabled={displayShape === 'polygon' || polygonEditing}>
                            <Crosshair className="h-4 w-4" />
                            {displayShape === 'rectangle' ? 'Установить зону' : displayShape === 'polygon' ? 'Polygon через клики' : 'Установить точку'}
                        </Button>
                        <Badge variant="secondary" className="justify-center gap-1 py-2">
                            <Shapes className="h-4 w-4" />
                            shape: {displayShape}
                        </Badge>
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
                    <div className="text-muted-foreground text-sm">Загрузка растений...</div>
                ) : null}

                {!plantsLoading && plants.length === 0 ? (
                    <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center">
                        В этой локации пока нет растений.
                    </div>
                ) : null}

                {!plantsLoading && plants.length > 0 ? (
                    <div className="space-y-2">
                        {plants.map((plant) => (
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
        </div>
    );
}
