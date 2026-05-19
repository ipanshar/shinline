import React, { useMemo } from 'react';
import {
    MOCK_LOCATIONS,
    TERMINAL_SCHEME_ITEMS,
    TERMINAL_SCHEME_LAYOUTS,
    type KnownTerminal,
    type Location,
    type SchemeTone,
} from './MOCK_LOCATIONS';

type ParsedRange = {
    startCol: number;
    endCol: number;
    startRow: number;
    endRow: number;
};

const TONE_STYLES: Record<SchemeTone, string> = {
    zone: 'border-slate-300 bg-slate-100/90 text-slate-700',
    storage: 'border-blue-300 bg-blue-100/90 text-blue-800',
    production: 'border-emerald-300 bg-emerald-100/90 text-emerald-800',
    office: 'border-violet-300 bg-violet-100/90 text-violet-800',
    service: 'border-amber-300 bg-amber-100/90 text-amber-900',
};

function parseCellRef(value: string): { col: number; row: number } {
    const match = value.match(/^([A-Z]+)(\d+)$/);
    if (!match) {
        return { col: 1, row: 1 };
    }

    const [, colLetters, rowDigits] = match;
    let col = 0;

    for (const char of colLetters) {
        col = (col * 26) + (char.charCodeAt(0) - 64);
    }

    return { col, row: parseInt(rowDigits, 10) };
}

function parseRange(value: string): ParsedRange {
    const normalized = value.includes(':') ? value : `${value}:${value}`;
    const [start, end] = normalized.split(':');
    const startCell = parseCellRef(start);
    const endCell = parseCellRef(end);

    return {
        startCol: Math.min(startCell.col, endCell.col),
        endCol: Math.max(startCell.col, endCell.col),
        startRow: Math.min(startCell.row, endCell.row),
        endRow: Math.max(startCell.row, endCell.row),
    };
}

function getBlockStyle(range: ParsedRange, cols: number, rows: number): React.CSSProperties {
    const left = ((range.startCol - 1) / cols) * 100;
    const top = ((range.startRow - 1) / rows) * 100;
    const width = ((range.endCol - range.startCol + 1) / cols) * 100;
    const height = ((range.endRow - range.startRow + 1) / rows) * 100;

    return {
        left: `${left}%`,
        top: `${top}%`,
        width: `${width}%`,
        height: `${height}%`,
    };
}

function getBlockMetrics(range: ParsedRange) {
    const widthCells = range.endCol - range.startCol + 1;
    const heightCells = range.endRow - range.startRow + 1;
    const areaCells = widthCells * heightCells;

    return {
        widthCells,
        heightCells,
        areaCells,
        isTiny: areaCells <= 16 || widthCells <= 4 || heightCells <= 2,
        isSmall: areaCells <= 36 || widthCells <= 6 || heightCells <= 3,
        isNarrow: widthCells <= 4,
        needsExternalLabel: widthCells <= 5 || (areaCells <= 20 && heightCells <= 3),
    };
}

