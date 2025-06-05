import AppLayout from '@/layouts/app-layout';
import WarehouseLayout from '@/layouts/warehouse-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import React, { useState, useEffect } from "react";
import WarehousesTableGates from '@/components/warehouseGate/warehouseGateTable';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Ворота',
        href: '/warehouses/gate',
    },
];

export default function Warehouses() {
    const [gates, setGates] = useState([]);
    const [loading, setLoading] = useState(true);

     useEffect(() => {}, []);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Складские ворота" />
            <WarehouseLayout>
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="border-sidebar-border/70 dark:border-sidebar-border relative min-h-[100vh] flex-1 overflow-hidden rounded-xl border md:min-h-min p-4">
                    <WarehousesTableGates gates={gates} loading={loading} />
                </div>

            </div>
            </WarehouseLayout>
        </AppLayout>
    );
}
