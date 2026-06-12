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

export type GreenlogMapShape =
    | 'point'
    | 'circle'
    | 'square'
    | 'rectangle'
    | 'polygon'
    | 'line'
    | 'flower_bed'
    | 'checkpoint';

export type GreenlogPolygonPoint = { x: number; y: number };

export type GreenlogMapStyle = {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
    radius?: number;
    width?: number;
    height?: number;
};

export type GreenlogShapePreset = {
    shape: GreenlogMapShape;
    label: string;
    description: string;
    defaultStyle: Required<GreenlogMapStyle>;
};

export const GREENLOG_SHAPE_LIBRARY: GreenlogShapePreset[] = [
    {
        shape: 'point',
        label: 'Точка',
        description: 'Одиночное дерево',
        defaultStyle: { fill: '#166534', stroke: '#14532d', strokeWidth: 2, opacity: 1, radius: 5, width: 2, height: 2 },
    },
    {
        shape: 'circle',
        label: 'Круг',
        description: 'Круглая клумба',
        defaultStyle: { fill: '#CFECC7', stroke: '#2F855A', strokeWidth: 2, opacity: 0.35, radius: 6, width: 12, height: 12 },
    },
    {
        shape: 'square',
        label: 'Квадрат',
        description: 'Маленький участок',
        defaultStyle: { fill: '#DBEAFE', stroke: '#1D4ED8', strokeWidth: 2, opacity: 0.28, radius: 2, width: 10, height: 10 },
    },
    {
        shape: 'rectangle',
        label: 'Прямоугольник',
        description: 'Здание или парковка',
        defaultStyle: { fill: '#BFDBFE', stroke: '#2563EB', strokeWidth: 2, opacity: 0.28, radius: 6, width: 12, height: 8 },
    },
    {
        shape: 'polygon',
        label: 'Полигон',
        description: 'Сложная форма',
        defaultStyle: { fill: '#FDE68A', stroke: '#D97706', strokeWidth: 2, opacity: 0.28, radius: 0, width: 12, height: 8 },
    },
    {
        shape: 'line',
        label: 'Линия',
        description: 'Посадка вдоль дороги',
        defaultStyle: { fill: '#DCFCE7', stroke: '#15803D', strokeWidth: 4, opacity: 0.9, radius: 0, width: 12, height: 2 },
    },
    {
        shape: 'flower_bed',
        label: 'Клумба',
        description: 'Стилизованная клумба',
        defaultStyle: { fill: '#BBF7D0', stroke: '#15803D', strokeWidth: 2, opacity: 0.38, radius: 12, width: 10, height: 8 },
    },
    {
        shape: 'checkpoint',
        label: 'КПП',
        description: 'Контрольный пункт',
        defaultStyle: { fill: '#E2E8F0', stroke: '#334155', strokeWidth: 2, opacity: 0.95, radius: 4, width: 8, height: 8 },
    },
] as const;

export const GREENLOG_PATH_SHAPES: GreenlogMapShape[] = ['polygon', 'line'];
export const GREENLOG_BOX_SHAPES: GreenlogMapShape[] = [
    'circle',
    'square',
    'rectangle',
    'flower_bed',
    'checkpoint',
];

export function clampZoom(value: number): number {
    return Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, Number(value.toFixed(2))));
}

export function clampMapPercent(value: number): number {
    return Math.min(100, Math.max(0, Number(value.toFixed(2))));
}

export function clampRectangleOrigin(origin: number, size: number): number {
    return clampMapPercent(Math.min(origin, 100 - size));
}

export function getShapePreset(shape: GreenlogMapShape): GreenlogShapePreset {
    return GREENLOG_SHAPE_LIBRARY.find((item) => item.shape === shape) ?? GREENLOG_SHAPE_LIBRARY[0];
}

export function getDefaultShapeStyle(shape: GreenlogMapShape): Required<GreenlogMapStyle> {
    return { ...getShapePreset(shape).defaultStyle };
}

export function getLocationShape(location?: Pick<GreenlogLocation, 'map_shape'> | null): GreenlogMapShape {
    const candidate = location?.map_shape;

    if (GREENLOG_SHAPE_LIBRARY.some((item) => item.shape === candidate)) {
        return candidate as GreenlogMapShape;
    }

    return 'point';
}

export function hasMapPoint(location: Pick<GreenlogLocation, 'map_x' | 'map_y'>): boolean {
    return location.map_x !== null && location.map_y !== null;
}

export function isPathShape(shape: GreenlogMapShape): boolean {
    return GREENLOG_PATH_SHAPES.includes(shape);
}

export function isBoxShape(shape: GreenlogMapShape): boolean {
    return GREENLOG_BOX_SHAPES.includes(shape);
}

export function normalizeMapStyle(location?: Pick<GreenlogLocation, 'map_shape' | 'map_style'> | null): Required<GreenlogMapStyle> {
    const shape = getLocationShape(location);
    const defaults = getDefaultShapeStyle(shape);
    const style = location?.map_style ?? {};

    return {
        fill: typeof style.fill === 'string' && style.fill !== '' ? style.fill : defaults.fill,
        stroke: typeof style.stroke === 'string' && style.stroke !== '' ? style.stroke : defaults.stroke,
        strokeWidth: typeof style.strokeWidth === 'number' ? style.strokeWidth : defaults.strokeWidth,
        opacity: typeof style.opacity === 'number' ? style.opacity : defaults.opacity,
        radius: typeof style.radius === 'number' ? style.radius : defaults.radius,
        width: typeof style.width === 'number' ? style.width : defaults.width,
        height: typeof style.height === 'number' ? style.height : defaults.height,
    };
}

