import { PlaceholderPattern } from '@/components/ui/placeholder-pattern';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { Tascks } from '@/components/tasks/task';
import axios from 'axios';
import React, { useEffect, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Задания',
        href: '/tasks',
    },
];

export default function Tasks() {


    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Задания" />
            
            <Tascks />
                
           
        </AppLayout>
    );
}
