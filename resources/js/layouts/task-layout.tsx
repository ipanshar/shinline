import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { type NavItem } from '@/types';
import { Link } from '@inertiajs/react';
import { type PropsWithChildren } from 'react';
import { useUser } from '@/components/UserContext';

const sidebarNavItems: NavItem[] = [
    {
        title:  'Задачи',
        href: '/tasks',
        icon: null,
        permission: 'tasks.view',
    },
    {
        title:  'Планирование',
        href: '/tasks/scheduling',
        icon: null,
        permission: 'tasks.schedule',
    },
    {
        title:  'Рабочее место оператора',
        href: '/tasks/operator-workplace',
        icon: null,
        permission: 'tasks.operator',
    },
];

export default function SettingsLayout({ children }: PropsWithChildren) {
    const { user } = useUser();
    
    // При серверном рендеринге мы отображаем макет только на клиенте...
    if (typeof window === 'undefined') {
        return null;
    }

    const currentPath = window.location.pathname;

    // Фильтрация пунктов меню на основе разрешений
    const filteredNavItems = sidebarNavItems.filter((item) => {
        // Если разрешение не указано - доступно всем авторизованным
        if (!item.permission) return true;
        // Администратор видит все пункты меню
        if (user?.isAdmin) return true;
        // Проверяем наличие требуемого разрешения
        return user?.permissions?.includes(item.permission);
    });

    return (
        <div className="px-4 py-6">
            <Heading title="Задачи" description="Управление задачами" />

            <div className="space-y-8">
                {/* Верхняя панель навигации */}
                <nav className="flex space-x-6">
                    {filteredNavItems.map((item) => (
                        <Button
                            key={item.href}
                            size="sm"
                            variant="ghost"
                            asChild
                            className={cn('w-auto', {
                                'bg-muted': currentPath === item.href,
                            })}
                        >
                            <Link href={item.href} prefetch>
                                {item.title}
                            </Link>
                        </Button>
                    ))}
                </nav>

                <Separator className="my-6" />

                <div className="flex-1 w-full">
                    <section className="space-y-12">{children}</section>
                </div>
            </div>
        </div>
    );
}