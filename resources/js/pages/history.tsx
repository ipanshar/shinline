import { useState } from 'react';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import TruckSelector from '@/components/history/TaskSelector';
import TruckLocationMap from '@/components/history/TruckLocationMap';
import MovementTimeline from '@/components/history/MovementTimeline';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'История',
        href: '/history',
    },
];

export default function History() {
    const [truckId, setTruckId] = useState<number | null>(null);

    const handleTruckSelect = (selectedTruckId: number | null) => {
        setTruckId(selectedTruckId);
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="История" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                {/* Селектор грузовика */}
                <div className="bg-card border rounded-lg p-4">
                    <TruckSelector onTruckSelect={handleTruckSelect} />
                </div>

                {/* Основной контент */}
                <div className="grid gap-4 md:grid-cols-2 flex-1">
                    {/* Карта с местоположением */}
                    <div className="border rounded-lg overflow-hidden min-h-[400px]">
                        <TruckLocationMap truckId={truckId} />
                    </div>
                    
                    {/* История передвижений */}
                    <div className="border rounded-lg overflow-hidden min-h-[400px]">
                        <MovementTimeline truckId={truckId} />
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
