import { useState } from 'react';
import VisitorHistory from '@/components/check/VisitorHistory';
import MovementTimeline from '@/components/history/MovementTimeline';
import TruckSelector from '@/components/history/TaskSelector';
import TruckLocationMap from '@/components/history/TruckLocationMap';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'История',
        href: '/history',
    },
];

type HistoryView = 'visits' | 'zones';

function TruckZoneHistoryView() {
    const [truckId, setTruckId] = useState<number | null>(null);

    return (
        <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="mb-4 space-y-1">
                    <h2 className="text-lg font-semibold">История движения по зонам</h2>
                    <p className="text-sm text-muted-foreground">
                        Выберите транспортное средство, чтобы посмотреть его маршрут по зонам и текущее положение.
                    </p>
                </div>
                <TruckSelector onTruckSelect={setTruckId} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                <div className="min-h-[420px] overflow-hidden rounded-xl border bg-card shadow-sm">
                    <TruckLocationMap truckId={truckId} />
                </div>
                <div className="min-h-[420px] overflow-hidden rounded-xl border bg-card shadow-sm">
                    <MovementTimeline truckId={truckId} />
                </div>
            </div>
        </div>
    );
}

export default function History() {
    const [activeView, setActiveView] = useState<HistoryView>('visits');

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="История" />
            <div className="flex flex-col gap-4">
                <div className="px-4 pt-4">
                    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                            <h1 className="text-xl font-semibold">История</h1>
                            <p className="text-sm text-muted-foreground">
                                Переключайтесь между историей посещений и историей движения машины по зонам.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant={activeView === 'visits' ? 'default' : 'outline'}
                                onClick={() => setActiveView('visits')}
                            >
                                История посещений
                            </Button>
                            <Button
                                type="button"
                                variant={activeView === 'zones' ? 'default' : 'outline'}
                                onClick={() => setActiveView('zones')}
                            >
                                История по зонам
                            </Button>
                        </div>
                    </div>
                </div>

                {activeView === 'visits' ? <VisitorHistory /> : <TruckZoneHistoryView />}
            </div>
        </AppLayout>
    );
}
