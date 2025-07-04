import { PlaceholderPattern } from '@/components/ui/placeholder-pattern';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import UserTasks from '@/components/tasks/UserTasks';
import Statistics from '@/components/statistics/Statistics';
import { useTranslation } from 'react-i18next';
import TrafficChart from '@/components/statistics/TrafficChart';
import TableTaskStat from '@/components/statistics/TableTaskStat';
import TrackListStat from '@/components/statistics/TrackListStat';
import TaskLoadingStats from '@/components/statistics/TaskLoadingStats';

    

export default function Dashboard() {

    const { t } = useTranslation();

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('home'),
            href: '/dashboard',
        },
    ];
    
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('home')}/>
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
         
                <div className="grid auto-rows-min gap-4 md:grid-cols-3">
                    <UserTasks/>
                   
                </div>
                {/* <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
                    <TrafficChart />
                    <Statistics />
                    <TableTaskStat/>
                    <TrackListStat/>
                    <TaskLoadingStats/>
                </div> */}
                <div className="border-sidebar-border/70 dark:border-sidebar-border relative min-h-[100vh] flex-1 overflow-hidden rounded-xl border md:min-h-min">
                    <PlaceholderPattern className="absolute inset-0 size-full stroke-neutral-900/20 dark:stroke-neutral-100/20" />
                </div>
            </div>
        </AppLayout>
    );
}
