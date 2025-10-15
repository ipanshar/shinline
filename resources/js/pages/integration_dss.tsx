import React from 'react';
import AppLayout from '@/layouts/app-layout';
import DSSLayout from '@/layouts/dss-layout';
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
                <div className="border-sidebar-border/70 dark:border-sidebar-border relative min-h-[100vh] flex-1 overflow-hidden rounded-xl border md:min-h-min p-4">
                    <DSSLayout>
                        <DSSConnectionSettings />
                    </DSSLayout>
                </div>
            </div>
        </AppLayout>
    );
}
