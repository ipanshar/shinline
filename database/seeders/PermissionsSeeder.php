<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class PermissionsSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Определяем все разрешения системы
        $permissions = [
            // Посетители / КПП
            ['name' => 'visitors.view', 'description' => 'Просмотр посетителей', 'group' => 'visitors'],
            ['name' => 'visitors.create', 'description' => 'Регистрация въезда', 'group' => 'visitors'],
            ['name' => 'visitors.exit', 'description' => 'Регистрация выезда', 'group' => 'visitors'],
            ['name' => 'visitors.history', 'description' => 'Просмотр истории', 'group' => 'visitors'],
            ['name' => 'visitors.shift_report', 'description' => 'Отчёт о передаче смены', 'group' => 'visitors'],

            // Разрешения на въезд
            ['name' => 'permits.view', 'description' => 'Просмотр разрешений', 'group' => 'permits'],
            ['name' => 'permits.create', 'description' => 'Создание разрешений', 'group' => 'permits'],
            ['name' => 'permits.edit', 'description' => 'Редактирование разрешений', 'group' => 'permits'],
            ['name' => 'permits.delete', 'description' => 'Удаление разрешений', 'group' => 'permits'],

            // Гостевые визиты
            ['name' => 'guest_visits.view', 'description' => 'Просмотр гостевых визитов', 'group' => 'guest_visits'],
            ['name' => 'guest_visits.create', 'description' => 'Создание гостевых визитов', 'group' => 'guest_visits'],
            ['name' => 'guest_visits.update', 'description' => 'Редактирование гостевых визитов', 'group' => 'guest_visits'],
            ['name' => 'guest_visits.close', 'description' => 'Закрытие гостевых визитов', 'group' => 'guest_visits'],
            ['name' => 'guest_visits.cancel', 'description' => 'Отмена гостевых визитов', 'group' => 'guest_visits'],
            ['name' => 'guest_visits.issue_permits', 'description' => 'Выпуск пропусков для гостевых визитов', 'group' => 'guest_visits'],

            // Весовой контроль
            ['name' => 'weighing.view', 'description' => 'Просмотр взвешиваний', 'group' => 'weighing'],
            ['name' => 'weighing.manage', 'description' => 'Проведение взвешивания', 'group' => 'weighing'],

            // Задания
            ['name' => 'tasks.view', 'description' => 'Просмотр заданий', 'group' => 'tasks'],
            ['name' => 'tasks.create', 'description' => 'Создание заданий', 'group' => 'tasks'],
            ['name' => 'tasks.edit', 'description' => 'Редактирование заданий', 'group' => 'tasks'],
            ['name' => 'tasks.delete', 'description' => 'Удаление заданий', 'group' => 'tasks'],
            ['name' => 'tasks.schedule', 'description' => 'Почасовое расписание', 'group' => 'tasks'],
            ['name' => 'tasks.operator', 'description' => 'Рабочее место оператора', 'group' => 'tasks'],

            // Транспортные средства
            ['name' => 'trucks.view', 'description' => 'Просмотр ТС', 'group' => 'trucks'],
            ['name' => 'trucks.create', 'description' => 'Добавление ТС', 'group' => 'trucks'],
            ['name' => 'trucks.edit', 'description' => 'Редактирование ТС', 'group' => 'trucks'],
            ['name' => 'trucks.delete', 'description' => 'Удаление ТС', 'group' => 'trucks'],

            // Склады и дворы
            ['name' => 'warehouses.view', 'description' => 'Просмотр складов', 'group' => 'warehouses'],
            ['name' => 'warehouses.manage', 'description' => 'Управление складами', 'group' => 'warehouses'],
            ['name' => 'yards.view', 'description' => 'Просмотр дворов', 'group' => 'warehouses'],
            ['name' => 'yards.manage', 'description' => 'Управление дворами', 'group' => 'warehouses'],

            // Справочники
            ['name' => 'references.view', 'description' => 'Просмотр справочников', 'group' => 'references'],
            ['name' => 'references.manage', 'description' => 'Управление справочниками', 'group' => 'references'],

            // Статистика
            ['name' => 'statistics.view', 'description' => 'Просмотр статистики', 'group' => 'statistics'],
            ['name' => 'statistics.export', 'description' => 'Экспорт статистики', 'group' => 'statistics'],

            // Чат / Коммуникации
            ['name' => 'chat.view', 'description' => 'Просмотр чатов', 'group' => 'chat'],
            ['name' => 'chat.send', 'description' => 'Отправка сообщений', 'group' => 'chat'],

            // Интеграции (DSS, WhatsApp)
            ['name' => 'integrations.dss', 'description' => 'Настройка DSS', 'group' => 'integrations'],
            ['name' => 'integrations.whatsapp', 'description' => 'Настройка WhatsApp', 'group' => 'integrations'],
            ['name' => 'integrations.devices', 'description' => 'Управление устройствами', 'group' => 'integrations'],
            ['name' => 'integrations.zones', 'description' => 'Управление зонами', 'group' => 'integrations'],

            // Администрирование
            ['name' => 'admin.roles', 'description' => 'Управление ролями', 'group' => 'admin'],
            ['name' => 'admin.users', 'description' => 'Управление пользователями', 'group' => 'admin'],
            ['name' => 'admin.permissions', 'description' => 'Управление разрешениями', 'group' => 'admin'],
            ['name' => 'admin.settings', 'description' => 'Системные настройки', 'group' => 'admin'],

            // Telegram пользователи (приглашающие через бот)
            ['name' => 'telegram_users.view', 'description' => 'Просмотр Telegram-пользователей бота', 'group' => 'telegram_users'],
            ['name' => 'telegram_users.approve', 'description' => 'Одобрение Telegram-пользователей', 'group' => 'telegram_users'],
            ['name' => 'telegram_users.block', 'description' => 'Блокировка Telegram-пользователей', 'group' => 'telegram_users'],

            // Заявки на спецтехнику
            ['name' => 'spectech.view',   'description' => 'Просмотр и создание заявок на спецтехнику', 'group' => 'spectech'],
            ['name' => 'spectech.manage', 'description' => 'Управление заявками на спецтехнику (оператор)', 'group' => 'spectech'],

            // Экстренные перемещения в утилизацию
            ['name' => 'utilization.view',   'description' => 'Просмотр заявок на утилизацию', 'group' => 'utilization'],
            ['name' => 'utilization.manage', 'description' => 'Управление заявками на утилизацию', 'group' => 'utilization'],

            // GreenLog
            ['name' => 'greenlog.view', 'description' => 'Просмотр модуля GreenLog', 'group' => 'greenlog'],
            ['name' => 'greenlog.manage_plants', 'description' => 'Управление растениями GreenLog', 'group' => 'greenlog'],
            ['name' => 'greenlog.manage_locations', 'description' => 'Управление локациями GreenLog', 'group' => 'greenlog'],
            ['name' => 'greenlog.manage_expenses', 'description' => 'Управление расходами GreenLog', 'group' => 'greenlog'],
            ['name' => 'greenlog.manage_care_tasks', 'description' => 'Управление задачами ухода GreenLog', 'group' => 'greenlog'],
            ['name' => 'greenlog.view_reports', 'description' => 'Просмотр отчетов GreenLog', 'group' => 'greenlog'],
            ['name' => 'greenlog.upload_photos', 'description' => 'Загрузка фотографий GreenLog', 'group' => 'greenlog'],

            // Нарушители
            ['name' => 'violations.record', 'description' => 'Фиксация нарушений', 'group' => 'violations'],
            ['name' => 'violations.review', 'description' => 'Просмотр и проверка нарушений', 'group' => 'violations'],
            ['name' => 'violations.reference', 'description' => 'Управление базой сотрудников для нарушений', 'group' => 'violations'],
            ['name' => 'violations.settings', 'description' => 'Настройка модуля нарушений', 'group' => 'violations'],
        ];

        // Создаём разрешения
        foreach ($permissions as $permissionData) {
            Permission::firstOrCreate(
                ['name' => $permissionData['name']],
                $permissionData
            );
        }

        // Назначаем разрешения ролям
        $this->assignPermissionsToRoles();
    }

    /**
     * Назначение разрешений существующим ролям
     */
    private function assignPermissionsToRoles(): void
    {
        // Администратор - все разрешения автоматически через isAdmin()
        // Но можно явно назначить для UI
        $admin = Role::findByName('Администратор');
        if ($admin) {
            $admin->permissions()->sync(Permission::pluck('id'));
        }

        // Интегратор
        $integrator = Role::findByName('Интегратор');
        if ($integrator) {
            $this->syncPermissions($integrator, [
                'integrations.dss',
                'integrations.whatsapp',
                'integrations.devices',
                'integrations.zones',
                'statistics.view',
            ]);
        }

        // Оператор
        $operator = Role::findByName('Оператор');
        if ($operator) {
            $this->syncPermissions($operator, [
                'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.delete', 'tasks.schedule', 'tasks.operator',
                'trucks.view', 'trucks.create', 'trucks.edit', 'trucks.delete',
                'warehouses.view', 'warehouses.manage',
                'yards.view', 'yards.manage',
                'references.view', 'references.manage',
                'permits.view', 'permits.create', 'permits.edit', 'permits.delete',
                'guest_visits.view', 'guest_visits.create', 'guest_visits.update', 'guest_visits.close', 'guest_visits.cancel', 'guest_visits.issue_permits',
                'chat.view', 'chat.send',
                'statistics.view',
                'spectech.view', 'spectech.manage', // Спецтехника
                'utilization.view', 'utilization.manage',
                'greenlog.view', 'greenlog.manage_plants', 'greenlog.manage_locations', 'greenlog.manage_expenses',
                'greenlog.manage_care_tasks', 'greenlog.view_reports', 'greenlog.upload_photos',
            ]);
        }

        // Охрана
        $security = Role::findByName('Охрана');
        if ($security) {
            $this->syncPermissions($security, [
                'visitors.view', 'visitors.create', 'visitors.exit', 'visitors.history', 'visitors.shift_report',
                'permits.view', 'permits.create', 'permits.edit',
                'guest_visits.view', 'guest_visits.create', 'guest_visits.update', 'guest_visits.close', 'guest_visits.cancel', 'guest_visits.issue_permits',
                'weighing.view', 'weighing.manage',
                'trucks.view',
                'tasks.view',
            ]);
        }

        // Снабженец
        $supplier = Role::findByName('Снабженец');
        if ($supplier) {
            $this->syncPermissions($supplier, [
                'tasks.view', 'tasks.create',
                'trucks.view',
                'spectech.view', // Просмотр и создание своих заявок
                'utilization.view',
            ]);
        }

        // Статистика
        $stats = Role::findByName('Статистика');
        if ($stats) {
            $this->syncPermissions($stats, [
                'statistics.view', 'statistics.export',
                'visitors.history',
            ]);
        }

        // Оператор спецтехники
        $spectechOperator = Role::firstOrCreate(
            ['name' => 'Оператор спецтехники'],
            [
                'level' => 55,
                'description' => 'Управление заявками на спецтехнику через веб и Telegram Mini App',
            ]
        );
        $this->syncPermissions($spectechOperator, [
            'spectech.view',
            'spectech.manage',
        ]);

        // Управляющий
        $manager = Role::firstOrCreate(
            ['name' => 'Управляющий'],
            [
                'level' => 65,
                'description' => 'Управление операционными модулями, включая GreenLog',
            ]
        );
        $this->syncPermissions($manager, [
            'greenlog.view',
            'greenlog.manage_plants',
            'greenlog.manage_locations',
            'greenlog.manage_expenses',
            'greenlog.manage_care_tasks',
            'greenlog.view_reports',
            'greenlog.upload_photos',
        ]);

        // Telegram приглашающий (роль для одобренных пользователей бота)
        $tgInviter = Role::firstOrCreate(
            ['name' => 'Telegram приглашающий'],
            [
                'level' => 0,
                'description' => 'Одобренный пользователь Telegram-бота для гостевых визитов',
            ]
        );
        $this->syncPermissions($tgInviter, [
            'guest_visits.view', 'guest_visits.create',
        ]);

        // Служба безопасности
        $securityService = Role::firstOrCreate(
            ['name' => 'Служба безопасности'],
            [
                'level' => 60,
                'description' => 'Фиксация и проверка нарушений через веб и Telegram Mini App',
            ]
        );
        $this->syncPermissions($securityService, [
            'violations.record',
            'violations.review',
            'violations.reference',
        ]);
    }

    /**
     * Синхронизировать разрешения для роли
     */
    private function syncPermissions(Role $role, array $permissionNames): void
    {
        $permissionIds = Permission::whereIn('name', $permissionNames)->pluck('id');
        $role->permissions()->sync($permissionIds);
    }
}
