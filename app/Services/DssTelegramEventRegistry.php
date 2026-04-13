<?php

namespace App\Services;

class DssTelegramEventRegistry
{
    public const EVENT_VISITOR_ENTRY_CONFIRMED = 'visitor.entry_confirmed';
    public const EVENT_VISITOR_TASK_ALREADY_ON_TERRITORY = 'visitor.task_attached_on_territory';
    public const EVENT_TASK_SCAN_FAILED = 'task.scan_failed';
    public const EVENT_TASK_SCAN_SUCCESS = 'task.scan_success';
    public const EVENT_TASK_SCAN_WAREHOUSE_MISMATCH = 'task.scan_warehouse_mismatch';
    public const EVENT_TASK_LOADING_ARRIVAL = 'task.loading_arrival';
    public const EVENT_TASK_LOADING_DEPARTURE = 'task.loading_departure';
    public const EVENT_DSS_MISSED_EXIT = 'dss.missed_exit_detected';
    public const EVENT_DSS_PENDING_ENTRY_CONFIRMATION = 'dss.pending_entry_confirmation';
    public const EVENT_DSS_MONITOR_ALERT = 'dss.monitor_alert';

    public function definitions(): array
    {
        return [
            [
                'key' => self::EVENT_VISITOR_ENTRY_CONFIRMED,
                'title' => 'Въезд на территорию',
                'description' => 'Подтверждённый въезд ТС на территорию с привязкой к заданию.',
                'category' => 'Операции',
                'default_enabled' => false,
                'default_cooldown_minutes' => 0,
                'default_send_silently' => true,
            ],
            [
                'key' => self::EVENT_VISITOR_TASK_ALREADY_ON_TERRITORY,
                'title' => 'Задание привязано к ТС на территории',
                'description' => 'ТС уже было на территории, и к нему привязали новое задание.',
                'category' => 'Операции',
                'default_enabled' => false,
                'default_cooldown_minutes' => 0,
                'default_send_silently' => true,
            ],
            [
                'key' => self::EVENT_TASK_SCAN_FAILED,
                'title' => 'Ошибка сканирования',
                'description' => 'Сканирование прошло, но активный рейс не найден.',
                'category' => 'Исключения',
                'default_enabled' => true,
                'default_cooldown_minutes' => 0,
                'default_send_silently' => false,
            ],
            [
                'key' => self::EVENT_TASK_SCAN_SUCCESS,
                'title' => 'Успешное сканирование',
                'description' => 'Водитель успешно отсканировал склад и ворота для рейса.',
                'category' => 'Операции',
                'default_enabled' => false,
                'default_cooldown_minutes' => 0,
                'default_send_silently' => true,
            ],
            [
                'key' => self::EVENT_TASK_SCAN_WAREHOUSE_MISMATCH,
                'title' => 'Склад не найден в задании',
                'description' => 'Водитель отсканировал склад, которого нет в составе задания.',
                'category' => 'Исключения',
                'default_enabled' => true,
                'default_cooldown_minutes' => 0,
                'default_send_silently' => false,
            ],
            [
                'key' => self::EVENT_TASK_LOADING_ARRIVAL,
                'title' => 'Прибытие на склад',
                'description' => 'Зафиксировано прибытие ТС на склад, по заданию.',
                'category' => 'Операции',
                'default_enabled' => false,
                'default_cooldown_minutes' => 0,
                'default_send_silently' => true,
            ],
            [
                'key' => self::EVENT_TASK_LOADING_DEPARTURE,
                'title' => 'Убытие со склада',
                'description' => 'Зафиксировано убытие ТС со склада, по заданию.',
                'category' => 'Операции',
                'default_enabled' => false,
                'default_cooldown_minutes' => 0,
                'default_send_silently' => true,
            ],
            [
                'key' => self::EVENT_DSS_MISSED_EXIT,
                'title' => 'DSS: пропущенный выезд',
                'description' => 'Повторный въезд без ранее зафиксированного выезда.',
                'category' => 'DSS инциденты',
                'default_enabled' => true,
                'default_cooldown_minutes' => 5,
                'default_send_silently' => false,
            ],
            [
                'key' => self::EVENT_DSS_PENDING_ENTRY_CONFIRMATION,
                'title' => 'DSS: требуется подтверждение въезда',
                'description' => 'Камера DSS создала pending visitor и ждёт решения оператора.',
                'category' => 'DSS действия',
                'default_enabled' => true,
                'default_cooldown_minutes' => 0,
                'default_send_silently' => false,
            ],
            [
                'key' => self::EVENT_DSS_MONITOR_ALERT,
                'title' => 'DSS: мониторинговый alert',
                'description' => 'Техническое уведомление observability по деградации DSS.',
                'category' => 'DSS мониторинг',
                'default_enabled' => true,
                'default_cooldown_minutes' => 15,
                'default_send_silently' => false,
            ],
        ];
    }

    public function keys(): array
    {
        return array_column($this->definitions(), 'key');
    }

    public function definitionMap(): array
    {
        $definitions = [];

        foreach ($this->definitions() as $definition) {
            $definitions[$definition['key']] = $definition;
        }

        return $definitions;
    }

    public function find(string $eventKey): ?array
    {
        return $this->definitionMap()[$eventKey] ?? null;
    }
}