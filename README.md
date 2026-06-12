# Shin-Line Cargo

**Корпоративная платформа управления территорией, логистикой и бизнес-процессами производственной площадки ТОО «Шин-Лайн».**

Shin-Line Cargo — это единая система, которая связывает учётную систему предприятия (1С), систему
видеонаблюдения и контроля доступа (Dahua DSS), КПП/охрану, склады, весовой контроль и мобильные
каналы (Telegram, WhatsApp) в один сквозной операционный контур: от создания задания на въезд ТС
до фиксации погрузки, взвешивания и выезда с территории.

> ⚠️ **Безопасность.** В этом README приведены только **имена** переменных окружения и плейсхолдеры.
> Реальные секреты (токены Telegram/WhatsApp, ключи Pusher/Reverb, пароль БД) хранятся в `.env` и
> **не должны** попадать в публичный доступ или систему контроля версий. Шаблон — в [.env.example](.env.example).

---

## Содержание

1. [Назначение и аудитория](#1-назначение-и-аудитория)
2. [Ключевые возможности](#2-ключевые-возможности)
3. [Технологический стек](#3-технологический-стек)
4. [Архитектура](#4-архитектура)
5. [Интеграция с 1С (ключевая)](#5-интеграция-с-1с-ключевая)
6. [Прочие внешние интеграции](#6-прочие-внешние-интеграции)
7. [Структура репозитория](#7-структура-репозитория)
8. [Минимальные технические требования](#8-минимальные-технические-требования)
9. [Установка и запуск (разработка)](#9-установка-и-запуск-разработка)
10. [Фоновые процессы и планировщик](#10-фоновые-процессы-и-планировщик)
11. [Развёртывание (production, Windows/IIS/NSSM)](#11-развёртывание-production-windowsiisnssm)
12. [Конфигурация окружения](#12-конфигурация-окружения)
13. [Безопасность и доступ (RBAC)](#13-безопасность-и-доступ-rbac)
14. [Локализация](#14-локализация)
15. [Тестирование](#15-тестирование)
16. [Сильные стороны проекта](#16-сильные-стороны-проекта)
17. [Связанная документация](#17-связанная-документация)

---

## 1. Назначение и аудитория

Платформа автоматизирует управление потоком транспорта и людей на территории предприятия и
связанные с этим бизнес-процессы.

**Какие задачи решает:**

- управление **заданиями** на въезд/погрузку, получаемыми из 1С;
- контроль въезда/выезда ТС через КПП с интеграцией камер ANPR (распознавание госномеров);
- выдача и синхронизация **пропусков** на ТС и людей (в т.ч. со шлагбаумами DSS);
- управление **гостевыми визитами** и **временными пропусками**;
- **весовой контроль** ТС;
- учёт работы на складах (прибытие/убытие, ворота, документы, штрихкоды);
- заявки и планирование **спецтехники**, заявки на **утилизацию**;
- фиксация и разбор **нарушений** с распознаванием лиц (Face ID);
- учёт **озеленения** территории (модуль ShinLineFlora);
- работа с **контрагентами** и чат (WhatsApp / Telegram);
- ролевой доступ, статистика и дашборды.

**Кто пользователи:**

| Роль | Что делает в системе |
|------|----------------------|
| Охрана / КПП | оформляет въезд/выезд, проверяет пропуска, подтверждает спорные распознавания камер, формирует акт передачи смены |
| Операторы | ведут задания, погрузку, почасовое расписание, подтверждают заявки спецтехники |
| Снабжение | заявки и каталог спецтехники |
| Весовщики | весовой контроль ТС |
| Служба безопасности | разбор нарушений, Face ID, временные пропуска |
| Администраторы | роли/разрешения, интеграции, справочники |
| Руководство | статистика, дашборды, отчёты |
| Водители / гости | подача заявок и просмотр статусов через **Telegram Mini App** |

**Где полезно:** производственные и логистические площадки с активным въездным/выездным трафиком ТС,
несколькими складами и КПП, видеонаблюдением Dahua и учётной системой 1С.

---

## 2. Ключевые возможности

Система разбита на доменные модули (≈60 контроллеров, ≈60 моделей, ≈49 сервисов):

- **Охрана / КПП** — посетители (`visitors`), въездные/выездные разрешения (`entry_permits` / `exit_permits`),
  очередь подтверждения распознаваний камер (ошибки OCR), ручное добавление на КПП, поиск похожих
  госномеров, история въездов/выездов, **акт передачи смены**.
- **Весовой контроль** — требования к взвешиванию, фиксация веса, история по ТС, авто-пропуск
  «протухших» требований, статистика.
- **Гостевые визиты** — отдельный домен заявок гостей (с ТС и без), оркестрация пропусков «человек + ТС»,
  одноразовые/многоразовые пропуска (см. [GUEST_PERMITS_ARCHITECTURE.md](GUEST_PERMITS_ARCHITECTURE.md)).
- **Задачи / Операторская** — задания, погрузка на складе (прибытие/убытие), почасовое расписание,
  рабочее место оператора, обработка QR-кодов ворот.
- **Транспорт и справочники** — ТС, прицепы, марки/модели/категории, склады, ворота, дворы, зоны, регионы,
  контрагенты; массовый импорт из Excel.
- **Спецтехника** — каталог, заявки, планирование (календарь), отчёты, подгрузка изображений техники.
- **Утилизация** — отдельный модуль заявок на утилизацию.
- **Нарушения + Face ID** — инциденты, категории/типы нарушений, распознавание лиц сотрудников,
  временные пропуска (см. [VIOLATIONS_FACEID_OPERATION.md](VIOLATIONS_FACEID_OPERATION.md)).
- **ShinLineFlora** — учёт озеленения: растения, локации (карта), задачи по уходу, расходы, отчёты с экспортом в XLSX.
- **Контрагенты и чат** — справочник контрагентов, чаты (WhatsApp Business, Telegram).
- **Интеграции** — DSS (видеонаблюдение/доступ), Telegram (бот + Mini App), WhatsApp, 1С.
- **RBAC** — гибкие роли и разрешения, управление пользователями.
- **Статистика и дашборды** — трафик, загрузка, аналитика задач.

---

## 3. Технологический стек

| Слой | Язык | Ключевые технологии |
|------|------|---------------------|
| Backend | **PHP 8.2+** | Laravel 12, Inertia.js 2 (server side), Sanctum (auth), Reverb (WebSockets), Telegram Bot SDK, php-mqtt/client, phpseclib (RSA/AES), PhpSpreadsheet |
| Frontend | **TypeScript / JavaScript** | React 19, Inertia.js (`@inertiajs/react`), Vite 6, MUI 7 (+ X Data Grid / Date Pickers), Radix UI / shadcn, Tailwind CSS 4 |
| Face ID сервис | **Python 3** | FastAPI, Uvicorn, OpenCV (YuNet/SFace ONNX), NumPy, Pillow |
| База данных | **SQL** | MySQL 8 (production), SQLite (по умолчанию в `.env.example`) |
| Реал-тайм | — | Laravel Reverb / Laravel Echo, опционально Pusher |
| Очереди / кэш / сессии | — | драйвер `database` (по умолчанию), опционально Redis |

**Заметные frontend-библиотеки:** FullCalendar (планирование), Chart.js + Recharts (графики),
Leaflet / React-Leaflet (карты), html5-qrcode + react-qr-code (QR), Tesseract.js (OCR в браузере),
i18next / react-i18next (локализация ru/kz), xlsx (Excel), react-hook-form, date-fns, sonner (toasts),
lucide-react (иконки).

Полные списки зависимостей — в [composer.json](composer.json), [package.json](package.json) и
[testFaceID/requirements.txt](testFaceID/requirements.txt).

---

## 4. Архитектура

Монолит на Laravel с серверным рендерингом страниц через Inertia.js и SPA-фронтендом на React
(без отдельного REST-фронтенд-приложения — страницы резолвятся из `resources/js/pages`).
Тяжёлая работа с DSS вынесена в фоновые демоны, очереди и MQTT-листенер. Распознавание лиц —
отдельный Python-микросервис.

```
                 ┌─────────────────────────────────────────────────────────┐
   1С (ERP) ───▶ │  POST /api/task/addapitask  (webhook: задания + ТС)      │
                 └─────────────────────────────────────────────────────────┘
                                          │
        ┌─────────────────────────────────┴─────────────────────────────────┐
        │             Laravel 12 (PHP) — монолит / API / Inertia             │
        │  Controllers · Services · Models · RBAC · Queue · Scheduler        │
        └───┬───────────────┬───────────────┬───────────────┬────────────┬──┘
            │               │               │               │            │
       React 19 SPA     Dahua DSS       Telegram         WhatsApp     Python Face ID
      (Inertia/Vite)   (HTTP + MQTT)   (Bot + MiniApp)   (Business)   (FastAPI :8008)
            │               │
       Laravel Reverb   dss:daemon / dss:mqtt-listen / queue:work
       (WebSockets)     (polling, события захвата ТС, синхронизация пропусков)
```

**Контур реального времени:**

- `dss:daemon` — polling-bridge к DSS (VehicleCapture, KeepAlive, обновление токена), тяжёлые задачи
  делегируются в очереди (`dss-enrichment`, `dss-media`, `dss-notifications`);
- `dss:mqtt-listen` — подписка на MQTT-события захвата ТС от DSS в реальном времени;
- Laravel Reverb / Echo — вещание событий во фронтенд по WebSocket.

---

## 5. Интеграция с 1С (ключевая)

**1С — источник истины по заданиям и транспорту.** На этой интеграции завязан весь операционный
поток: КПП → склад → весовой контроль → выезд.

### Входящий webhook

```
POST /api/task/addapitask
```

Обработчик — [`TaskCotroller::addApiTask`](app/Http/Controllers/Api/TaskCotroller.php).
Маршрут объявлен в [routes/api.php](routes/api.php) и является **публичным** (без `auth:sanctum`),
так как вызывается со стороны 1С.

> 🔒 **Рекомендация по безопасности:** поскольку endpoint публичный, его необходимо защищать на уровне
> сети (IP-allowlist / VPN) и/или согласованным секретом/подписью. Не оставляйте его открытым в интернет.

### Что приходит в payload

Из 1С передаётся задание, данные ТС, водителя/контрагента и план по складам. Основные поля
(из правил валидации `addApiTask`):

| Поле | Тип | Назначение |
|------|-----|------------|
| `task_id` | int (nullable) | идентификатор задания в 1С (для upsert) |
| `name` | string | наименование задания |
| `login`, `user_name`, `user_phone`, `company` | string | водитель / контрагент |
| `plate_number`, `trailer_plate_number` | string | госномера ТС и прицепа |
| `truck_model`, `truck_category`, `trailer_type`, `trailer_model` | string | классификация ТС |
| `color`, `vin` | string | доп. атрибуты ТС |
| `avtor` | string (**required**) | автор задания в 1С |
| `Yard` | string | двор / площадка |
| `plan_date`, `end_date` | `Y-m-d H:i:s` | план въезда / окончания |
| `total_weight`, `count_boxes` | number / int | вес и количество мест |
| `weighing` | bool (**required**) | требуется ли взвешивание |
| `warehouse[]` | array (**required**) | список складов плана |
| `warehouse.*.name` | string (**required**) | склад |
| `warehouse.*.gates[]`, `warehouse.*.plan_gate` | string | ворота |
| `warehouse.*.document`, `warehouse.*.barcode` | string | документы и штрихкоды |
| `warehouse.*.arrival_at`, `warehouse.*.departure_at` | `Y-m-d H:i:s` | времена прибытия/убытия (из 1С) |

### Что система делает за один вызов

- **upsert ТС** (`Truck`) — создаёт или обновляет ТС, его модель/категорию, прицеп, VIN, цвет;
- **upsert водителя** (`User`) и привязку ТС к водителю;
- определяет/создаёт **двор** (`Yard`);
- **создаёт/обновляет задание** (`Task`) с весом, количеством мест, статусом;
- автоматически выпускает **въездной и выездной пропуск** на ТС, привязывая его к контуру DSS;
- учитывает уже находящихся на территории ТС (статус `on_territory`) и связывает пропуск с активным визитом.

Пропуска, созданные по заданию 1С, помечаются специальным пользователем-источником
(`getIntegrationIssuerId`), а авто-выездной пропуск получает комментарий вида
`Автоматически создано по заданию 1С #<task_id>` (`createAutomaticExitPermitForIntegrationVisitor`).

### Связанные endpoints контура интеграции

- `POST /api/task/actual-tasks` — актуальные задания (публичный);
- `GET /api/task/gate-codes` — коды ворот для QR/табло (публичный).

---

## 6. Прочие внешние интеграции

| Сервис | Назначение | Подробности |
|--------|------------|-------------|
| **Dahua DSS** | Видеонаблюдение и контроль доступа: двухэтапная RSA-авторизация, KeepAlive/UpdateToken, VehicleCapture (ANPR), AddPerson, синхронизация ТС-пропусков, управление шлагбаумами, история зон | [DSS_API_CONTRACT.md](DSS_API_CONTRACT.md), [DSS_ADD_PERSON_API.md](DSS_ADD_PERSON_API.md) |
| **MQTT** | Реал-тайм события захвата ТС из DSS (`ipms.entrance.notifyVehicleCaptureInfo`) | команда `dss:mqtt-listen` |
| **Telegram** | Бот (webhook) + **Mini App**: гостевые визиты, выездные пропуска, спецтехника, утилизация, нарушения, временные пропуска; уведомления | `routes/api.php` (`/api/telegram/*`) |
| **WhatsApp Business API** | Вебхуки, шаблоны сообщений, чат с контрагентами | [WhatsAppController](app/Http/Controllers/WhatsAppController.php) |
| **Sigur (СКУД)** | Импорт эталонных фото сотрудников для Face ID (SQL-dump или прямое подключение к БД) | [VIOLATIONS_FACEID_OPERATION.md](VIOLATIONS_FACEID_OPERATION.md), [testFaceID/README.md](testFaceID/README.md) |
| **Wikimedia Commons** | Автоподгрузка изображений спецтехники | команда `spectech:sync-images` |
| **Pusher / Laravel Reverb** | WebSocket-вещание событий во фронтенд | `.env` группы `REVERB_*` / `PUSHER_*` |

---

## 7. Структура репозитория

```
shinline/
├─ app/
│  ├─ Console/Commands/      # artisan-команды (DSS daemon, MQTT, синхронизации, очистки)
│  ├─ Http/Controllers/      # web + Api/* контроллеры (≈60)
│  ├─ Http/Middleware/       # CheckPermission, CheckRole, Inertia, Telegram CORS
│  ├─ Jobs / Events          # очереди и broadcast-события
│  ├─ Models/                # Eloquent-модели (≈60), вкл. ShinLineFlora/*
│  └─ Services/              # бизнес-логика и интеграции (≈49), вкл. Dss*, GuestVisit*, Violations/*
├─ resources/
│  ├─ js/pages/              # Inertia-страницы (≈57 экранов)
│  ├─ js/components/         # React-компоненты по доменам (check/, spectech/, greenlog/, guests/, …)
│  ├─ js/layouts, hooks, lib # макеты, хуки, клиенты (echo, api, dss-alarms)
│  └─ locales/{ru,kz}/       # переводы i18next
├─ routes/                   # web.php, api.php, console.php, channels.php, settings.php, auth.php
├─ database/migrations/      # схема БД
├─ config/                   # конфигурация Laravel
├─ testFaceID/               # Python Face ID микросервис (FastAPI + OpenCV) + свой frontend
├─ knowledge/                # LLM-вики база знаний (см. AGENTS.md)
└─ public/                   # точка входа и собранные ассеты
```

Документация уровня модулей вынесена в отдельные `*.md` в корне — см. [раздел 17](#17-связанная-документация).

---

## 8. Минимальные технические требования

> Значения ориентировочные и зависят от нагрузки, числа КПП/складов и **количества DSS-камер**
> (поток событий ANPR — основной фактор нагрузки).

### Среда разработки (локально)

| Ресурс | Минимум | Рекомендуется |
|--------|---------|---------------|
| CPU | 2 ядра | 4+ ядер |
| RAM | 4 ГБ | 8+ ГБ |
| Диск | 5 ГБ свободно | 10+ ГБ (SSD) |
| ПО | PHP 8.2+, Node.js 20+, Composer 2, MySQL 8 *или* SQLite | + Python 3.11+ для Face ID |

Для Windows удобно использовать **OSPanel** (проект и рассчитан на этот стек).

### Production (Windows Server)

| Ресурс | Минимум | Рекомендуется |
|--------|---------|---------------|
| CPU | 4 ядра | 8+ ядер |
| RAM | 8 ГБ | 16+ ГБ |
| Диск | 50 ГБ SSD | 100+ ГБ SSD (учёт хранения снимков ТС/лиц) |
| ОС | Windows Server + IIS | + NSSM для сервисов, Task Scheduler для watchdog |
| Runtime | PHP 8.3, MySQL 8, Node.js 20+ (сборка) | Python 3.11+ (Face ID), опц. Redis |

**Обязательное системное ПО:** Composer, Node.js/npm (для `npm run build`), [NSSM](https://nssm.cc/)
(для фоновых сервисов), Python с виртуальным окружением `testFaceID/.venv` (для Face ID).

---

## 9. Установка и запуск (разработка)

Команды приведены для **PowerShell** (Windows).

```powershell
# 1. Зависимости backend и frontend
composer install
npm install

# 2. Конфигурация окружения
Copy-Item .env.example .env
php artisan key:generate

# 3. База данных (по умолчанию sqlite; для MySQL — задать DB_* в .env)
php artisan migrate

# (опц.) демо-данные для локальной разработки
php artisan db:seed --class=PermissionsSeeder
php artisan db:seed --class=LocalDemoUsersSeeder   # admin/admin123, operator/operator123, client/client123
```

### Запуск всего dev-контура одной командой

```powershell
composer run dev
```

Поднимает параллельно: `php artisan serve`, `php artisan queue:listen`, `npm run dev` (Vite).

### Реал-тайм (WebSockets)

```powershell
php artisan reverb:start --host=0.0.0.0 --port=8080
# или: composer run reverb
```

### Python Face ID сервис (опционально)

```powershell
# один раз — установить зависимости в venv
& "testFaceID\.venv\Scripts\python.exe" -m pip install -r testFaceID\requirements.txt

# запуск backend + frontend Face ID из корня проекта
npm run faceid
```

Подробности (импорт эталонов из Sigur, переменные `FACEID_*`, Windows service) —
в [testFaceID/README.md](testFaceID/README.md) и [VIOLATIONS_FACEID_OPERATION.md](VIOLATIONS_FACEID_OPERATION.md).

Приложение по умолчанию доступно на `http://localhost:8000`, Face ID — на `http://localhost:4174`
(backend `http://127.0.0.1:8008`).

---

## 10. Фоновые процессы и планировщик

Расписание задач определено в [app/Console/Kernel.php](app/Console/Kernel.php).

| Команда | Расписание | Назначение |
|---------|-----------|------------|
| `dss:health-check` | каждую минуту | контроль heartbeat DSS-демона, авто-рестарт через NSSM |
| `dss:monitor-alerts` | каждые 5 мин | мониторинг и рассылка алертов DSS |
| `weighing:auto-skip-stale --hours=24` | каждые 30 мин | авто-пропуск устаревших требований взвешивания |
| `visitors:auto-close-pending --hours=2` | каждые 30 мин | авто-закрытие зависших посетителей |
| `cleanup:old-tasks-permits --force` | ежедневно 00:05 | деактивация просроченных пропусков и очистка |
| `dss:archive-data` | ежедневно 01:10 | архивация старых снимков ТС и истории зон |
| `violations:sync-faceid-runtime --json` | ежедневно 02:20 | синхронизация runtime-хранилища Face ID |

**Постоянно работающие процессы (вне планировщика):**

```powershell
php artisan dss:daemon                                           # polling-bridge к DSS
php artisan dss:mqtt-listen                                       # MQTT-листенер событий захвата ТС
php artisan queue:work --queue=dss-enrichment,dss-media,dss-notifications --tries=3 --timeout=120
php artisan schedule:run                                          # запускается из cron / Task Scheduler раз в минуту
```

Прочие обслуживающие команды: `truck:merge-duplicates`, `truck:cleanup-garbage`,
`spectech:sync-images`, `spectech:backfill-schedules`, `violations:import-sigur-dump`,
`violations:import-sigur-live`, `greenlog:import-plant-register`, `yard:strict`.

---

## 11. Развёртывание (production, Windows/IIS/NSSM)

Рутинный деплой после первичной настройки сервера:

```powershell
git pull
php artisan migrate
npm run build
```

`php artisan migrate` дополнительно проверяет `public/storage` link и, при включённом
`FACEID_AUTO_SYNC_AFTER_MIGRATE=true`, синхронизирует runtime-хранилище Face ID.

**Фоновые сервисы (NSSM):**

| Сервис NSSM | Команда |
|-------------|---------|
| `ShinlineDssDaemon` | `php artisan dss:daemon` |
| `ShinlineQueueWorker` | `php artisan queue:work --queue=dss-enrichment,dss-media,dss-notifications --sleep=3 --tries=3 --timeout=120` |
| `shinline-faceid` | Python Face ID backend (`testFaceID/scripts/run-faceid-backend.cmd`) |

**Watchdog:** Windows Task Scheduler раз в минуту запускает `php artisan dss:health-check …`,
который при устаревшем heartbeat перезапускает DSS-демон через NSSM.

Полные инструкции — в [DSS_WINDOWS_OPERATION.md](DSS_WINDOWS_OPERATION.md) и
[VIOLATIONS_FACEID_OPERATION.md](VIOLATIONS_FACEID_OPERATION.md).

---

## 12. Конфигурация окружения

Все переменные — в [.env.example](.env.example). Ниже — **только назначение групп**, без значений.

| Группа | Переменные | Назначение |
|--------|-----------|------------|
| Приложение | `APP_NAME`, `APP_ENV`, `APP_KEY`, `APP_DEBUG`, `APP_URL`, `APP_LOCALE` | базовая конфигурация Laravel |
| База данных | `DB_CONNECTION`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | подключение к БД (MySQL/SQLite) |
| Сессии/кэш/очереди | `SESSION_DRIVER`, `CACHE_STORE`, `QUEUE_CONNECTION`, `BROADCAST_CONNECTION` | драйверы (по умолчанию `database`) |
| Реал-тайм (Reverb) | `REVERB_APP_ID`, `REVERB_APP_KEY`, `REVERB_APP_SECRET`, `REVERB_HOST`, `REVERB_PORT`, `REVERB_SCHEME` + `VITE_REVERB_*` | WebSocket-сервер |
| Реал-тайм (Pusher) | `PUSHER_APP_ID`, `PUSHER_APP_KEY`, `PUSHER_APP_SECRET`, `PUSHER_APP_CLUSTER` + `VITE_PUSHER_*` | альтернативный broadcast-драйвер |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | бот и Mini App |
| WhatsApp | `WHATSAPP_TOKEN` | WhatsApp Business API |
| DSS | `DSS_SELF_BARRIER_MODE`, `DSS_RESTART_SERVICE`, `DSS_NSSM_PATH` | режим управления шлагбаумом и авто-рестарт демона |
| Face ID | `FACEID_*` (`FACEID_DUMP_PATH`, `FACEID_PYTHON_EXECUTABLE`, `FACEID_REFERENCE_STORE_DIR`, `FACEID_API_URL`, …) | параметры Python Face ID сервиса |
| Почта / AWS | `MAIL_*`, `AWS_*` | рассылка и файловое хранилище (опционально) |

> 🔒 Реальные значения держите только в `.env` на сервере. Никогда не коммитьте `.env` в git.

---

## 13. Безопасность и доступ (RBAC)

- **Аутентификация:** Laravel Sanctum (сессии для web + токены для API/мобильных каналов).
- **Авторизация:** собственная система ролей и разрешений. Middleware-алиасы зарегистрированы в
  [bootstrap/app.php](bootstrap/app.php):
  - `permission:<code>` — [`CheckPermission`](app/Http/Middleware/CheckPermission.php);
  - `role:<name>` — [`CheckRole`](app/Http/Middleware/CheckRole.php).
- Маршруты защищаются на уровне разрешений, например:
  `permission:guest_visits.view`, `permission:spectech.manage`, `permission:greenlog.view`,
  `permission:violations.review`, `permission:integrations.dss`, `permission:admin.users`.
- Управление ролями/пользователями — раздел **RBAC** (`/rbac`, [RbacController](app/Http/Controllers/Api/RbacController.php)).
- Telegram Mini App использует отдельную проверку `initData` и CORS-middleware
  [`TelegramMiniAppCors`](app/Http/Middleware/TelegramMiniAppCors.php).

---

## 14. Локализация

- Движок: **i18next** + **react-i18next**, автоопределение языка браузера.
- Поддерживаемые языки: **русский (`ru`)** и **казахский (`kz`)** — файлы в `resources/locales/{ru,kz}/translation.json`.
- Язык по умолчанию (fallback): русский.
- Переключение языка — компонент `LanguageSwitcher` во фронтенде.

---

## 15. Тестирование

**Backend (PHPUnit):**

```powershell
composer test
# эквивалент: php artisan config:clear; php artisan test
```

Конфигурация — [phpunit.xml](phpunit.xml), тесты — в [tests/](tests/).

**Python Face ID (pytest):**

```powershell
& "testFaceID\.venv\Scripts\python.exe" -m pytest testFaceID\tests
```

**Качество кода:**

```powershell
npm run lint        # ESLint (--fix)
npm run types       # проверка типов TypeScript
npm run format      # Prettier
./vendor/bin/pint   # форматирование PHP (Laravel Pint)
```

---

## 16. Сильные стороны проекта

- **Доменная декомпозиция.** Чёткое разделение на модули (охрана, весовой контроль, гости, спецтехника,
  нарушения, ShinLineFlora) с отдельными сервисами и разрешениями — система масштабируется без «спагетти».
- **Глубокая интеграция с физической инфраструктурой.** Камеры ANPR, шлагбаумы, весы и КПП заведены в
  единый цифровой контур через DSS и MQTT.
- **1С как источник истины.** Задания и транспорт приходят из учётной системы автоматически — минимум
  ручного ввода на КПП.
- **Реальное время.** Reverb/Echo + MQTT-листенер + фоновый демон дают живые обновления событий.
- **Omni-channel.** Веб-интерфейс, Telegram (бот + Mini App) и WhatsApp Business в одной системе.
- **Отказоустойчивость фоновых сервисов.** Health-check каждую минуту с авто-рестартом через NSSM,
  очереди с ретраями, архивация данных.
- **Гибкий RBAC** на уровне отдельных разрешений и ролей.
- **Мультиязычность** (ru/kz) из коробки.
- **Собственный AI-модуль распознавания лиц** (FastAPI + OpenCV) для разбора нарушений.

---

## 17. Связанная документация

| Документ | О чём |
|----------|-------|
| [DSS_API_CONTRACT.md](DSS_API_CONTRACT.md) | Контракт внешних методов Dahua DSS (авторизация, capture, MQTT, AddPerson, sync ТС) |
| [DSS_ADD_PERSON_API.md](DSS_ADD_PERSON_API.md) | Добавление человека в DSS |
| [DSS_WINDOWS_OPERATION.md](DSS_WINDOWS_OPERATION.md) | Эксплуатация DSS-демона на Windows/IIS (NSSM, watchdog) |
| [GUEST_PERMITS_ARCHITECTURE.md](GUEST_PERMITS_ARCHITECTURE.md) | Архитектура гостевых пропусков |
| [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) | Статус реализации гостевого модуля |
| [QUICKSTART_GUESTS.md](QUICKSTART_GUESTS.md) | Быстрый старт по гостевым визитам |
| [SPECTECH_MODULE.md](SPECTECH_MODULE.md) | Модуль спецтехники |
| [VIOLATIONS_FACEID_OPERATION.md](VIOLATIONS_FACEID_OPERATION.md) | Эксплуатация Face ID и нарушений |
| [VERIFICATION_CHECKLIST.md](VERIFICATION_CHECKLIST.md) | Чек-лист проверки |
| [testFaceID/README.md](testFaceID/README.md) | Python Face ID сервис |
| [AGENTS.md](AGENTS.md) | Правила работы LLM-вики в `knowledge/` |

---

<sub>Внутренний проект ТОО «Шин-Лайн». Рабочее название — Shin-Line Cargo.</sub>
