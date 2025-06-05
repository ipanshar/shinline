import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import Statistics from '@/components/statistics/Statistics';
import TrafficChart from '@/components/statistics/TrafficChart';
import TableTaskStat from '@/components/statistics/TableTaskStat';
import TrackListStat from '@/components/statistics/TrackListStat';
import TaskLoadingStats from '@/components/statistics/TaskLoadingStats';

    

export default function Statisticspage() {


    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: 'Статистика',
            href: '/statistics',
        },
    ];
    
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Статистика"/>
        
                <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
                    <TrafficChart />
                    <Statistics />
                    <TableTaskStat/>
                    <TrackListStat/>
                    <TaskLoadingStats/>
                </div>
              
        </AppLayout>
    );
}
