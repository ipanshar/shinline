import { Badge } from '@/components/ui/badge';
import { buildGreenlogLocationTitle, clampGreenlogMarkerSize } from '@/components/greenlog/GREENLOG_LOCATIONS';
import { type GreenlogLocation } from '@/lib/greenlog-api';
import { cn } from '@/lib/utils';
import { ImageOff, LoaderCircle, MapPin } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva';
import { LocationMarker } from './LocationMarker';
import {
    clampMapPercent,
    getLineMidpoint,
    getLocationShape,
    getLocationStyle,
    getPolygonAnchor,
    getRectangleHeight,
    getRectangleWidth,
    getShapePreset,
    hasRenderableShape,
    isBoxShape,
    isPathShape,
    MAP_GRID_STEP,
    normalizePolygonPoints,
    SHIN_LINE_FLORA_MAP_SOURCES,
    shiftPolygonPoints,
    clampZoom,
    type GreenlogPolygonPoint,
} from './map-utils';

interface ShinLineFloraKonvaMapProps {
    locations: GreenlogLocation[];
    selectedLocationId: number | null;
    placementLocation: GreenlogLocation | null;
    gridEnabled: boolean;
    panEnabled: boolean;
    editMode: boolean;
    shapeEditing: boolean;
    zoom: number;
    viewport: { x: number; y: number };
    canEdit: boolean;
    onSelectLocation: (locationId: number) => void;
    onPlaceLocation: (coords: { map_x: number; map_y: number }) => void;
    polygonDraft: { locationId: number; points: GreenlogPolygonPoint[] } | null;
    selectedPolygonPointIndex: number | null;
    polygonAddPointMode: boolean;
    onAddPolygonPoint: (point: GreenlogPolygonPoint) => void;
    onSelectPolygonPoint: (pointIndex: number | null) => void;
    onMovePolygonPoint: (pointIndex: number, point: GreenlogPolygonPoint) => void;
    onMovePathShape: (location: GreenlogLocation, points: GreenlogPolygonPoint[]) => void;
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
    shapeEditing,
    zoom,
    viewport,
    canEdit,
    onSelectLocation,
    onPlaceLocation,
    polygonDraft,
    selectedPolygonPointIndex,
    polygonAddPointMode,
    onAddPolygonPoint,
    onSelectPolygonPoint,
    onMovePolygonPoint,
    onMovePathShape,
    onMoveLocation,
    onViewportChange,
}: ShinLineFloraKonvaMapProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const selectedShapeNodeRef = useRef<any>(null);
    const transformerRef = useRef<any>(null);
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

    useEffect(() => {
        const transformer = transformerRef.current;
        const node = selectedShapeNodeRef.current;

        if (!transformer) {
            return;
        }

        if (node && shapeEditing) {
            transformer.nodes([node]);
        } else {
            transformer.nodes([]);
        }

        transformer.getLayer()?.batchDraw();
    }, [selectedLocationId, shapeEditing, locations]);

    const mappedLocations = useMemo(() => locations.filter((location) => hasRenderableShape(location)), [locations]);
    const isEditingShape = shapeEditing && selectedLocationId !== null;

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

        if (polygonDraft && polygonAddPointMode && canEdit) {
            onAddPolygonPoint({ x: coords.map_x, y: coords.map_y });
            return;
        }

        if (!placementLocation || !canEdit || isPathShape(getLocationShape(placementLocation))) {
            return;
        }

        onPlaceLocation(coords);
    };

    const renderBoxShape = (
        location: GreenlogLocation,
        shape: ReturnType<typeof getLocationShape>,
        isSelected: boolean,
        isHovered: boolean,
        isShapeEditingLocation: boolean,
    ) => {
        const style = getLocationStyle(location);
        const width = (getRectangleWidth(location) / 100) * imageWidth;
        const rawHeight = (getRectangleHeight(location) / 100) * imageHeight;
        const size = Math.max(width, rawHeight);
        const height = shape === 'square' || shape === 'circle' || shape === 'checkpoint' ? size : rawHeight;
        const x = ((location.map_x ?? 0) / 100) * imageWidth;
        const y = ((location.map_y ?? 0) / 100) * imageHeight;
        const stroke = isShapeEditingLocation ? '#f97316' : isSelected ? style.stroke : isHovered ? '#16a34a' : style.stroke;
        const fixedSizeShape = shape === 'square' || shape === 'circle' || shape === 'checkpoint';
        const boxWidth = fixedSizeShape ? size : width;
        const boxHeight = fixedSizeShape ? size : rawHeight;
        const commonShapeProps = {
            draggable: canEdit && editMode && isShapeEditingLocation && !placementLocation,
            onMouseDown: (event: any) => {
                event.cancelBubble = true;
            },
            onTouchStart: (event: any) => {
                event.cancelBubble = true;
            },
            onClick: (event: any) => {
                event.cancelBubble = true;
                onSelectLocation(location.id);
            },
            onTap: (event: any) => {
                event.cancelBubble = true;
                onSelectLocation(location.id);
            },
            onMouseEnter: (event: any) => {
                event.target.getStage()?.container().style.setProperty('cursor', isShapeEditingLocation ? 'move' : 'pointer');
                setHoveredLocationId(location.id);
            },
            onMouseLeave: (event: any) => {
                event.target.getStage()?.container().style.setProperty('cursor', 'default');
                setHoveredLocationId(null);
            },
        };

        if (shape === 'circle') {
            const radius = boxWidth / 2;

            return (
                <Group key={location.id}>
                    <Circle
                        ref={isShapeEditingLocation ? selectedShapeNodeRef : undefined}
                        x={x + radius}
                        y={y + radius}
                        radius={radius}
                        fill={style.fill}
                        opacity={style.opacity}
                        stroke={stroke}
                        strokeWidth={style.strokeWidth}
                        shadowBlur={isSelected ? 12 : 6}
                        shadowColor="rgba(15, 23, 42, 0.18)"
                        {...commonShapeProps}
                        onDragEnd={(event) => {
                            event.cancelBubble = true;
                            const node = event.target;
                            const nextRadius = node.radius();

                            onMoveLocation(location, {
                                map_x: clampMapPercent(((node.x() - nextRadius) / imageWidth) * 100),
                                map_y: clampMapPercent(((node.y() - nextRadius) / imageHeight) * 100),
                            });
                        }}
                        onTransformEnd={(event) => {
                            const node = event.target;
                            const scaleX = node.scaleX();
                            const scaleY = node.scaleY();
                            const newRadius = Math.max(2.5, node.radius() * Math.max(scaleX, scaleY));
                            const newDiameter = newRadius * 2;
                            const centerX = node.x();
                            const centerY = node.y();

                            node.setAttrs({
                                radius: newRadius,
                                scaleX: 1,
                                scaleY: 1,
                            });

                            transformerRef.current?.forceUpdate();
                            node.getLayer()?.batchDraw();

                            onMoveLocation(location, {
                                map_x: clampMapPercent(((centerX - newRadius) / imageWidth) * 100),
                                map_y: clampMapPercent(((centerY - newRadius) / imageHeight) * 100),
                                map_width: clampMapPercent((newDiameter / imageWidth) * 100),
                                map_height: clampMapPercent((newDiameter / imageHeight) * 100),
                            });
                        }}
                    />

                    <Text
                        x={x + 6}
                        y={y + 6}
                        width={Math.max(40, boxWidth - 12)}
                        text={buildGreenlogLocationTitle(location)}
                        fontSize={11}
                        fill="#0f172a"
                        listening={false}
                    />
                </Group>
            );
        }

        return (
            <Group key={location.id}>
                <Rect
                    ref={isShapeEditingLocation ? selectedShapeNodeRef : undefined}
                    x={x}
                    y={y}
                    width={boxWidth}
                    height={boxHeight}
                    fill={style.fill}
                    opacity={style.opacity}
                    stroke={stroke}
                    strokeWidth={style.strokeWidth}
                    cornerRadius={shape === 'flower_bed' ? style.radius : shape === 'square' ? 3 : shape === 'checkpoint' ? style.radius : 6}
                    shadowBlur={isSelected ? 12 : 6}
                    shadowColor="rgba(15, 23, 42, 0.18)"
                    {...commonShapeProps}
                    onDragEnd={(event) => {
                        event.cancelBubble = true;
                        const node = event.target;

                        onMoveLocation(location, {
                            map_x: clampMapPercent((node.x() / imageWidth) * 100),
                            map_y: clampMapPercent((node.y() / imageHeight) * 100),
                        });
                    }}
                    onTransformEnd={(event) => {
                        const node = event.target;
                        const scaleX = node.scaleX();
                        const scaleY = node.scaleY();
                        const scaledWidth = Math.max(5, node.width() * scaleX);
                        const scaledHeight = Math.max(5, node.height() * scaleY);
                        const newSize = Math.max(scaledWidth, scaledHeight);
                        const newWidth = fixedSizeShape ? newSize : scaledWidth;
                        const newHeight = fixedSizeShape ? newSize : scaledHeight;
                        const newX = node.x();
                        const newY = node.y();

                        node.setAttrs({
                            x: newX,
                            y: newY,
                            width: newWidth,
                            height: newHeight,
                            scaleX: 1,
                            scaleY: 1,
                        });

                        transformerRef.current?.forceUpdate();
                        node.getLayer()?.batchDraw();

                        onMoveLocation(location, {
                            map_x: clampMapPercent((newX / imageWidth) * 100),
                            map_y: clampMapPercent((newY / imageHeight) * 100),
                            map_width: clampMapPercent((newWidth / imageWidth) * 100),
                            map_height: clampMapPercent((newHeight / imageHeight) * 100),
                        });
                    }}
                />

                {shape === 'checkpoint' ? (
                    <Text
                        x={x}
                        y={(y + (boxHeight / 2)) - 6}
                        width={boxWidth}
                        align="center"
                        text="КПП"
                        fontSize={11}
                        fontStyle="bold"
                        fill={stroke}
                        listening={false}
                    />
                ) : null}

                {shape !== 'checkpoint' ? (
                    <Text
                        x={x + 6}
                        y={y + 6}
                        width={Math.max(40, boxWidth - 12)}
                        text={buildGreenlogLocationTitle(location)}
                        fontSize={11}
                        fill="#0f172a"
                        listening={false}
                    />
                ) : null}
            </Group>
        );
    };

    const renderPathShape = (
        location: GreenlogLocation,
        shape: ReturnType<typeof getLocationShape>,
        isSelected: boolean,
        isHovered: boolean,
        isShapeEditingLocation: boolean,
    ) => {
        const style = getLocationStyle(location);
        const pointsSource = polygonDraft?.locationId === location.id ? polygonDraft.points : normalizePolygonPoints(location);
        const points = pointsSource.flatMap((point) => [
            (point.x / 100) * imageWidth,
            (point.y / 100) * imageHeight,
        ]);
        const anchor = shape === 'line' ? getLineMidpoint(pointsSource) : getPolygonAnchor(pointsSource);

        if ((shape === 'polygon' && points.length < 6) || (shape === 'line' && points.length < 4)) {
            return null;
        }

        return (
            <Group
                key={location.id}
                draggable={canEdit && editMode && isShapeEditingLocation && !polygonAddPointMode}
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
                onMouseEnter={(event) => {
                    event.target.getStage()?.container().style.setProperty('cursor', 'pointer');
                    setHoveredLocationId(location.id);
                }}
                onMouseLeave={(event) => {
                    event.target.getStage()?.container().style.setProperty('cursor', 'default');
                    setHoveredLocationId(null);
                }}
                onDragStart={(event) => {
                    event.cancelBubble = true;
                    onSelectLocation(location.id);
                }}
                onDragEnd={(event) => {
                    event.cancelBubble = true;
                    const deltaX = clampMapPercent((event.target.x() / imageWidth) * 100);
                    const deltaY = clampMapPercent((event.target.y() / imageHeight) * 100);
                    event.target.position({ x: 0, y: 0 });
                    onMovePathShape(location, shiftPolygonPoints(pointsSource, deltaX, deltaY));
                }}
            >
                <Line
                    points={points}
                    closed={shape === 'polygon'}
                    fill={shape === 'polygon' ? style.fill : undefined}
                    opacity={style.opacity}
                    stroke={isShapeEditingLocation ? '#f97316' : isSelected ? style.stroke : isHovered ? '#0ea5e9' : style.stroke}
                    strokeWidth={style.strokeWidth}
                    lineCap="round"
                    lineJoin="round"
                    hitStrokeWidth={24}
                    shadowBlur={isSelected ? 12 : 0}
                    shadowColor="rgba(15, 23, 42, 0.2)"
                />

                {isShapeEditingLocation ? pointsSource.map((point, index) => (
                    <Circle
                        key={`${shape}-point-${location.id}-${index + 1}`}
                        x={(point.x / 100) * imageWidth}
                        y={(point.y / 100) * imageHeight}
                        radius={selectedPolygonPointIndex === index ? 8 : 6}
                        fill={selectedPolygonPointIndex === index ? '#f97316' : '#fff'}
                        stroke="#f97316"
                        strokeWidth={2}
                        draggable={canEdit && editMode}
                        onMouseEnter={(event) => {
                            event.target.getStage()?.container().style.setProperty('cursor', 'move');
                        }}
                        onMouseLeave={(event) => {
                            event.target.getStage()?.container().style.setProperty('cursor', 'default');
                        }}
                        onClick={(event) => {
                            event.cancelBubble = true;
                            onSelectPolygonPoint(index);
                        }}
                        onTap={(event) => {
                            event.cancelBubble = true;
                            onSelectPolygonPoint(index);
                        }}
                        onDragStart={(event) => {
                            event.cancelBubble = true;
                            onSelectPolygonPoint(index);
                        }}
                        onDragEnd={(event) => {
                            event.cancelBubble = true;
                            onMovePolygonPoint(index, {
                                x: clampMapPercent((event.target.x() / imageWidth) * 100),
                                y: clampMapPercent((event.target.y() / imageHeight) * 100),
                            });
                        }}
                    />
                )) : null}

                {anchor ? (
                    <Text
                        x={(anchor.x / 100) * imageWidth}
                        y={(anchor.y / 100) * imageHeight}
                        text={`${buildGreenlogLocationTitle(location)}${shape === 'line' ? '' : ` • ${location.plants_count ?? 0}`}`}
                        fontSize={12}
                        fill="#0f172a"
                        listening={false}
                    />
                ) : null}
            </Group>
        );
    };

    return (
        <div className="space-y-4">
            <div
                ref={containerRef}
                className={cn(
                    'relative w-full overflow-hidden rounded-3xl border border-emerald-200 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_28%),linear-gradient(180deg,rgba(247,254,231,0.92),rgba(248,250,252,0.96))] shadow-inner',
                    (placementLocation || polygonAddPointMode) && canEdit && 'cursor-crosshair',
                    panEnabled && !placementLocation && !polygonDraft && !isEditingShape && 'cursor-grab',
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
                                    draggable={panEnabled && !placementLocation && !polygonDraft && !isEditingShape}
                                    onDragEnd={(event) => {
                                        if (event.target !== event.currentTarget) {
                                            return;
                                        }

                                        const nextPosition = event.currentTarget.position();
                                        console.log('stage position changed', 'pan-drag', nextPosition);
                                        onViewportChange(nextPosition);
                                    }}
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

                                    {mappedLocations.map((location) => {
                                        const shape = getLocationShape(location);
                                        const isSelected = selectedLocationId === location.id;
                                        const isHovered = hoveredLocationId === location.id;
                                        const isShapeEditingLocation = shapeEditing && isSelected;

                                        if (isPathShape(shape)) {
                                            return renderPathShape(location, shape, isSelected, isHovered, isShapeEditingLocation);
                                        }

                                        if (isBoxShape(shape)) {
                                            return renderBoxShape(location, shape, isSelected, isHovered, isShapeEditingLocation);
                                        }

                                        return (
                                            <LocationMarker
                                                key={location.id}
                                                location={location}
                                                x={((location.map_x ?? 0) / 100) * imageWidth}
                                                y={((location.map_y ?? 0) / 100) * imageHeight}
                                                selected={isSelected}
                                                hovered={isHovered}
                                                draggable={canEdit && editMode && isShapeEditingLocation && !placementLocation}
                                                onSelect={() => onSelectLocation(location.id)}
                                                onHover={(hovered) => setHoveredLocationId(hovered ? location.id : null)}
                                                onDragStart={() => onSelectLocation(location.id)}
                                                onDragEnd={(position) => {
                                                    onMoveLocation(location, {
                                                        map_x: Number(((position.x / imageWidth) * 100).toFixed(2)),
                                                        map_y: Number(((position.y / imageHeight) * 100).toFixed(2)),
                                                    });
                                                }}
                                            />
                                        );
                                    })}

                                    <Transformer
                                        ref={transformerRef}
                                        rotateEnabled={false}
                                        enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                                        anchorSize={10}
                                        boundBoxFunc={(oldBox, newBox) => {
                                            if (newBox.width < 24 || newBox.height < 24) {
                                                return oldBox;
                                            }

                                            return newBox;
                                        }}
                                    />
                                </Group>
                            </Layer>
                        </Stage>

                        {placementLocation || polygonDraft ? (
                            <div className="pointer-events-none absolute right-4 bottom-4 max-w-xs rounded-2xl border bg-white/95 px-4 py-3 shadow-sm">
                                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                                    <MapPin className="h-4 w-4" />
                                    {polygonDraft ? 'Режим фигуры' : 'Выбор точки на карте'}
                                </div>
                                <div className="text-muted-foreground mt-1 text-xs">
                                    {polygonDraft
                                        ? polygonAddPointMode
                                            ? 'Кликните по карте, чтобы добавить новую точку формы.'
                                            : getLocationShape(locations.find((location) => location.id === polygonDraft.locationId) ?? null) === 'line'
                                                ? 'Перетаскивайте две контрольные точки линии.'
                                                : 'Перетаскивайте вершины полигона. Для сохранения нужны минимум 3 точки.'
                                        : placementLocation && isBoxShape(getLocationShape(placementLocation))
                                            ? `Кликните по карте, чтобы сохранить верхний левый угол фигуры для «${buildGreenlogLocationTitle(placementLocation)}».`
                                            : placementLocation
                                                ? `Кликните по карте, чтобы сохранить точку для «${buildGreenlogLocationTitle(placementLocation)}».`
                                                : ''}
                                </div>
                            </div>
                        ) : null}

                        <div className="pointer-events-none absolute top-4 right-4">
                            <Badge variant="secondary" className="border border-white/60 bg-white/85 text-slate-700">
                                {getLocationShape(locations.find((location) => location.id === selectedLocationId) ?? null) === 'point'
                                    ? `Размер точки: ${selectedLocationId
                                        ? clampGreenlogMarkerSize(locations.find((location) => location.id === selectedLocationId)?.marker_size)
                                        : '—'}`
                                    : `Фигура: ${getShapePreset(getLocationShape(locations.find((location) => location.id === selectedLocationId) ?? null)).label}`}
                            </Badge>
                        </div>
                    </>
                ) : null}
            </div>
        </div>
    );
}
