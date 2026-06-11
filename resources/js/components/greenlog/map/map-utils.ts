import { type GreenlogLocation, type GreenlogPlant } from '@/lib/greenlog-api';

export const SHIN_LINE_FLORA_MAP_SOURCES = [
    '/images/shin-line-flora-map.jpeg',
    '/images/shin-line-flora-map.png',
] as const;

export const DEFAULT_GREENLOG_MARKER_SIZE = 8;
export const MIN_GREENLOG_MARKER_SIZE = 6;
export const MAX_GREENLOG_MARKER_SIZE = 32;
export const MIN_MAP_ZOOM = 0.5;
export const MAX_MAP_ZOOM = 3;
export const MAP_GRID_STEP = 10;
export const DEFAULT_RECTANGLE_WIDTH = 8;
export const DEFAULT_RECTANGLE_HEIGHT = 8;

export type GreenlogMapShape = 'point' | 'rectangle' | 'polygon';
export type GreenlogPolygonPoint = { x: number; y: number };

export function clampZoom(value: number): number {
    return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, Number(value.toFixed(2))));
}

export function hasMapPoint(location: Pick<GreenlogLocation, 'map_x' | 'map_y'>): boolean {
    return location.map_x !== null && location.map_y !== null;
}

export function hasRenderableShape(location: Pick<GreenlogLocation, 'map_shape' | 'map_x' | 'map_y' | 'map_polygon'>): boolean {
    const shape = getLocationShape(location);

    if (shape === 'polygon') {
        return normalizePolygonPoints(location).length >= 3;
    }

    return hasMapPoint(location);
}

export function getLocationShape(location?: Pick<GreenlogLocation, 'map_shape'> | null): GreenlogMapShape {
    if (location?.map_shape === 'rectangle' || location?.map_shape === 'polygon') {
        return location.map_shape;
    }

    return 'point';
}

export function hasRectangleSize(location: Pick<GreenlogLocation, 'map_width' | 'map_height'>): boolean {
    return typeof location.map_width === 'number'
        && typeof location.map_height === 'number'
        && location.map_width > 0
        && location.map_height > 0;
}

export function getRectangleWidth(location?: Pick<GreenlogLocation, 'map_width'> | null): number {
    if (typeof location?.map_width === 'number' && location.map_width > 0) {
        return location.map_width;
    }

    return DEFAULT_RECTANGLE_WIDTH;
}

export function getRectangleHeight(location?: Pick<GreenlogLocation, 'map_height'> | null): number {
    if (typeof location?.map_height === 'number' && location.map_height > 0) {
        return location.map_height;
    }

    return DEFAULT_RECTANGLE_HEIGHT;
}

export function clampMapPercent(value: number): number {
    return Math.min(100, Math.max(0, Number(value.toFixed(2))));
}

export function clampRectangleOrigin(origin: number, size: number): number {
    return clampMapPercent(Math.min(origin, 100 - size));
}

export function normalizePolygonPoints(location?: Pick<GreenlogLocation, 'map_polygon'> | null): GreenlogPolygonPoint[] {
    if (!Array.isArray(location?.map_polygon)) {
        return [];
    }

    return location.map_polygon.filter((point) => (
        point
        && typeof point.x === 'number'
        && typeof point.y === 'number'
    ));
}

export function getPolygonAnchor(points: GreenlogPolygonPoint[]): GreenlogPolygonPoint | null {
    if (points.length === 0) {
        return null;
    }

    const total = points.reduce((acc, point) => ({
        x: acc.x + point.x,
        y: acc.y + point.y,
    }), { x: 0, y: 0 });

    return {
        x: clampMapPercent(total.x / points.length),
        y: clampMapPercent(total.y / points.length),
    };
}

export function shiftPolygonPoints(points: GreenlogPolygonPoint[], deltaX: number, deltaY: number): GreenlogPolygonPoint[] {
    return points.map((point) => ({
        x: clampMapPercent(point.x + deltaX),
        y: clampMapPercent(point.y + deltaY),
    }));
}

export function getTotalPlantsQuantity(plants: GreenlogPlant[]): number {
    return plants.reduce((sum, plant) => sum + (plant.quantity ?? 0), 0);
}

export function getPlantSpeciesCount(plants: GreenlogPlant[]): number {
    return new Set(
        plants.map((plant) => plant.species?.id ?? plant.species?.name ?? plant.name).filter(Boolean),
    ).size;
}
