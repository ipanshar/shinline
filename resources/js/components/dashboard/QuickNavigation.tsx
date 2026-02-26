import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@inertiajs/react';
import { useUser } from '@/components/UserContext';
import { 
    LayoutGrid,
    ShieldCheck,
    Truck,
    Warehouse,
    ListChecks,
    Scale,
    MessageCircle,
    History,
    BookOpen,
    Ticket,
    BarChart3,
    ChevronRight,
    type LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuickLink {
    title: string;
    href: string;
    icon: LucideIcon;
    description: string;
    permission: string;
    color: string;
    bgColor: string;
}

const quickLinks: QuickLink[] = [
    {
        title: 'Статистика',
        href: '/statistics',
        icon: BarChart3,
        description: 'Аналитика и отчеты',
        permission: 'statistics.view',
        color: 'text-violet-600',
        bgColor: 'bg-violet-100 dark:bg-violet-900/30'
    },
    {
        title: 'Задачи',
        href: '/tasks',
        icon: ListChecks,
        description: 'Управление задачами',
        permission: 'tasks.view',
        color: 'text-blue-600',
        bgColor: 'bg-blue-100 dark:bg-blue-900/30'
    },
    {
        title: 'Транспорт',
        href: '/trucks',
        icon: Truck,
        description: 'Транспортные средства',
        permission: 'trucks.view',
        color: 'text-green-600',
        bgColor: 'bg-green-100 dark:bg-green-900/30'
    },
    {
        title: 'Склады',
        href: '/warehouses',
        icon: Warehouse,
        description: 'Склады и площадки',
        permission: 'warehouses.view',
        color: 'text-amber-600',
        bgColor: 'bg-amber-100 dark:bg-amber-900/30'
    },
    {
        title: 'КПП',
        href: '/check',
        icon: ShieldCheck,
        description: 'Контрольно-пропускной пункт',
        permission: 'checkpoint.view',
        color: 'text-red-600',
        bgColor: 'bg-red-100 dark:bg-red-900/30'
    },
    {
        title: 'Разрешения',
        href: '/permits',
        icon: Ticket,
        description: 'Гостевые пропуска',
        permission: 'permits.view',
        color: 'text-pink-600',
        bgColor: 'bg-pink-100 dark:bg-pink-900/30'
    },
    {
        title: 'Взвешивание',
        href: '/weighing',
        icon: Scale,
        description: 'Учет веса грузов',
        permission: 'weighing.view',
        color: 'text-cyan-600',
        bgColor: 'bg-cyan-100 dark:bg-cyan-900/30'
    },
    {
        title: 'Чат',
        href: '/chat',
        icon: MessageCircle,
        description: 'Сообщения и чаты',
        permission: 'chat.view',
        color: 'text-teal-600',
        bgColor: 'bg-teal-100 dark:bg-teal-900/30'
    },
    {
        title: 'Справочники',
        href: '/references',
        icon: BookOpen,
        description: 'Справочные данные',
        permission: 'references.view',
        color: 'text-indigo-600',
        bgColor: 'bg-indigo-100 dark:bg-indigo-900/30'
    },
    {
        title: 'История',
        href: '/history',
        icon: History,
        description: 'Журнал событий',
        permission: 'history.view',
        color: 'text-slate-600',
        bgColor: 'bg-slate-100 dark:bg-slate-900/30'
    }
];

const QuickNavigation: React.FC = () => {
    const { user, hasPermission } = useUser();

    // Фильтрация по разрешениям
    const filteredLinks = quickLinks.filter((link) => {
        if (!link.permission) return true;
        if (user?.isAdmin) return true;
        return hasPermission(link.permission);
    });

    if (filteredLinks.length === 0) {
        return null;
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                    <LayoutGrid className="h-5 w-5" />
                    Быстрый доступ
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {filteredLinks.map((link) => (
                        <Link
                            key={link.href}
                            href={link.href}
                            className="group flex flex-col items-center p-4 rounded-xl border bg-card hover:bg-accent/50 transition-all duration-200 hover:shadow-md hover:scale-[1.02]"
                        >
                            <div className={cn(
                                'h-12 w-12 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110',
                                link.bgColor
                            )}>
                                <link.icon className={cn('h-6 w-6', link.color)} />
                            </div>
                            <span className="text-sm font-medium text-center">{link.title}</span>
                            <span className="text-xs text-muted-foreground text-center mt-1 hidden sm:block">
                                {link.description}
                            </span>
                        </Link>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
};

export default QuickNavigation;
