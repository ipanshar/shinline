import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { type NavGroup, type NavItem } from '@/types';
import { Link } from '@inertiajs/react';
import { MessageCircle, MessageCircleCodeIcon, LineChart, Boxes, Truck, Warehouse, Scale, History, ListChecks, LayoutGrid, ShieldCheck, BookOpen, Ticket, Users, Cpu, MapPinned, Map, Camera } from 'lucide-react';
import AppLogo from './app-logo';
import { useUser } from '@/components/UserContext';
import axios from 'axios';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher2 from './LanguageSwitcher2';

// Расширенный тип для навигации с поддержкой разрешений
interface NavItemWithPermission extends NavItem {
    permission?: string; // Требуемое разрешение (например: 'references.view')
}

interface NavGroupWithPermission extends Omit<NavGroup, 'items'> {
    items: NavItemWithPermission[];
}

export function AppSidebar() {
    const { user, setUser } = useUser(); 


    const { t } = useTranslation();

    // Навигация основного меню, сгруппированная по категориям
    const mainNavGroups: NavGroupWithPermission[] = [
        {
            title: t('home'),
            icon: LayoutGrid,
            items: [
                {
                    title: 'Панель управления',
                    href: '/dashboard',
                    icon: Cpu,
                    permission: '',
                },
                {
                    title: 'Статистика',
                    href: '/statistics',
                    icon: LineChart,
                    permission: 'statistics.view',
                },
            ],
        },
        {
            title: 'Система',
            icon: Boxes,
            items: [
                {
                    title: t('roles'),
                    href: '/roles_permissions',
                    icon: ShieldCheck,
                    permission: 'roles.view',
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
            ],
        },
        {
            title: 'Справочники',
            icon: BookOpen,
            items: [
                {
                    title: t('trucks'),
                    href: '/trucks',
                    icon: Truck,
                    permission: 'trucks.view',
                },
                {
                    title: t('warehouses'),
                    href: '/warehouses',
                    icon: Warehouse,
                    permission: 'warehouses.view',
                },
                {
                    title: 'Дворы',
                    href: '/warehouses/yards',
                    icon: Map,
                    permission: 'warehouses.view',
                },
                {
                    title: 'КПП',
                    href: '/warehouses/kpp',
                    icon: ShieldCheck,
                    permission: 'warehouses.view',
                },
                {
                    title: 'Контрагенты',
                    href: '/references',
                    icon: Users,
                    permission: 'references.view',
                },
                {
                    title: 'Камеры наблюдения',
                    href: '/integration_dss/devices',
                    icon: Camera,
                    permission: 'integrations.dss',
                },
                {
                    title: 'Зоны',
                    href: '/integration_dss/zones',
                    icon: MapPinned,
                    permission: 'integrations.dss',
                },
            ],
        },
        {
            title: 'Операторская',
            icon: ListChecks,
            items: [
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
                    title: 'Разрешения',
                    href: '/permits',
                    icon: Ticket,
                    permission: 'permits.view',
                },
            ],
        },
        {
            title: 'Охрана',
            icon: ShieldCheck,
            items: [
                {
                    title: t('check'),
                    href: '/check',
                    icon: ShieldCheck,
                    permission: 'visitors.view',
                },
                {
                    title: t('history'),
                    href: '/history',
                    icon: History,
                    permission: 'history.view',
                },
                {
                    title: t('weighing'),
                    href: '/weighing',
                    icon: Scale,
                    permission: 'weighing.view',
                },
            ],
        },
    ];

// Навигация нижнего меню
const footerNavItems: NavItem[] = [

];


    // Фильтрация на основе разрешений пользователя
    const filteredMainNavGroups = mainNavGroups
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => {
                if (!item.permission) return true;
                if (user?.isAdmin) return true;

                return user?.permissions?.includes(item.permission);
            }),
        }))
        .filter((group) => group.items.length > 0);

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
                <NavMain groups={filteredMainNavGroups} />
                <LanguageSwitcher2/>
            </SidebarContent>

            <SidebarFooter>
                <NavFooter items={footerNavItems} className="mt-auto" />
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}