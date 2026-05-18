# Face ID pilot in testFaceID

Это локальный прототип поиска человека по фотографии.

Что он делает:
- принимает загруженное фото через мини-интерфейс;
- извлекает face embedding на Python;
- ищет ближайшее лицо среди эталонных фотографий из дампа;
- показывает, кого система считает совпадением;
- возвращает сохранённую эталонную фотографию из базы, чтобы человек глазами проверил, не нашли ли кого-то другого.

Что используется:
- frontend: React + Vite
- backend: FastAPI + OpenCV YuNet/SFace ONNX models
- источник эталонных фото: таблица personalimg из sigur_20260506.sql

Текущее ограничение дампа:
- в personalimg сейчас только 3 фотографии сотрудников;
- руководителей в этом прототипе нет;
- таблица photo пока не используется как эталонная база, потому что в дампе нет надёжной связи photo -> сотрудник.

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
- список всех лиц, которые реально проиндексированы из дампа;
- кнопка переиндексации дампа.

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
