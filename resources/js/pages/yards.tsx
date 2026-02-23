import WarehouseLayout from '@/layouts/warehouse-layout';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import YardsTable from '@/components/warehauses/YardsTable';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Склады',
        href: '/warehouses',
    },
    {
        title: 'Дворы',
        href: '/warehouses/yards',
    },
];

export default function Yards() {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Дворы" />
            <WarehouseLayout>
                <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                    <div className="border-sidebar-border/70 dark:border-sidebar-border relative min-h-[100vh] flex-1 overflow-hidden rounded-xl border md:min-h-min p-4">
                        <YardsTable />
                    </div>
                </div>
            </WarehouseLayout>
        </AppLayout>
    );
}
