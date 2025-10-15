import AppLayout from '@/layouts/app-layout';
import WarehouseLayout from '@/layouts/warehouse-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import React, { useState, useEffect } from "react";
import KPPTable from '@/components/KPP/KPPTable';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'КПП',
        href: '/warehouses/kpp',
    },
];

export default function Warehouses() {
    const [kpp, setKpp] = useState([]);
    const [loading, setLoading] = useState(true);

     useEffect(() => {}, []);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="КПП" />
            <WarehouseLayout>
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="border-sidebar-border/70 dark:border-sidebar-border relative min-h-[100vh] flex-1 overflow-hidden rounded-xl border md:min-h-min p-4">
                    <KPPTable kpp={kpp} loading={loading} />
                </div>

            </div>
            </WarehouseLayout>
        </AppLayout>
    );
}
