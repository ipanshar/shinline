import React from 'react';
import AppLayout from '@/layouts/app-layout';
import ReferencesLayout from '@/layouts/references-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { FileText } from 'lucide-react';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Справочники',
        href: '/references',
    },
    {
        title: 'Пусто',
        href: '/references/empty',
    },
];

export default function ReferencesEmpty() {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Пусто - Справочники" />
            <div className="flex h-full flex-1 flex-col gap-4 rounded-xl p-4">
                <div className="border-sidebar-border/70 dark:border-sidebar-border relative min-h-[100vh] flex-1 overflow-hidden rounded-xl border md:min-h-min p-4">
                    <ReferencesLayout>
                        <div className="flex min-h-[400px] items-center justify-center">
                            <div className="text-center">
                                <FileText className="mx-auto h-16 w-16 text-muted-foreground" />
                                <h3 className="mt-4 text-xl font-semibold">Раздел в разработке</h3>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Этот раздел справочников будет доступен позже
                                </p>
                            </div>
                        </div>
                    </ReferencesLayout>
                </div>
            </div>
        </AppLayout>
    );
}
