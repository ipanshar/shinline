import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { type NavItem } from '@/types';
import { Link } from '@inertiajs/react';
import { Boxes, Truck, Warehouse, Scale, History, ListChecks, LayoutGrid, ShieldCheck } from 'lucide-react';
import AppLogo from './app-logo';
import { useUser } from '@/components/UserContext';
import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher2 from './LanguageSwitcher2';


export function AppSidebar() {
    const { user, setUser } = useUser(); 


    const { t } = useTranslation();

// Навигация основного меню
const mainNavItems: NavItem[] = [
    {
        title: t('roles'),
        href: '/roles_permissions',
        icon: ShieldCheck,
        role: 'Администратор', // Доступ только для администраторов
    },
    {
        title: t('dss_integration'),
        href: '/integration_dss',
        icon: Boxes,
        role: 'Интегратор', // Доступ  для роль интегратор
    },
    {
        title: t('warehouses'),
        href: '/warehouses',
        icon: Warehouse,
        role: 'Оператор', // Доступ  для роль Оператор
    },
    {
        title: t('trucks'),
        href: '/trucks',
        icon: Truck,
        role: 'Оператор', // Доступ  для роль Оператор
    },
    {
        title: t('tasks'),
        href: '/tasks',
        icon: ListChecks,
        role: 'Оператор', // Доступ  для роль Оператор
    },
    {
        title: t('chat'),
        href: '/chat',
        icon: ShieldCheck,
        role: 'Оператор', // Доступ только для администраторов
    },
    {
        title: t('check'),
        href: '/check',
        icon: ShieldCheck,
        role: 'Охрана', // Доступ  для роль Охрана
    },
    {
        title: t('weighing'),
        href: '/weighing',
        icon: Scale,
        role: 'Охрана', // Доступ  для роль Охрана
    },
    {
        title: t('history'),
        href: '/history',
        icon: History,
        role: 'Охрана', // Доступ  для роль Охрана
    },
    {
        title: t('home'),
        href: '/dashboard',
        icon: LayoutGrid,
        role: '',
    },
];

// Навигация нижнего меню
const footerNavItems: NavItem[] = [

];


    const filteredMainNavItems = mainNavItems.filter((item) => {
        return !item.role || user?.roles.includes(item.role);
    });
    useEffect(() => {
        if (!user) {
            axios.get('/profile/user').then((response) => {
                setUser({
                    id: response.data.id,
                    name: response.data.name,
                    roles: response.data.roles,
                    avatar: response.data.avatar,
                    email: response.data.email,
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