<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;

class AdminCommandsController extends Controller
{
    /**
     * Вайтлист допустимых команд.
     * Ключ — идентификатор для фронта, значение — описание + сигнатура.
     */
    private array $allowedCommands = [
        'weighing:auto-skip-stale' => [
            'label'       => 'Отменить зависшие взвешивания',
            'description' => 'Автоматически переводит незакрытые требования на взвешивание в статус «Отменено» — для посетителей, уже покинувших территорию, или записей старше 24 часов.',
            'command'     => 'weighing:auto-skip-stale',
            'args'        => ['--hours' => 24],
            'icon'        => 'Scale',
            'danger'      => false,
        ],
        'cleanup:old-tasks-permits' => [
            'label'       => 'Деактивировать просроченные разрешения',
            'description' => 'Деактивирует пропуска с истёкшей датой окончания и закрывает связанные задания без активных визитов.',
            'command'     => 'cleanup:old-tasks-permits',
            'args'        => ['--force' => true, '--days' => 0],
            'icon'        => 'Ticket',
            'danger'      => false,
        ],
        'force-close:visitors' => [
            'label'       => 'Принудительно закрыть зависшие визиты',
            'description' => 'Закрывает подтверждённые визиты без выезда с указанием --hours=24 (ТС на территории дольше суток). Осторожно: необратимо.',
            'command'     => 'dss:force-close-visitors',
            'args'        => ['--hours' => 24, '--force' => true],
            'icon'        => 'UserX',
            'danger'      => true,
        ],
        'visitors:auto-close-pending' => [
            'label'       => 'Закрыть зависшие pending-визиты и задания',
            'description' => 'Отклоняет pending-визиты старше 2 часов и закрывает связанные задания, у которых не осталось активных визитов.',
            'command'     => 'visitors:auto-close-pending',
            'args'        => ['--hours' => 2],
            'icon'        => 'UserX',
            'danger'      => false,
        ],
        'dss:archive-data' => [
            'label'       => 'Архивировать данные DSS',
            'description' => 'Переносит старые данные DSS (захваты, события) в архивные таблицы для ускорения работы системы.',
            'command'     => 'dss:archive-data',
            'args'        => [],
            'icon'        => 'Archive',
            'danger'      => false,
        ],
        'dss:health-check' => [
            'label'       => 'Проверить состояние DSS',
            'description' => 'Проверяет подключение к DSS-серверу и статус всех устройств.',
            'command'     => 'dss:health-check',
            'args'        => [],
            'icon'        => 'HeartPulse',
            'danger'      => false,
        ],
        'dss:purge-vehicle-sync' => [
            'label'       => 'Очистить очередь синхронизации ТС с DSS',
            'description' => 'Удаляет устаревшие и зависшие задания синхронизации транспортных средств с системой DSS.',
            'command'     => 'dss:purge-vehicle-sync',
            'args'        => [],
            'icon'        => 'RefreshCcwDot',
            'danger'      => false,
        ],
    ];

    /**
     * Список команд для фронта (без args).
     */
    private function authorizeAdmin(Request $request): ?JsonResponse
    {
        $user = $request->user();
        if (!$user || !$user->isAdmin()) {
            return response()->json(['error' => 'Доступ запрещён.'], 403);
        }
        return null;
    }

    /**
     * Список команд для фронта (без args).
     */
    public function index(Request $request): JsonResponse
    {
        if ($deny = $this->authorizeAdmin($request)) return $deny;

        $commands = collect($this->allowedCommands)->map(fn ($cmd, $key) => [
            'key'         => $key,
            'label'       => $cmd['label'],
            'description' => $cmd['description'],
            'icon'        => $cmd['icon'],
            'danger'      => $cmd['danger'],
        ])->values();

        return response()->json(['commands' => $commands]);
    }

    /**
     * Запустить команду по ключу.
     */
    public function run(Request $request): JsonResponse
    {
        if ($deny = $this->authorizeAdmin($request)) return $deny;

        $key = $request->input('key');

        if (!array_key_exists($key, $this->allowedCommands)) {
            return response()->json(['error' => 'Команда не разрешена.'], 403);
        }

        $def     = $this->allowedCommands[$key];
        $command = $def['command'];
        $args    = $def['args'];

        try {
            $exitCode = Artisan::call($command, $args);
            $output   = Artisan::output();

            return response()->json([
                'success'   => $exitCode === 0,
                'exit_code' => $exitCode,
                'output'    => $output ?: 'Команда завершена без вывода.',
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success'   => false,
                'exit_code' => 1,
                'output'    => $e->getMessage(),
            ], 500);
        }
    }
}
