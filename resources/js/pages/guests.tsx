import React from 'react';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import GuestVisitsManager from '@/components/guests/GuestVisitsManager';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Гости',
        href: '/guests',
    },
];

export default function Guests() {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Гости" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="border-sidebar-border/70 dark:border-sidebar-border relative min-h-[100vh] flex-1 overflow-hidden rounded-xl border p-4 md:min-h-min">
                    <GuestVisitsManager />
                </div>
            </div>
        </AppLayout>
    );
}