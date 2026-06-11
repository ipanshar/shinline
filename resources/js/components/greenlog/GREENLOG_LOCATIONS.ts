import { type GreenlogLocation } from '@/lib/greenlog-api';

export function buildGreenlogLocationSearchValue(location: GreenlogLocation): string {
    return [
        location.building,
        location.floor,
        location.room,
        location.factory_zone,
        location.sector,
        location.description,
        location.type,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

export function buildGreenlogLocationTitle(location: GreenlogLocation): string {
    return location.building || location.factory_zone || location.room || `Локация #${location.id}`;
}

export function buildGreenlogLocationSubtitle(location: GreenlogLocation): string {
    return [location.floor, location.room, location.factory_zone, location.sector].filter(Boolean).join(' / ')
        || 'Без уточнения';
}

export function buildGreenlogLocationMeta(location: GreenlogLocation): string {
    return [
        location.type ? `Тип: ${location.type}` : null,
        location.floor ? `Этаж: ${location.floor}` : null,
        location.factory_zone ? `Зона: ${location.factory_zone}` : null,
        location.sector ? `Сектор: ${location.sector}` : null,
    ]
        .filter(Boolean)
        .join(' | ');
}

export function clampGreenlogMarkerSize(value?: number | null): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return 8;
    }

    return Math.min(32, Math.max(6, Math.round(value)));
}
