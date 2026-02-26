import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
import { useTranslation } from 'react-i18next';
import { useUser } from '@/components/UserContext';

// Dashboard components
import WelcomeCard from '@/components/dashboard/WelcomeCard';
import DashboardStats from '@/components/dashboard/DashboardStats';
import QuickNavigation from '@/components/dashboard/QuickNavigation';
import TodayTasks from '@/components/dashboard/TodayTasks';
import MiniTrafficChart from '@/components/dashboard/MiniTrafficChart';
import UserTasks from '@/components/tasks/UserTasks';

export default function Dashboard() {
    const { t } = useTranslation();
    const { user, hasPermission, hasAnyPermission } = useUser();

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('home'),
            href: '/dashboard',
        },
    ];

    // Проверка доступа к статистике
    const canViewStats = user?.isAdmin || hasPermission('statistics.view');
    const canViewTasks = user?.isAdmin || hasPermission('tasks.view');

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('home')} />
            <div className="flex h-full flex-1 flex-col gap-4 p-4 md:p-6">
                {/* Welcome Card */}
                <WelcomeCard />

                {/* Statistics Cards - показываем только при наличии разрешения */}
                {canViewStats && (
                    <section>
                        <h3 className="text-lg font-semibold mb-3">Обзор</h3>
                        <DashboardStats />
                    </section>
                )}

                {/* Quick Navigation */}
                <QuickNavigation />

                {/* Charts and Tasks Section */}
                <div className="grid gap-4 lg:grid-cols-2">
                    {/* Traffic Chart - показываем при наличии разрешения на статистику */}
                    {canViewStats && (
                        <MiniTrafficChart />
                    )}

                    {/* Today Tasks - показываем при наличии разрешения на задачи */}
                    {canViewTasks && (
                        <TodayTasks />
                    )}
                </div>

                {/* User's personal tasks - показываем всем авторизованным */}
                <section>
                    <h3 className="text-lg font-semibold mb-3">Мои задачи</h3>
                    <div className="grid auto-rows-min gap-4 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
                        <UserTasks />
                    </div>
                </section>
            </div>
        </AppLayout>
    );
}
