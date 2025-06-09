import React from 'react';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import DSSConnectionSettings from '@/components/dss/DSSConnectionSettings';



const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Интеграция DSS',
        href: '/integration_dss',
    },
];

export default function Integration_dss() {


    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Интеграция DSS" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
            <DSSConnectionSettings/>
        
            </div>
        </AppLayout>
    );
}
