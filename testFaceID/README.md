# Face ID pilot in testFaceID

Это локальный прототип поиска человека по фотографии.

Что он делает:

- принимает загруженное фото через мини-интерфейс;
- извлекает face embedding на Python;
- ищет ближайшее лицо среди эталонных фотографий из локального reference store;
- показывает, кого система считает совпадением;
- возвращает сохранённую эталонную фотографию из базы, чтобы человек глазами проверил, не нашли ли кого-то другого.

Что используется:

- frontend: React + Vite
- backend: FastAPI + OpenCV YuNet/SFace ONNX models
- runtime-источник эталонных фото: локальный manifest + локальный каталог эталонов
- источник первичного импорта: только нужные записи из sigur_20260506.sql

Текущее ограничение дампа:

- в personalimg сейчас только 3 фотографии сотрудников;
- руководителей в этом прототипе нет;
- таблица photo пока не используется как эталонная база, потому что в дампе нет надёжной связи photo -> сотрудник.

Где хранить dump:

- файл sigur_20260506.sql намеренно исключён из git и должен лежать отдельно;
- dump нужен только для импорта в локальный reference store, а не как рабочий runtime source;
- на сервере dump можно хранить в любом каталоге и передать путь через переменную среды FACEID_DUMP_PATH.

## Рабочая схема

Теперь правильный контур такой:

- один раз или по расписанию запускается import-команда, которая вытягивает из dump только нужные данные и фото;
- import-команда складывает эталонные фото в локальный store и обновляет runtime manifest;
- FastAPI backend читает уже локальный manifest, а не парсит dump при каждом rebuild;
- старый прямой разбор dump остаётся только как fallback, если manifest ещё не создан.

Artisan-команда импорта:

```powershell
php artisan violations:import-sigur-dump --dump="C:\faceid-data\sigur_20260506.sql"
```

Операционная команда синхронизации runtime store:

```powershell
php artisan violations:sync-faceid-runtime --json
```

Если на сервере включён `FACEID_AUTO_SYNC_AFTER_MIGRATE=true`, то обычный деплой после первичной настройки сводится к:

```powershell
git pull
php artisan migrate
npm run build
```

Во время `php artisan migrate` приложение само:

- проверяет `public/storage` link;
- при необходимости импортирует свежий dump в локальный reference store;
- обновляет runtime manifest;
- просит Python backend перечитать runtime store или перезапускает service, если задан `FACEID_RESTART_SERVICE`.

Полезный dry-run перед боевым запуском:

```powershell
php artisan violations:import-sigur-dump --dump="C:\faceid-data\sigur_20260506.sql" --dry-run
```

Основные переменные среды для сервера:

- FACEID_DUMP_PATH: путь до dump, который используется только командой импорта;
- FACEID_PYTHON_EXECUTABLE: путь до python.exe из testFaceID/.venv;
- FACEID_REFERENCE_STORE_DIR: каталог локальных эталонных фото;
- FACEID_REFERENCE_MANIFEST_PATH: JSON manifest для runtime Face ID;
- FACEID_IMPORT_MANIFEST_PATH: временный manifest для импорта;
- FACEID_CACHE_DIR: каталог cache/reference_vectors.json.

## Windows service

Чтобы backend не зависел от открытого окна терминала на Windows-сервере, используй готовые скрипты:

```cmd
cd /d C:\inetpub\wwwroot
testFaceID\scripts\install-faceid-service.cmd
nssm start shinline-faceid
```

Сам backend запускается через [testFaceID/scripts/run-faceid-backend.cmd](testFaceID/scripts/run-faceid-backend.cmd). Этот launcher сам выставляет пути до runtime manifest, reference store и cache, поэтому следующий человек на сервере не обязан собирать длинную команду руками.

## Подготовка

Python зависимости:

```powershell
& "testFaceID\.venv\Scripts\python.exe" -m pip install -r testFaceID\requirements.txt
```

Frontend зависимости:

```powershell
Set-Location "testFaceID\frontend"
npm install
```

## Запуск

Самый короткий вариант из корня проекта:

```powershell
npm run faceid
```

Если dump лежит вне репозитория:

```powershell
$env:FACEID_DUMP_PATH = 'C:\faceid-data\sigur_20260506.sql'
npm run faceid
```

Если runtime manifest и store лежат вне репозитория:

```powershell
$env:FACEID_REFERENCE_STORE_DIR = 'C:\faceid-data\references'
$env:FACEID_REFERENCE_MANIFEST_PATH = 'C:\faceid-data\reference-manifest.json'
$env:FACEID_CACHE_DIR = 'C:\faceid-data\cache'
npm run faceid
```

Эта команда сама поднимет backend и frontend, без Activate.ps1 и без отдельного запуска Python руками.

Если нужен запуск по отдельности:

Backend:

```powershell
npm run faceid:backend
```

Frontend:

```powershell
npm run faceid:frontend
```

Старый ручной способ тоже работает:

Backend:

```powershell
Set-Location "c:\Users\ARMAGEDDON\Documents\theafs\shinline"
& "testFaceID\.venv\Scripts\python.exe" -m uvicorn backend.app:app --app-dir testFaceID --host 127.0.0.1 --port 8008
```

Frontend:

```powershell
Set-Location "c:\Users\ARMAGEDDON\Documents\theafs\shinline\testFaceID\frontend"
npm run dev
```

Открыть в браузере:

- http://localhost:4174

## Что есть в интерфейсе

- выбор фотографии для поиска;
- карточка с загруженной фотографией;
- карточка с найденным человеком и эталонной фотографией из дампа;
- список ближайших кандидатов с similarity;
- список всех лиц, которые реально проиндексированы из локального manifest;
- кнопка переиндексации локального reference store.

## Порог совпадения

Сейчас выставлен threshold 0.45.

Почему не ниже:

- между двумя разными эталонными лицами в текущем наборе уже есть similarity около 0.368;
- более низкий threshold для такого маленького набора дал бы слишком мягкие ложные совпадения.

## Основные файлы

- backend API: testFaceID/backend/app.py
- логика индекса и поиска: testFaceID/backend/face_service.py
- загрузка ONNX-моделей: testFaceID/backend/model_downloader.py
- frontend: testFaceID/frontend/src/App.tsx