export default function TerminalScheme({
    terminal,
    locations,
    selectedLocationId,
    onSelectLocation,
    compact = false,
    scale = 1,
    className = '',
}: {
    terminal: KnownTerminal;
    locations: Location[];
    selectedLocationId?: number | null;
    onSelectLocation?: (location: Location) => void;
    compact?: boolean;
    scale?: number;
    className?: string;
}) {
    const layout = terminal in TERMINAL_SCHEME_LAYOUTS
        ? TERMINAL_SCHEME_LAYOUTS[terminal as keyof typeof TERMINAL_SCHEME_LAYOUTS]
        : null;

    const locationMap = useMemo(() => {
        const terminalLocations = MOCK_LOCATIONS.filter((location) => location.terminal === terminal);
        const combined = [...terminalLocations];

        for (const location of locations) {
            if (!combined.some((item) => item.id === location.id)) {
                combined.push(location);
            }
        }

        return new Map(combined.map((location) => [location.id, location]));
    }, [locations, terminal]);

    const items = useMemo(() => (
        TERMINAL_SCHEME_ITEMS
            .filter((item) => item.terminal === terminal)
            .map((item) => ({
                ...item,
                rangeInfo: parseRange(item.range),
                location: item.locationId ? locationMap.get(item.locationId) ?? null : null,
            }))
    ), [locationMap, terminal]);

    if (!layout) {
        return null;
    }

    return (
        <div className={`space-y-3 ${className}`}>
            {!compact && (
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                        Производство
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-blue-300" />
                        Склады и отгрузка
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-violet-300" />
                        Кабинеты и лаборатории
                    </span>
                    <span className="inline-flex items-center gap-1">
                        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                        Сервисные объекты
                    </span>
                </div>
            )}

            <div className="overflow-auto rounded-lg border bg-white">
                <div
                    className="relative min-w-[820px] bg-slate-50"
                    style={{
                        width: `${Math.max(scale, 1) * 100}%`,
                        minWidth: `${Math.round(820 * Math.max(scale, 1))}px`,
                        aspectRatio: `${layout.cols}/${Math.max(layout.rows * 0.72, 1)}`,
                        backgroundImage: [
                            'linear-gradient(to right, rgba(148,163,184,0.12) 1px, transparent 1px)',
                            'linear-gradient(to bottom, rgba(148,163,184,0.12) 1px, transparent 1px)',
                        ].join(','),
                        backgroundSize: `${100 / layout.cols}% 100%, 100% ${100 / layout.rows}%`,
                    }}
                >
                    <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
                        <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-500 shadow-sm">
                            N-Север
                        </span>
                    </div>
                    <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
                        <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-500 shadow-sm">
                            S-Юг
                        </span>
                    </div>
                    <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
                        <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-500 shadow-sm">
                            W-Запад
                        </span>
                    </div>

                    {items.map((item) => {
                        const isSelected = item.locationId === selectedLocationId;
                        const label = item.location
                            ? `${item.location.building}${item.location.purpose !== 'Объект терминала' ? ` / ${item.location.purpose}` : ''}`
                            : item.label;
                        const metrics = getBlockMetrics(item.rangeInfo);
                        const buildingLabel = item.location?.building ?? item.label;
                        const compactLabel = item.location?.shortLabel ?? buildingLabel;
                        const purposeLabel = item.location?.purpose && item.location.purpose !== 'Объект терминала'
                            ? item.location.purpose
                            : null;
                        const externalLabel = metrics.needsExternalLabel;
                        const content = (
                            <>
                                <span
                                    className={`block font-semibold leading-tight ${
                                        metrics.isTiny
                                            ? 'text-[9px]'
                                            : metrics.isSmall
                                              ? 'text-[10px]'
                                              : 'text-[11px]'
                                    }`}
                                >
                                    {compactLabel}
                                </span>
                                {!compact && purposeLabel && !metrics.isTiny && !externalLabel && (
                                    <span
                                        className={`mt-0.5 block leading-tight opacity-90 ${
                                            metrics.isSmall ? 'text-[9px]' : 'text-[10px]'
                                        }`}
                                    >
                                        {purposeLabel}
                                    </span>
                                )}
                            </>
                        );

                        const baseClass = `absolute rounded border px-1 py-0.5 text-left shadow-sm transition ${TONE_STYLES[item.tone]} ${
                            externalLabel ? 'overflow-visible' : metrics.isTiny ? 'overflow-hidden' : 'overflow-auto'
                        } ${metrics.isNarrow ? 'text-center' : ''} ${isSelected ? 'z-20 ring-2 ring-red-500 ring-offset-1' : 'z-10'}`;
                        const style = getBlockStyle(item.rangeInfo, layout.cols, layout.rows);
                        const blockContent = externalLabel ? (
                            <span
                                className={`absolute top-1/2 left-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-white/80 bg-white/95 px-1.5 py-0.5 text-center text-[10px] font-semibold whitespace-nowrap text-slate-800 shadow-sm ${
                                    isSelected ? 'ring-2 ring-red-500/60' : ''
                                }`}
                            >
                                {compactLabel}
                            </span>
                        ) : (
                            content
                        );

                        if (item.location && onSelectLocation) {
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    title={label}
                                    onClick={() => onSelectLocation(item.location!)}
                                    className={`${baseClass} cursor-pointer ${externalLabel ? 'hover:z-30' : 'whitespace-normal break-words hover:brightness-95'}`}
                                    style={style}
                                >
                                    {blockContent}
                                </button>
                            );
                        }

                        return (
                            <div key={item.id} title={label} className={`${baseClass} ${externalLabel ? '' : 'whitespace-normal break-words'}`} style={style}>
                                {blockContent}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
