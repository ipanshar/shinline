# Violations Face ID Operation

## Рутинный деплой

После первичной настройки сервера обычный деплой должен выглядеть так:

```powershell
git pull
php artisan migrate
npm run build
```

Что делает `php artisan migrate` дополнительно:

- проверяет и при необходимости создаёт `public/storage` link;
- если dump Sigur новее локального runtime-store или store ещё пустой, автоматически запускает импорт только нужных Face ID данных;
- обновляет runtime manifest для Python Face ID backend;
- пытается попросить Python backend перечитать runtime-store через `/api/rebuild`;
- если задан `FACEID_RESTART_SERVICE`, вместо простого rebuild может перезапустить Windows service через NSSM.

Ручная команда для оператора:

```powershell
php artisan violations:sync-faceid-runtime --json
```

Если нужно явно указать dump:

```powershell
php artisan violations:sync-faceid-runtime --dump="C:\faceid-data\sigur_20260506.sql" --json
```

## Что нужно настроить один раз на сервере

- `FACEID_DUMP_PATH`: путь до dump Sigur, если он хранится вне репозитория;
- `FACEID_PYTHON_EXECUTABLE`: путь до `python.exe` из `testFaceID/.venv`;
- `FACEID_REFERENCE_STORE_DIR`: каталог локальных эталонных фотографий;
- `FACEID_REFERENCE_MANIFEST_PATH`: путь до runtime manifest;
- `FACEID_IMPORT_MANIFEST_PATH`: временный manifest для импорта;
- `FACEID_CACHE_DIR`: каталог Python cache;
- `FACEID_API_URL`: URL Python Face ID backend;
- `FACEID_RESTART_SERVICE`: имя NSSM service, если backend должен перезапускаться автоматически после деплоя;
- `FACEID_NSSM_PATH`: путь до `nssm.exe`, если он не лежит в PATH.

## Где что лежит

- Таблица сотрудников: `violation_employees`
- Таблица эталонных фото: `violation_employee_face_references`
- Локальный store эталонов: `storage/app/private/faceid/references` или путь из `FACEID_REFERENCE_STORE_DIR`
- Runtime manifest: `storage/app/private/faceid/reference-manifest.json` или путь из `FACEID_REFERENCE_MANIFEST_PATH`
- Временный import manifest: `storage/app/private/faceid/import-manifest.json` или путь из `FACEID_IMPORT_MANIFEST_PATH`
- Плановая синхронизация: каждый день в 02:20 через `violations:sync-faceid-runtime`
- Лог плановой синхронизации: `storage/logs/violations-faceid-sync.log`

## Что увидит следующий человек в проекте

- Вся ручная и плановая синхронизация сведена к одной команде `violations:sync-faceid-runtime`.
- Первичный импорт из dump отделён от runtime работы Face ID и живёт в `violations:import-sigur-dump`.
- Ручные фото, подтверждённые СБ, тоже складываются в локальный reference store и попадают в общий manifest.
