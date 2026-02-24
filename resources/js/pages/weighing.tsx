import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import WeighingControl from '@/components/check/WeighingControl';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Взвешивание',
        href: '/weighing',
    },
];

export default function Weighing() {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Весовой контроль" />
            <WeighingControl />
        </AppLayout>
    );
}
