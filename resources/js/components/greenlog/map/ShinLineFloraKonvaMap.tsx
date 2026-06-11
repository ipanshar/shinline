import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { type GreenlogLocation } from '@/lib/greenlog-api';
import { ImageOff, LoaderCircle, MapPin } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text } from 'react-konva';
import { buildGreenlogLocationTitle, clampGreenlogMarkerSize } from '@/components/greenlog/GREENLOG_LOCATIONS';
import { LocationMarker } from './LocationMarker';
import {
    DEFAULT_RECTANGLE_HEIGHT,
    DEFAULT_RECTANGLE_WIDTH,
    MAP_GRID_STEP,
    SHIN_LINE_FLORA_MAP_SOURCES,
    clampZoom,
    getLocationShape,
    getPolygonAnchor,
    getRectangleHeight,
    getRectangleWidth,
    hasRenderableShape,
    normalizePolygonPoints,
    type GreenlogPolygonPoint,
} from './map-utils';

interface ShinLineFloraKonvaMapProps {
    locations: GreenlogLocation[];
    selectedLocationId: number | null;
    placementLocation: GreenlogLocation | null;
    gridEnabled: boolean;
    panEnabled: boolean;
    editMode: boolean;
    zoom: number;
    viewport: { x: number; y: number };
    canEdit: boolean;
    onSelectLocation: (locationId: number) => void;
    onPlaceLocation: (coords: { map_x: number; map_y: number }) => void;
    polygonDraft: { locationId: number; points: GreenlogPolygonPoint[] } | null;
    onAddPolygonPoint: (point: GreenlogPolygonPoint) => void;
    onMovePolygon: (
        location: GreenlogLocation,
        coords: { map_x: number; map_y: number; map_polygon: GreenlogPolygonPoint[] },
    ) => void;
    onMoveLocation: (
        location: GreenlogLocation,
        coords: { map_x: number; map_y: number; map_width?: number; map_height?: number },
    ) => void;
    onViewportChange: (viewport: { x: number; y: number }) => void;
}

type ImageState =
    | { status: 'loading'; src: string | null; image: null }
    | { status: 'ready'; src: string; image: HTMLImageElement }
    | { status: 'error'; src: null; image: null };

const MIN_STAGE_HEIGHT = 520;
const MAX_STAGE_HEIGHT = 980;

