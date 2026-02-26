import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { type NavItem } from '@/types';
import { Link } from '@inertiajs/react';
import { MessageCircle,MessageCircleCodeIcon,LineChart, Boxes, Truck, Warehouse, Scale, History, ListChecks, LayoutGrid, ShieldCheck, BookOpen, Ticket } from 'lucide-react';
import AppLogo from './app-logo';
import { useUser } from '@/components/UserContext';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher2 from './LanguageSwitcher2';

// Расширенный тип для навигации с поддержкой разрешений
interface NavItemWithPermission extends NavItem {
    permission?: string; // Требуемое разрешение (например: 'references.view')
}

export function AppSidebar() {
    const { user, setUser } = useUser(); 


    const { t } = useTranslation();

// Навигация основного меню с разрешениями
const mainNavItems: NavItemWithPermission[] = [
     {
        title: t('home'),
        href: '/dashboard',
        icon: LayoutGrid,
        permission: '', // Доступно всем авторизованным
    },
    {
        title: 'Статистика',
        href: '/statistics',
        icon: LineChart,
        permission: 'statistics.view',
    },
    {
        title: t('roles'),
        href: '/roles_permissions',
        icon: ShieldCheck,
        permission: 'roles.view', // Требуется разрешение на просмотр ролей
    },
    {
        title: t('dss_integration'),
        href: '/integration_dss',
        icon: Boxes,
        permission: 'integrations.dss',
    },
       {
        title: t('WhatsApp Business Settings'),
        href: '/integration_whatsapp_business',
        icon: MessageCircleCodeIcon,
        permission: 'integrations.whatsapp',
    },
    {
        title: 'Справочники',
        href: '/references',
        icon: BookOpen,
        permission: 'references.view',
    },
    {
        title: t('warehouses'),
        href: '/warehouses',
        icon: Warehouse,
        permission: 'warehouses.view',
    },
    {
        title: t('trucks'),
        href: '/trucks',
        icon: Truck,
        permission: 'trucks.view',
    },
    {
        title: t('tasks'),
        href: '/tasks',
        icon: ListChecks,
        permission: 'tasks.view',
    },
    {
        title: t('chat'),
        href: '/chat',
        icon: MessageCircle,
        permission: 'chat.view',
    },
    {
        title: t('check'),
        href: '/check',
        icon: ShieldCheck,
        permission: 'visitors.view',
    },
    {
        title: 'Разрешения',
        href: '/permits',
        icon: Ticket,
        permission: 'permits.view',
    },
    {
        title: t('weighing'),
        href: '/weighing',
        icon: Scale,
        permission: 'weighing.view',
    },
    {
        title: t('history'),
        href: '/history',
        icon: History,
        permission: 'history.view',
    },
   
];

// Навигация нижнего меню
const footerNavItems: NavItem[] = [

];


    // Фильтрация на основе разрешений пользователя
    const filteredMainNavItems = mainNavItems.filter((item) => {
        // Если разрешение не указано - доступно всем авторизованным
        if (!item.permission) return true;
        // Администратор видит все пункты меню
        if (user?.isAdmin) return true;
        // Проверяем наличие требуемого разрешения
        return user?.permissions?.includes(item.permission);
    });
    useEffect(() => {
        if (!user) {
            axios.get('/profile/user').then((response) => {
                setUser({
                    id: response.data.id,
                    name: response.data.name,
                    roles: response.data.roles,
                    permissions: response.data.permissions,
                    avatar: response.data.avatar,
                    email: response.data.email,
                    isAdmin: response.data.isAdmin,
                });
            }).catch((error) => {
                console.error('Ошибка при получении данных пользователя:', error);
            });
        }
    }, [setUser]);

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
                <LanguageSwitcher2/>
            </SidebarContent>

            <SidebarFooter>
                <NavFooter items={footerNavItems} className="mt-auto" />
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}