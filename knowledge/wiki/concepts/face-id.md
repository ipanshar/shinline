---
type: concept
status: active
created: 2026-06-10
updated: 2026-06-10
---

# Face ID

## Summary

Face ID в этом репозитории — отдельный Python runtime и локальный prototype (`testFaceID`), встроенный в Laravel deploy/ops контур через runtime sync команду и Windows service orchestration.

## Current Shape

- Прототип использует FastAPI backend и React/Vite frontend.
- Runtime source — локальный manifest и reference store эталонных фото.
- Данные для первичного наполнения могут приходить из SQL dump Sigur или из live DB connection `sigur`.
- Laravel управляет sync/rebuild контура через `violations:sync-faceid-runtime`.

## Links

- [[sources/faceid-pilot|Face ID Pilot]]
- [[sources/violations-faceid-operation|Violations Face ID Operation]]
- [[concepts/violations|Violations]]
- [[syntheses/faceid-violations-flow|Face ID and Violations Flow]]

## Open Questions

- Где проходит текущая граница между прототипом `testFaceID` и production workflow модуля нарушений.
- Используется ли web UI prototype отдельно от Telegram/web workflows нарушений или только как инженерный инструмент.

## Evidence

- `testFaceID/README.md:3-18`
- `testFaceID/README.md:34-92`
- `testFaceID/README.md:103-213`
- `VIOLATIONS_FACEID_OPERATION.md:13-44`

