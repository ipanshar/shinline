# DSS daemon на IIS / Windows

## Что запускать

## Обязательные env для автоперезапуска

- `DSS_RESTART_SERVICE=ShinlineDssDaemon`
- `DSS_NSSM_PATH=C:\nssm\win64\nssm.exe`

Если эти значения заданы в `.env`, то scheduled-команда `dss:health-check` сможет делать автоперезапуск даже без передачи `--restart-service` и `--nssm` в аргументах.

### 1. NSSM service для daemon

Запускает polling bridge:

`php artisan dss:daemon`

### 2. NSSM service для очередей

Запускает worker для тяжёлых задач:

`php artisan queue:work --queue=dss-enrichment,dss-media,dss-notifications --sleep=3 --tries=3 --timeout=120`

### 3. Windows Task Scheduler для watchdog

Раз в 1 минуту запускает health-check:

`php artisan dss:health-check --max-age=120 --max-keepalive-age=180 --max-capture-age=180 --restart-service=ShinlineDssDaemon --nssm="C:\nssm\win64\nssm.exe"`

Если heartbeat устарел, команда завершится с ошибкой и попытается сделать `nssm restart`.

## Рекомендуемая схема

- `ShinlineDssDaemon` → `php artisan dss:daemon`
- `ShinlineQueueWorker` → `php artisan queue:work --queue=dss-enrichment,dss-media,dss-notifications --sleep=3 --tries=3 --timeout=120`
- `Windows Task Scheduler` → раз в минуту `php artisan dss:health-check ...`

## Пример NSSM

### Создать сервис daemon

`C:\nssm\win64\nssm.exe install ShinlineDssDaemon`

- Application: `C:\OSPanel\modules\PHP\PHP_8.3\php.exe`
- Startup directory: `D:\OSPanel\home\shinline`
- Arguments: `artisan dss:daemon`

### Создать сервис очереди

`C:\nssm\win64\nssm.exe install ShinlineQueueWorker`

- Application: `C:\OSPanel\modules\PHP\PHP_8.3\php.exe`
- Startup directory: `D:\OSPanel\home\shinline`
- Arguments: `artisan queue:work --queue=dss-enrichment,dss-media,dss-notifications --sleep=3 --tries=3 --timeout=120`

## Пример Task Scheduler

### Program/script

`C:\OSPanel\modules\PHP\PHP_8.3\php.exe`

### Add arguments

`artisan dss:health-check --max-age=120 --max-keepalive-age=180 --max-capture-age=180 --restart-service=ShinlineDssDaemon --nssm="C:\nssm\win64\nssm.exe"`

### Start in

`D:\OSPanel\home\shinline`

### Trigger

- repeat every `1 minute`
- indefinitely

## Что проверять

- heartbeat файл: `storage\app\dss\daemon-heartbeat.json`
- логи Laravel: `storage\logs\laravel.log`
- статус NSSM сервисов:
  - `ShinlineDssDaemon`
  - `ShinlineQueueWorker`

## Полезные команды

Проверка heartbeat вручную:

`php artisan dss:health-check --json`

Запуск daemon вручную:

`php artisan dss:daemon`

Запуск queue worker вручную:

`php artisan queue:work --queue=dss-enrichment,dss-media,dss-notifications --sleep=3 --tries=3 --timeout=120`