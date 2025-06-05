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
    const [codes, setCodes] = useState([]);

    useEffect(() => {
        axios.get('/task/gate-codes')
        .then(res => setCodes(res.data.data))
        .catch(err => console.error(err));
        console.log(codes)
    }, [codes]);


    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Склады" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="border-sidebar-border/70 dark:border-sidebar-border relative min-h-[100vh] flex-1 overflow-hidden rounded-xl border md:min-h-min p-4">
                    <WarehousesTable warehouses={warehouses} loading={loading} />

                    <table className="min-w-full text-sm border mt-4">
                        <thead className="bg-gray-100 font-semibold">
                            <tr>
                            <th className="p-2 border">Двор</th>
                            <th className="p-2 border">Склад</th>
                            <th className="p-2 border">Ворота</th>
                            <th className="p-2 border">Код</th>
                            </tr>
                        </thead>
                        <tbody>
                            {codes.map((item, i) => (
                            <tr key={i} className="border-t">
                                <td className="p-2 border">{item.yard_name}</td>
                                <td className="p-2 border">{item.warehouse_name}</td>
                                <td className="p-2 border">{item.gate_name}</td>
                                <td className="p-2 border font-mono">{item.code}</td>
                            </tr>
                            ))}
                        </tbody>
                        </table>

                </div>

            </div>
        </AppLayout>
    );
}