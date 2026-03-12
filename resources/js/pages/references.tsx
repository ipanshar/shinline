import React from 'react';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import CounterpartiesTable from '@/components/counterparties/CounterpartiesTable';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Контрагенты',
        href: '/references',
    },
];

export default function References() {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Контрагенты" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="border-sidebar-border/70 dark:border-sidebar-border relative min-h-[100vh] flex-1 overflow-hidden rounded-xl border md:min-h-min p-4">
                    <CounterpartiesTable />
                </div>
            </div>
        </AppLayout>
    );
}
