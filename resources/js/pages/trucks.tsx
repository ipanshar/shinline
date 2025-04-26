import TruckList from '@/components/trucks/truckList';
import { PlaceholderPattern } from '@/components/ui/placeholder-pattern';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';


const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Грузовики',
        href: '/trucks',
    },
];

export default function Trucks() {


    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Грузовики" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                   
                <TruckList />
              
            </div>
        </AppLayout>
    );
}
