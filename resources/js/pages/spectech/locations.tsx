import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import { type BreadcrumbItem } from '@/types';
import { Building2, MapPin, Route, Search } from 'lucide-react';
import TerminalScheme from '@/components/spectech/TerminalScheme';
import {
    MOCK_LOCATIONS,
    TERMINAL_INFO,
    formatLocationStatus,
    hasTerminalScheme,
} from '@/components/spectech/MOCK_LOCATIONS';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Спецтехника', href: '/spectech/locations' },
    { title: 'Зоны терминалов', href: '/spectech/locations' },
];

const TERMINALS = ['T1', 'T2', 'T3', 'T4'] as const;

const STATUS_STYLES: Record<string, string> = {
    active: 'border-green-200 bg-green-100 text-green-700',
    pending: 'border-yellow-200 bg-yellow-100 text-yellow-700',
    empty: 'border-gray-200 bg-gray-100 text-gray-500',
};

export default function SpectechLocations() {
    const [terminal, setTerminal] = useState<(typeof TERMINALS)[number]>('T1');
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [scale, setScale] = useState(1.25);

    const rows = useMemo(
        () => MOCK_LOCATIONS.filter((location) => location.terminal === terminal),
        [terminal],
    );

    const filteredRows = useMemo(() => {
        const query = search.trim().toLowerCase();

        if (query === '') {
            return rows;
        }

        return rows.filter((row) => (
            `${row.building} ${row.purpose} ${row.gate}`.toLowerCase().includes(query)
        ));
    }, [rows, search]);

    useEffect(() => {
        if (rows.length === 0) {
            setSelectedId(null);
            return;
        }

        if (!selectedId || !rows.some((row) => row.id === selectedId)) {
            setSelectedId(rows[0].id);
        }
    }, [rows, selectedId]);

    const selectedRow = rows.find((row) => row.id === selectedId) ?? null;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Зоны терминалов" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="flex items-center gap-2 text-lg font-semibold">
                        <MapPin className="h-5 w-5 text-red-600" />
                        Зоны терминалов
                    </h1>
                    <a
                        href="/notification/terminal-map.pdf"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm hover:bg-muted"
                    >
                        Открыть PDF-схему
                    </a>
                </div>

                <div className="flex flex-wrap gap-2">
                    {TERMINALS.map((item) => (
                        <button
                            key={item}
                            onClick={() => {
                                setTerminal(item);
                                setSearch('');
                            }}
                            className={`h-8 rounded-md border px-3 text-sm font-medium transition-colors ${
                                terminal === item
                                    ? 'border-red-600 bg-red-600 text-white'
                                    : 'border-border bg-background hover:bg-muted'
                            }`}
                        >
                            {item}
                        </button>
                    ))}
                </div>

                <div className={`rounded-md border px-3 py-2 text-xs ${TERMINAL_INFO[terminal]?.color || 'border-border'}`}>
                    {TERMINAL_INFO[terminal]?.description}
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_360px]">
                    <div className="space-y-4">
                        {hasTerminalScheme(terminal) ? (
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-xs text-muted-foreground">
                                        Короткие коды показаны на схеме, полное название смотрите справа.
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {[1, 1.25, 1.5].map((value) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => setScale(value)}
                                                className={`h-8 rounded-md border px-2.5 text-xs font-medium ${
                                                    scale === value
                                                        ? 'border-red-600 bg-red-600 text-white'
                                                        : 'border-border bg-background hover:bg-muted'
                                                }`}
                                            >
                                                {Math.round(value * 100)}%
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <TerminalScheme
                                    terminal={terminal}
                                    locations={rows}
                                    selectedLocationId={selectedId}
                                    onSelectLocation={(location) => setSelectedId(location.id)}
                                    scale={scale}
                                />
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-sm text-muted-foreground">
                                Для этого терминала схема пока не перенесена. Текущие точки оставлены без изменений.
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="rounded-lg border bg-card p-4">
                            <div className="relative">
                                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Поиск по коду, зоне, назначению"
                                    className="h-9 w-full rounded-md border border-border bg-background pr-3 pl-9 text-sm outline-none focus:ring-2 focus:ring-red-600/20"
                                />
                            </div>
                            <div className="mt-3 text-xs text-muted-foreground">
                                Найдено точек: <strong>{filteredRows.length}</strong>
                            </div>
                        </div>

                        {selectedRow && (
                            <div className="rounded-lg border bg-card p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="flex items-center gap-2 text-sm font-semibold">
                                            <Building2 className="h-4 w-4 text-red-600" />
                                            {selectedRow.building}
                                        </div>
                                        <div className="mt-1 text-xs text-muted-foreground">{selectedRow.purpose}</div>
                                    </div>
                                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLES[selectedRow.status]}`}>
                                        {formatLocationStatus(selectedRow.status)}
                                    </span>
                                </div>

                                <div className="mt-4 space-y-2 text-sm">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <MapPin className="h-4 w-4" />
                                        Терминал: <strong className="text-foreground">{selectedRow.terminal}</strong>
                                    </div>
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Route className="h-4 w-4" />
                                        Гейт: <strong className="text-foreground">{selectedRow.gate || 'Не указан'}</strong>
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        Диапазон на схеме: <strong className="text-foreground">{selectedRow.range || '—'}</strong>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            {filteredRows.map((row) => (
                                <button
                                    key={row.id}
                                    type="button"
                                    onClick={() => setSelectedId(row.id)}
                                    className={`block w-full rounded-lg border p-3 text-left transition ${
                                        selectedId === row.id
                                            ? 'border-red-300 bg-red-50 shadow-sm'
                                            : 'border-border bg-card hover:bg-muted/40'
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="text-sm font-semibold">{row.building}</div>
                                            <div className="mt-1 text-xs text-muted-foreground">{row.purpose}</div>
                                        </div>
                                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLES[row.status]}`}>
                                            {formatLocationStatus(row.status)}
                                        </span>
                                    </div>
                                    <div className="mt-2 text-[11px] text-muted-foreground">
                                        {row.gate ? `Гейт: ${row.gate}` : 'Гейт не указан'}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
