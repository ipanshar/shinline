import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import EntryPermitsManager from '@/components/check/EntryPermitsManager';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Разрешения на въезд',
        href: '/permits',
    },
];

export default function Permits() {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Разрешения на въезд" />
            <div className="p-4">
                <EntryPermitsManager />
            </div>
        </AppLayout>
    );
}