export function ShinLineFloraKonvaMap({
    locations,
    selectedLocationId,
    placementLocation,
    gridEnabled,
    panEnabled,
    editMode,
    zoom,
    viewport,
    canEdit,
    onSelectLocation,
    onPlaceLocation,
    polygonDraft,
    onAddPolygonPoint,
    onMovePolygon,
    onMoveLocation,
    onViewportChange,
}: ShinLineFloraKonvaMapProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const [imageState, setImageState] = useState<ImageState>({
        status: 'loading',
        src: SHIN_LINE_FLORA_MAP_SOURCES[0],
        image: null,
    });
    const [hoveredLocationId, setHoveredLocationId] = useState<number | null>(null);

    useEffect(() => {
        const element = containerRef.current;

        if (!element) {
            return;
        }

        const updateSize = () => {
            setContainerWidth(element.clientWidth);
        };

        updateSize();

        const observer = new ResizeObserver(updateSize);
        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        let cancelled = false;

        const tryLoad = (index: number) => {
            const src = SHIN_LINE_FLORA_MAP_SOURCES[index];

            if (!src) {
                if (!cancelled) {
                    setImageState({ status: 'error', src: null, image: null });
                }
                return;
            }

            const image = new window.Image();
            image.src = src;
            image.onload = () => {
                if (!cancelled) {
                    setImageState({ status: 'ready', src, image });
                }
            };
            image.onerror = () => {
                if (!cancelled) {
                    tryLoad(index + 1);
                }
            };
        };

        setImageState({ status: 'loading', src: SHIN_LINE_FLORA_MAP_SOURCES[0], image: null });
        tryLoad(0);

        return () => {
            cancelled = true;
        };
    }, []);

    const mappedLocations = useMemo(() => locations.filter((location) => hasRenderableShape(location)), [locations]);

    const imageWidth = containerWidth > 0 ? containerWidth : 0;
    const imageHeight = imageState.status === 'ready' && imageState.image.naturalWidth > 0
        ? imageWidth * (imageState.image.naturalHeight / imageState.image.naturalWidth)
        : MIN_STAGE_HEIGHT;
    const stageHeight = Math.max(MIN_STAGE_HEIGHT, Math.min(MAX_STAGE_HEIGHT, imageHeight));

    const pointerToPercent = (x: number, y: number) => {
        if (imageWidth <= 0 || imageHeight <= 0) {
            return null;
        }

        const worldX = (x - viewport.x) / clampZoom(zoom);
        const worldY = (y - viewport.y) / clampZoom(zoom);

        if (worldX < 0 || worldY < 0 || worldX > imageWidth || worldY > imageHeight) {
            return null;
        }

        return {
            map_x: Number(((worldX / imageWidth) * 100).toFixed(2)),
            map_y: Number(((worldY / imageHeight) * 100).toFixed(2)),
        };
    };

    const handleStageClick = (event: { target: { getStage: () => { getPointerPosition: () => { x: number; y: number } | null } | null } }) => {
        const stage = event.target.getStage();
        const pointer = stage?.getPointerPosition();

        if (!pointer) {
            return;
        }

        const coords = pointerToPercent(pointer.x, pointer.y);

        if (!coords) {
            return;
        }

        if (polygonDraft && canEdit) {
            onAddPolygonPoint({ x: coords.map_x, y: coords.map_y });
            return;
        }

        if (!placementLocation || !canEdit || getLocationShape(placementLocation) === 'polygon') {
            return;
        }

        if (coords) {
            onPlaceLocation(coords);
        }
    };

    return (
        <div className="space-y-4">
            <div
                ref={containerRef}
                className={cn(
                    'relative w-full overflow-hidden rounded-3xl border border-emerald-200 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_28%),linear-gradient(180deg,rgba(247,254,231,0.92),rgba(248,250,252,0.96))] shadow-inner',
                    (placementLocation || polygonDraft) && canEdit && 'cursor-crosshair',
                    panEnabled && !placementLocation && !polygonDraft && 'cursor-grab',
                )}
                style={{ minHeight: stageHeight }}
            >
                {imageState.status === 'loading' ? (
                    <div className="text-muted-foreground flex min-h-[520px] items-center justify-center gap-2">
                        <LoaderCircle className="h-5 w-5 animate-spin" />
                        Загрузка карты завода...
                    </div>
                ) : null}

                {imageState.status === 'error' ? (
                    <div className="text-muted-foreground flex min-h-[520px] items-center justify-center px-6 text-center">
                        <div className="rounded-2xl border border-dashed bg-white/90 px-6 py-5 shadow-sm">
                            <ImageOff className="mx-auto h-8 w-8 text-slate-400" />
                            <div className="mt-3 text-base font-semibold text-slate-900">Карта не загружена</div>
                            <div className="mt-1 text-sm">
                                Добавьте `public/images/shin-line-flora-map.jpeg` или оставьте fallback `public/images/shin-line-flora-map.png`.
                            </div>
                        </div>
                    </div>
                ) : null}

                {imageState.status === 'ready' ? (
                    <>
                        <Stage
                            width={containerWidth}
                            height={stageHeight}
                            onClick={handleStageClick}
                            onTap={handleStageClick}
                        >
                            <Layer>
                                <Group
                                    x={viewport.x}
                                    y={viewport.y}
                                    scaleX={zoom}
                                    scaleY={zoom}
                                    draggable={panEnabled && !placementLocation && !polygonDraft}
                                    onDragEnd={(event) => onViewportChange(event.target.position())}
                                >
                                    <KonvaImage image={imageState.image} width={imageWidth} height={imageHeight} />

                                    {gridEnabled
                                        ? Array.from({ length: 11 }).map((_, index) => {
                                            const offsetX = (imageWidth / 10) * index;
                                            const offsetY = (imageHeight / 10) * index;
                                            const label = String(index * MAP_GRID_STEP);

                                            return (
                                                <Group key={`grid-${label}`}>
                                                    <Line
                                                        points={[offsetX, 0, offsetX, imageHeight]}
                                                        stroke="rgba(15,23,42,0.18)"
                                                        strokeWidth={1}
                                                        dash={[6, 6]}
                                                        listening={false}
                                                    />
                                                    <Line
                                                        points={[0, offsetY, imageWidth, offsetY]}
                                                        stroke="rgba(15,23,42,0.18)"
                                                        strokeWidth={1}
                                                        dash={[6, 6]}
                                                        listening={false}
                                                    />
                                                    <Text x={Math.min(offsetX + 4, imageWidth - 28)} y={6} text={label} fontSize={11} fill="#334155" listening={false} />
                                                    <Text x={6} y={Math.min(offsetY + 4, imageHeight - 18)} text={label} fontSize={11} fill="#334155" listening={false} />
                                                </Group>
                                            );
                                        })
                                        : null}

                                    {polygonDraft ? (
                                        (() => {
                                            const draftPoints = polygonDraft.points.flatMap((point) => [
                                                (point.x / 100) * imageWidth,
                                                (point.y / 100) * imageHeight,
                                            ]);
                                            const anchor = getPolygonAnchor(polygonDraft.points);

                                            return (
                                                <Group>
                                                    {draftPoints.length >= 4 ? (
                                                        <Line
                                                            points={draftPoints}
                                                            closed={polygonDraft.points.length >= 3}
                                                            fill="rgba(249,115,22,0.16)"
                                                            stroke="#f97316"
                                                            strokeWidth={2}
                                                            dash={polygonDraft.points.length >= 3 ? undefined : [6, 6]}
                                                        />
                                                    ) : null}
                                                    {polygonDraft.points.map((point, index) => (
                                                        <Group
                                                            key={`draft-point-${index + 1}`}
                                                            x={(point.x / 100) * imageWidth}
                                                            y={(point.y / 100) * imageHeight}
                                                        >
                                                            <Rect
                                                                x={-4}
                                                                y={-4}
                                                                width={8}
                                                                height={8}
                                                                fill="#f97316"
                                                                stroke="#fff"
                                                                strokeWidth={1}
                                                                cornerRadius={2}
                                                            />
                                                            <Text
                                                                x={8}
                                                                y={-12}
                                                                text={String(index + 1)}
                                                                fontSize={11}
                                                                fill="#9a3412"
                                                                listening={false}
                                                            />
                                                        </Group>
                                                    ))}
                                                    {anchor ? (
                                                        <Text
                                                            x={(anchor.x / 100) * imageWidth}
                                                            y={(anchor.y / 100) * imageHeight}
                                                            text={`Draft polygon • ${polygonDraft.points.length}`}
                                                            fontSize={12}
                                                            fill="#9a3412"
                                                            listening={false}
                                                        />
                                                    ) : null}
                                                </Group>
                                            );
                                        })()
                                    ) : null}

                                    {mappedLocations.map((location) => {
                                        const shape = getLocationShape(location);
                                        const x = ((location.map_x ?? 0) / 100) * imageWidth;
                                        const y = ((location.map_y ?? 0) / 100) * imageHeight;
                                        const isSelected = selectedLocationId === location.id;
                                        const isHovered = hoveredLocationId === location.id;
                                        const isPolygonEditingLocation = polygonDraft?.locationId === location.id;

                                        if (shape === 'rectangle') {
                                            const width = (getRectangleWidth(location) / 100) * imageWidth;
                                            const height = (getRectangleHeight(location) / 100) * imageHeight;

                                            return (
                                                <Group
                                                    key={location.id}
                                                    x={x}
                                                    y={y}
                                                    draggable={canEdit && editMode && !placementLocation}
                                                    onMouseDown={(event) => {
                                                        event.cancelBubble = true;
                                                    }}
                                                    onTouchStart={(event) => {
                                                        event.cancelBubble = true;
                                                    }}
                                                    onClick={(event) => {
                                                        event.cancelBubble = true;
                                                        onSelectLocation(location.id);
                                                    }}
                                                    onTap={(event) => {
                                                        event.cancelBubble = true;
                                                        onSelectLocation(location.id);
                                                    }}
                                                    onMouseEnter={() => setHoveredLocationId(location.id)}
                                                    onMouseLeave={() => setHoveredLocationId(null)}
                                                    onDragStart={(event) => {
                                                        event.cancelBubble = true;
                                                        onSelectLocation(location.id);
                                                    }}
                                                    onDragMove={(event) => {
                                                        event.cancelBubble = true;
                                                    }}
                                                    onDragEnd={(event) => {
                                                        event.cancelBubble = true;
                                                        onMoveLocation(location, {
                                                            map_x: Number(((event.target.x() / imageWidth) * 100).toFixed(2)),
                                                            map_y: Number(((event.target.y() / imageHeight) * 100).toFixed(2)),
                                                        });
                                                    }}
                                                >
                                                    <Rect
                                                        width={width}
                                                        height={height}
                                                        fill={isSelected ? 'rgba(132,204,22,0.22)' : 'rgba(16,185,129,0.18)'}
                                                        stroke={isSelected ? '#84cc16' : isHovered ? '#22c55e' : '#059669'}
                                                        strokeWidth={isSelected ? 3 : 2}
                                                        cornerRadius={10}
                                                        shadowBlur={isSelected ? 14 : 8}
                                                        shadowColor="rgba(15, 23, 42, 0.25)"
                                                    />
                                                    <Text
                                                        x={8}
                                                        y={8}
                                                        text={`${buildGreenlogLocationTitle(location)} • ${location.plants_count ?? 0}`}
                                                        fontSize={12}
                                                        fill="#0f172a"
                                                        listening={false}
                                                    />
                                                </Group>
                                            );
                                        }

                                        if (shape === 'polygon') {
                                            const polygonPoints = normalizePolygonPoints(location);
                                            const points = polygonPoints
                                                .flatMap((point) => [((point.x / 100) * imageWidth), ((point.y / 100) * imageHeight)]);
                                            const anchor = getPolygonAnchor(polygonPoints);

                                            if (points.length < 6) {
                                                return null;
                                            }

                                            return (
                                                <Group
                                                    key={location.id}
                                                    draggable={canEdit && editMode && !placementLocation && !isPolygonEditingLocation}
                                                    onMouseDown={(event) => {
                                                        event.cancelBubble = true;
                                                    }}
                                                    onTouchStart={(event) => {
                                                        event.cancelBubble = true;
                                                    }}
                                                    onClick={(event) => {
                                                        event.cancelBubble = true;
                                                        onSelectLocation(location.id);
                                                    }}
                                                    onTap={(event) => {
                                                        event.cancelBubble = true;
                                                        onSelectLocation(location.id);
                                                    }}
                                                    onMouseEnter={() => setHoveredLocationId(location.id)}
                                                    onMouseLeave={() => setHoveredLocationId(null)}
                                                    onDragStart={(event) => {
                                                        event.cancelBubble = true;
                                                        onSelectLocation(location.id);
                                                    }}
                                                    onDragMove={(event) => {
                                                        event.cancelBubble = true;
                                                    }}
                                                    onDragEnd={(event) => {
                                                        event.cancelBubble = true;
                                                        const group = event.currentTarget;
                                                        const deltaX = Number(((group.x() / imageWidth) * 100).toFixed(2));
                                                        const deltaY = Number(((group.y() / imageHeight) * 100).toFixed(2));
                                                        const movedPoints = polygonPoints.map((point) => ({
                                                            x: Number((point.x + deltaX).toFixed(2)),
                                                            y: Number((point.y + deltaY).toFixed(2)),
                                                        }));
                                                        const movedAnchor = getPolygonAnchor(movedPoints);

                                                        group.position({ x: 0, y: 0 });
                                                        onMovePolygon(location, {
                                                            map_x: movedAnchor?.x ?? location.map_x ?? 0,
                                                            map_y: movedAnchor?.y ?? location.map_y ?? 0,
                                                            map_polygon: movedPoints,
                                                        });
                                                    }}
                                                >
                                                    <Line
                                                        points={points}
                                                        closed
                                                        fill={isSelected ? 'rgba(251,191,36,0.18)' : 'rgba(14,165,233,0.14)'}
                                                        stroke={isSelected ? '#f59e0b' : isHovered ? '#0ea5e9' : '#0284c7'}
                                                        strokeWidth={isSelected ? 3 : 2}
                                                        hitStrokeWidth={18}
                                                        shadowBlur={isSelected ? 12 : 0}
                                                        shadowColor="rgba(15, 23, 42, 0.2)"
                                                    />
                                                    <Text
                                                        x={anchor ? (anchor.x / 100) * imageWidth : x}
                                                        y={anchor ? (anchor.y / 100) * imageHeight : y}
                                                        text={`${buildGreenlogLocationTitle(location)} • ${location.plants_count ?? 0}`}
                                                        fontSize={12}
                                                        fill="#0f172a"
                                                        listening={false}
                                                    />
                                                </Group>
                                            );
                                        }

                                        return (
                                            <LocationMarker
                                                key={location.id}
                                                location={location}
                                                x={x}
                                                y={y}
                                                selected={isSelected}
                                                hovered={isHovered}
                                                draggable={canEdit && editMode && !placementLocation}
                                                onSelect={() => onSelectLocation(location.id)}
                                                onHover={(hovered) => setHoveredLocationId(hovered ? location.id : null)}
                                                onDragStart={() => onSelectLocation(location.id)}
                                                onDragEnd={(position) => {
                                                    const coords = {
                                                        map_x: Number(((position.x / imageWidth) * 100).toFixed(2)),
                                                        map_y: Number(((position.y / imageHeight) * 100).toFixed(2)),
                                                    };
                                                    onMoveLocation(location, coords);
                                                }}
                                            />
                                        );
                                    })}
                                </Group>
                            </Layer>
                        </Stage>

                        {placementLocation || polygonDraft ? (
                            <div className="pointer-events-none absolute right-4 bottom-4 max-w-xs rounded-2xl border bg-white/95 px-4 py-3 shadow-sm">
                                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                                    <MapPin className="h-4 w-4" />
                                    {polygonDraft ? 'Режим полигона' : 'Выбор точки на карте'}
                                </div>
                                <div className="text-muted-foreground mt-1 text-xs">
                                    {polygonDraft
                                        ? 'Кликайте по карте, чтобы добавить вершины полигона. Для сохранения нужны минимум 3 точки.'
                                        : placementLocation && getLocationShape(placementLocation) === 'rectangle'
                                            ? `Кликните по карте, чтобы сохранить верхний левый угол зоны для «${buildGreenlogLocationTitle(placementLocation)}».`
                                            : placementLocation
                                                ? `Кликните по карте, чтобы сохранить точку для «${buildGreenlogLocationTitle(placementLocation)}».`
                                                : ''}
                                </div>
                            </div>
                        ) : null}

                        <div className="pointer-events-none absolute top-4 right-4">
                            <Badge variant="secondary" className="border border-white/60 bg-white/85 text-slate-700">
                                Размер выбранной точки: {selectedLocationId
                                    ? clampGreenlogMarkerSize(locations.find((location) => location.id === selectedLocationId)?.marker_size)
                                    : '—'}
                            </Badge>
                        </div>
                    </>
                ) : null}
            </div>
        </div>
    );
}
