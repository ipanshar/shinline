import { Badge } from '@/components/ui/badge';
import { type GreenlogLocation } from '@/lib/greenlog-api';
import { cn } from '@/lib/utils';
import { ImageOff, MapPin, MousePointerClick } from 'lucide-react';
import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
    buildGreenlogLocationTitle,
    clampGreenlogMarkerSize,
} from './GREENLOG_LOCATIONS';

interface GreenlogTerminalSchemeProps {
    locations: GreenlogLocation[];
    mapAssetPath: string;
    selectedLocationId: number | null;
    onSelectLocation: (locationId: number) => void;
    placementLocation?: GreenlogLocation | null;
    onPlaceLocation?: (coords: { map_x: number; map_y: number }) => void;
}

type MapFrame = {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
};

export function GreenlogTerminalScheme({
    locations,
    mapAssetPath,
    selectedLocationId,
    onSelectLocation,
    placementLocation,
    onPlaceLocation,
}: GreenlogTerminalSchemeProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
    const [mapAvailable, setMapAvailable] = useState(true);
    const hasPlacementMode = Boolean(placementLocation && onPlaceLocation);

    useEffect(() => {
        const element = containerRef.current;

        if (!element) {
            return;
        }

        const updateSize = () => {
            setContainerSize({
                width: element.clientWidth,
                height: element.clientHeight,
            });
        };

        updateSize();

        const observer = new ResizeObserver(updateSize);
        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    const mapFrame = useMemo<MapFrame | null>(() => {
        if (
            containerSize.width <= 0
            || containerSize.height <= 0
            || imageNaturalSize.width <= 0
            || imageNaturalSize.height <= 0
        ) {
            return null;
        }

        const imageRatio = imageNaturalSize.width / imageNaturalSize.height;
        const containerRatio = containerSize.width / containerSize.height;

        if (imageRatio > containerRatio) {
            const width = containerSize.width;
            const height = width / imageRatio;

            return {
                width,
                height,
                offsetX: 0,
                offsetY: (containerSize.height - height) / 2,
            };
        }

        const height = containerSize.height;
        const width = height * imageRatio;

        return {
            width,
            height,
            offsetX: (containerSize.width - width) / 2,
            offsetY: 0,
        };
    }, [containerSize, imageNaturalSize]);

    const mappedLocations = useMemo(
        () => locations.filter((location) => location.map_x !== null && location.map_y !== null),
        [locations],
    );

    const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
        if (!hasPlacementMode || !onPlaceLocation || !mapFrame) {
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const relativeX = event.clientX - rect.left - mapFrame.offsetX;
        const relativeY = event.clientY - rect.top - mapFrame.offsetY;

        if (
            relativeX < 0
            || relativeY < 0
            || relativeX > mapFrame.width
            || relativeY > mapFrame.height
        ) {
            return;
        }

        onPlaceLocation({
            map_x: Number(((relativeX / mapFrame.width) * 100).toFixed(2)),
            map_y: Number(((relativeY / mapFrame.height) * 100).toFixed(2)),
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="text-base font-semibold">Карта Shin Line Flora</div>
                    <div className="text-muted-foreground text-sm">
                        Общая карта компании с точками локаций и привязкой растений.
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {hasPlacementMode ? (
                        <Badge variant="secondary" className="gap-1 bg-emerald-100 text-emerald-900">
                            <MousePointerClick className="h-3.5 w-3.5" />
                            Выбор точки на карте
                        </Badge>
                    ) : null}
                    <Badge variant="outline">{mappedLocations.length} точек</Badge>
                </div>
            </div>

            <div
                ref={containerRef}
                className={cn(
                    'relative min-h-[700px] w-full overflow-hidden rounded-3xl border border-emerald-200 bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.12),transparent_28%),linear-gradient(180deg,rgba(247,254,231,0.9),rgba(248,250,252,0.95))] shadow-inner lg:min-h-[760px] xl:min-h-[820px]',
                    hasPlacementMode && mapAvailable && 'cursor-crosshair',
                )}
                onClick={handleMapClick}
            >
                {mapAvailable ? (
                    <>
                        <img
                            alt="Карта Shin Line Flora"
                            className="absolute inset-0 h-full w-full object-contain"
                            src={mapAssetPath}
                            onLoad={(event) => {
                                setMapAvailable(true);
                                setImageNaturalSize({
                                    width: event.currentTarget.naturalWidth,
                                    height: event.currentTarget.naturalHeight,
                                });
                            }}
                            onError={() => setMapAvailable(false)}
                        />

                        {mapFrame ? (
                            <div
                                className="absolute"
                                style={{
                                    left: mapFrame.offsetX,
                                    top: mapFrame.offsetY,
                                    width: mapFrame.width,
                                    height: mapFrame.height,
                                }}
                            >
                                {mappedLocations.map((location) => {
                                    const markerSize = clampGreenlogMarkerSize(location.marker_size);
                                    const isSelected = selectedLocationId === location.id;

                                    return (
                                        <button
                                            key={location.id}
                                            type="button"
                                            title={buildGreenlogLocationTitle(location)}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onSelectLocation(location.id);
                                            }}
                                            className="group absolute -translate-x-1/2 -translate-y-1/2"
                                            style={{
                                                left: `${location.map_x}%`,
                                                top: `${location.map_y}%`,
                                            }}
                                        >
                                            <span
                                                className={cn(
                                                    'absolute inset-1/2 -z-10 hidden -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/20 blur-md group-hover:block',
                                                    isSelected && 'block bg-lime-400/30',
                                                )}
                                                style={{
                                                    width: markerSize + 18,
                                                    height: markerSize + 18,
                                                }}
                                            />
                                            <span
                                                className={cn(
                                                    'block rounded-full border-2 border-white bg-emerald-600 shadow-md transition-transform group-hover:scale-110',
                                                    isSelected && 'bg-lime-500 ring-4 ring-lime-300/70',
                                                )}
                                                style={{
                                                    width: markerSize,
                                                    height: markerSize,
                                                }}
                                            />
                                            {isSelected ? (
                                                <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/95 px-3 py-1 text-xs font-medium text-slate-800 shadow-sm">
                                                    {buildGreenlogLocationTitle(location)}
                                                </span>
                                            ) : null}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null}

                        {hasPlacementMode && placementLocation ? (
                            <>
                                <div className="pointer-events-none absolute inset-0 border-2 border-dashed border-emerald-400/70" />
                                <div className="pointer-events-none absolute right-4 bottom-4 max-w-xs rounded-2xl border bg-white/95 px-4 py-3 shadow-sm">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                                        <MapPin className="h-4 w-4" />
                                        Выбор точки на карте
                                    </div>
                                    <div className="text-muted-foreground mt-1 text-xs">
                                        Кликните по карте, чтобы сохранить точку для «{buildGreenlogLocationTitle(placementLocation)}».
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </>
                ) : (
                    <div className="text-muted-foreground flex h-full min-h-[700px] items-center justify-center px-6 text-center lg:min-h-[760px] xl:min-h-[820px]">
                        <div className="rounded-2xl border border-dashed bg-white/90 px-6 py-5 shadow-sm">
                            <ImageOff className="mx-auto h-8 w-8 text-slate-400" />
                            <div className="mt-3 text-base font-semibold text-slate-900">Карта не загружена</div>
                            <div className="mt-1 text-sm">
                                Добавьте PNG-файл в `public/images/shin-line-flora-map.png`.
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
