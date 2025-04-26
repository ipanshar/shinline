import { PlaceholderPattern } from '@/components/ui/placeholder-pattern';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import React, { useState, useEffect } from "react";
import axios from "axios";
import WarehousesTable from '@/components/warehauses/WarehousesTable';


const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Склады',
        href: '/warehouses',
    },
];

export default function Warehouses() {
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(true);


    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Склады" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="border-sidebar-border/70 dark:border-sidebar-border relative min-h-[100vh] flex-1 overflow-hidden rounded-xl border md:min-h-min p-4">
                    <WarehousesTable warehouses={warehouses} loading={loading} />
                </div>

            </div>
        </AppLayout>
    );
}