import AppLayout from '@/layouts/app-layout';
import TaskLayouts from '@/layouts/task-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Tascks } from '@/components/tasks/task';
import { useTranslation } from 'react-i18next';
import TascksMiddle from '@/components/tasks/TasksMiddle';


export default function Tasks() {



    const { t } = useTranslation();

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('tasks'),
            href: '/tasks',
        },
    ];


    return (
        <AppLayout breadcrumbs={breadcrumbs}>
             <Head title={t('tasks')} />
            <TaskLayouts>
            
            <TascksMiddle />
            
             </TaskLayouts>   
           
        </AppLayout>
    );
}
