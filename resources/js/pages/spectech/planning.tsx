import React from 'react';
import AppLayout from '@/layouts/app-layout';
import { Head } from '@inertiajs/react';
import { type BreadcrumbItem } from '@/types';
import SpectechPlanningManager from '@/components/spectech/SpectechPlanningManager';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Спецтехника', href: '/spectech/requests' },
    { title: 'Планирование', href: '/spectech/planning' },
];

export default function SpectechPlanning() {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Планирование спецтехники" />
            <div className="flex h-full flex-1 flex-col gap-4 p-4">
                <SpectechPlanningManager />
            </div>
        </AppLayout>
    );
}