export const getLocationStyle = normalizeMapStyle;

export function hasRectangleSize(location: Pick<GreenlogLocation, 'map_width' | 'map_height'>): boolean {
    return typeof location.map_width === 'number'
        && typeof location.map_height === 'number'
        && location.map_width > 0
        && location.map_height > 0;
}

export function getRectangleWidth(location?: Pick<GreenlogLocation, 'map_width' | 'map_style' | 'map_shape'> | null): number {
    if (typeof location?.map_width === 'number' && location.map_width > 0) {
        return location.map_width;
    }

    return normalizeMapStyle(location).width;
}

export function getRectangleHeight(location?: Pick<GreenlogLocation, 'map_height' | 'map_style' | 'map_shape'> | null): number {
    if (typeof location?.map_height === 'number' && location.map_height > 0) {
        return location.map_height;
    }

    return normalizeMapStyle(location).height;
}

export function normalizePolygonPoints(location?: Pick<GreenlogLocation, 'map_polygon'> | null): GreenlogPolygonPoint[] {
    if (!Array.isArray(location?.map_polygon)) {
        return [];
    }

    return location.map_polygon.filter((point) => (
        point
        && typeof point.x === 'number'
        && typeof point.y === 'number'
    )).map((point) => ({
        x: clampMapPercent(point.x),
        y: clampMapPercent(point.y),
    }));
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

export function getLineMidpoint(points: GreenlogPolygonPoint[]): GreenlogPolygonPoint | null {
    if (points.length < 2) {
        return null;
    }

    return {
        x: clampMapPercent((points[0].x + points[1].x) / 2),
        y: clampMapPercent((points[0].y + points[1].y) / 2),
    };
}

export function getLocationAnchor(location?: Partial<GreenlogLocation> | null): GreenlogPolygonPoint {
    const shape = getLocationShape(location as Pick<GreenlogLocation, 'map_shape'> | null);

    if (shape === 'polygon') {
        return getPolygonAnchor(normalizePolygonPoints(location as Pick<GreenlogLocation, 'map_polygon'> | null)) ?? {
            x: clampMapPercent(location?.map_x ?? 50),
            y: clampMapPercent(location?.map_y ?? 50),
        };
    }

    if (shape === 'line') {
        return getLineMidpoint(normalizePolygonPoints(location as Pick<GreenlogLocation, 'map_polygon'> | null)) ?? {
            x: clampMapPercent(location?.map_x ?? 50),
            y: clampMapPercent(location?.map_y ?? 50),
        };
    }

    if (isBoxShape(shape)) {
        const width = getRectangleWidth(location as Pick<GreenlogLocation, 'map_width' | 'map_style' | 'map_shape'> | null);
        const height = getRectangleHeight(location as Pick<GreenlogLocation, 'map_height' | 'map_style' | 'map_shape'> | null);

        return {
            x: clampMapPercent((location?.map_x ?? 50) + (width / 2)),
            y: clampMapPercent((location?.map_y ?? 50) + (height / 2)),
        };
    }

    return {
        x: clampMapPercent(location?.map_x ?? 50),
        y: clampMapPercent(location?.map_y ?? 50),
    };
}

export function buildDefaultPathPoints(shape: GreenlogMapShape, anchor: GreenlogPolygonPoint): GreenlogPolygonPoint[] {
    if (shape === 'line') {
        return [
            { x: clampMapPercent(anchor.x - 6), y: clampMapPercent(anchor.y) },
            { x: clampMapPercent(anchor.x + 6), y: clampMapPercent(anchor.y) },
        ];
    }

    return [
        { x: clampMapPercent(anchor.x), y: clampMapPercent(anchor.y - 5) },
        { x: clampMapPercent(anchor.x + 6), y: clampMapPercent(anchor.y + 4) },
        { x: clampMapPercent(anchor.x - 6), y: clampMapPercent(anchor.y + 4) },
    ];
}

export function shiftPolygonPoints(points: GreenlogPolygonPoint[], deltaX: number, deltaY: number): GreenlogPolygonPoint[] {
    return points.map((point) => ({
        x: clampMapPercent(point.x + deltaX),
        y: clampMapPercent(point.y + deltaY),
    }));
}

export function hasRenderableShape(location: Pick<GreenlogLocation, 'map_shape' | 'map_x' | 'map_y' | 'map_polygon'>): boolean {
    const shape = getLocationShape(location);

    if (shape === 'polygon') {
        return normalizePolygonPoints(location).length >= 3;
    }

    if (shape === 'line') {
        return normalizePolygonPoints(location).length >= 2;
    }

    return hasMapPoint(location);
}

export function getTotalPlantsQuantity(plants: GreenlogPlant[]): number {
    return plants.reduce((sum, plant) => sum + (plant.quantity ?? 0), 0);
}

export function getPlantSpeciesCount(plants: GreenlogPlant[]): number {
    return new Set(
        plants.map((plant) => plant.species?.id ?? plant.species?.name ?? plant.name).filter(Boolean),
    ).size;
}
