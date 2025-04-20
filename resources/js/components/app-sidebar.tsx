import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { type NavItem } from '@/types';
import { Link } from '@inertiajs/react';
import {  Boxes, Truck, Warehouse, Scale, History, ListChecks, LayoutGrid, ShieldCheck } from 'lucide-react';
import AppLogo from './app-logo';
import { useUser } from '@/components/UserContext'; // Контекст для получения данных пользователя

// Навигация основного меню
const mainNavItems: NavItem[] = [
    {
        title: 'Роли',
        href: '/roles_permissions',
        icon: ShieldCheck,
        role: 'Администратор', // Доступ только для администраторов
    },
    {
        title: 'Интеграция DSS',
        href: '/integration_dss',
        icon: Boxes,
        role: 'Интегратор', // Доступ  для роль интегратор
    },
    {
        title: 'Склады',
        href: '/warehouses',
        icon: Warehouse,
        role: 'Оператор', // Доступ  для роль Оператор
    },
    {
        title: 'Грузовики',
        href: '/trucks',
        icon: Truck,
        role: 'Оператор', // Доступ  для роль Оператор
    },
    {
        title: 'Задания',
        href: '/tasks',
        icon: ListChecks,
        role: 'Оператор', // Доступ  для роль Оператор
    },
    {
        title: 'Проверка',
        href: '/check',
        icon: ShieldCheck,
        role: 'Охрана', // Доступ  для роль Охрана
    },
    {
        title: 'Взвешивание',
        href: '/weighing',
        icon: Scale,
        role: 'Охрана', // Доступ  для роль Охрана
    },
    {
        title: 'История',
        href: '/history',
        icon: History,
        role: 'Охрана', // Доступ  для роль Охрана
    },
    {
        title: 'Главная',
        href: '/dashboard',
        icon: LayoutGrid,
        role:'',
    },
];

// Навигация нижнего меню
const footerNavItems: NavItem[] = [
    // {
    //     title: 'Репозиторий',
    //     href: 'https://github.com/laravel/react-starter-kit',
    //     icon: Folder,
    //     role:'Администратор',
    // },
    // {
    //     title: 'Документация',
    //     href: 'https://laravel.com/docs/starter-kits',
    //     icon: BookOpen,
    //     role:'Администратор',
    // },
];

export function AppSidebar() {
    const { user  } = useUser(); // Получение ролей пользователя из контекста
    // Фильтрация элементов меню на основе роли
    const filteredMainNavItems = mainNavItems.filter((item) => {
        return !item.role || user?.roles.includes(item.role);
    });

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href="/" prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={filteredMainNavItems} />
            </SidebarContent>

            <SidebarFooter>
                <NavFooter items={footerNavItems} className="mt-auto" />
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}