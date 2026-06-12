---
type: source
status: active
created: 2026-06-10
updated: 2026-06-10
source_path: testFaceID/README.md
---

# Face ID Pilot

## Summary

`testFaceID` — локальный прототип поиска человека по фотографии: React/Vite frontend, FastAPI backend, локальный manifest эталонных фото и импорт из dump или живой БД Sigur.

## Key Points

- Прототип ищет ближайшее лицо по embedding и показывает эталонное фото для ручной проверки.
- Runtime backend работает от локального manifest/store, а dump используется только для импорта.
- Основные команды: `violations:import-sigur-dump`, `violations:import-sigur-live`, `violations:sync-faceid-runtime`, `npm run faceid`.
- Threshold совпадения описан как `0.45`.
- Документ перечисляет основные файлы FastAPI backend и frontend.

## Related Pages

- [[concepts/face-id|Face ID]]
- [[concepts/violations|Violations]]
- [[sources/violations-faceid-operation|Violations Face ID Operation]]

## Source Notes

- Это не production specification, а практическая памятка по локальному прототипу и серверному запуску.
- Документ полезен для понимания, где заканчивается Laravel orchestration и начинается Python runtime.

## Citations

- `testFaceID/README.md:3-33`
- `testFaceID/README.md:34-102`
- `testFaceID/README.md:103-154`
- `testFaceID/README.md:156-213`

