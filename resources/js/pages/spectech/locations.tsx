import React, { useMemo, useState } from 'react';
import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import { type BreadcrumbItem } from '@/types';
import { MapPin, Building2, Route } from 'lucide-react';
import { MOCK_LOCATIONS, TERMINAL_INFO } from '@/components/spectech/MOCK_LOCATIONS';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Спецтехника', href: '/spectech/locations' },
    { title: 'Зоны терминалов', href: '/spectech/locations' },
];

const TERMINALS = ['T1', 'T2', 'T3', 'T4'] as const;

const STATUS_LABELS: Record<string, string> = {
    active: 'Активен',
    pending: 'Строится',
    empty: 'Пусто',
};

const STATUS_STYLES: Record<string, string> = {
    active: 'bg-green-100 text-green-700 border-green-200',
    pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    empty: 'bg-gray-100 text-gray-500 border-gray-200',
};

export default function SpectechLocations() {
    const [terminal, setTerminal] = useState<(typeof TERMINALS)[number]>('T1');

    const rows = useMemo(() => MOCK_LOCATIONS.filter((x) => x.terminal === terminal), [terminal]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Зоны терминалов" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h1 className="text-lg font-semibold flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-red-600" />
                        Зоны терминалов
                    </h1>
                    <a
                        href="/notification/terminal-map.pdf"
                        target="_blank"
                        rel="noreferrer"
                        className="h-9 px-3 rounded-md border border-border text-sm inline-flex items-center hover:bg-muted"
                    >
                        Открыть схему
                    </a>
                </div>

                <div className="flex gap-2 flex-wrap">
                    {TERMINALS.map((t) => (
                        <button
                            key={t}
                            onClick={() => setTerminal(t)}
                            className={`px-3 h-8 rounded-md border text-sm font-medium transition-colors ${
                                terminal === t ? 'bg-red-600 border-red-600 text-white' : 'border-border bg-background hover:bg-muted'
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>

                <div className={`rounded-md border px-3 py-2 text-xs ${TERMINAL_INFO[terminal]?.color || 'border-border'}`}>
                    {TERMINAL_INFO[terminal]?.description}
                </div>

                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {rows.map((row) => (
                        <div key={row.id} className="border border-border rounded-lg bg-card p-4 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                    <Building2 className="h-4 w-4 text-red-600" />
                                    {row.building}
                                </div>
                                <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_STYLES[row.status]}`}>
                                    {STATUS_LABELS[row.status]}
                                </span>
                            </div>

                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Route className="h-3.5 w-3.5" />
                                Гейт: {row.gate}
                            </div>
                            <div className="text-xs text-muted-foreground">Назначение: {row.purpose}</div>
                        </div>
                    ))}
                </div>
            </div>
        </AppLayout>
    );
}

