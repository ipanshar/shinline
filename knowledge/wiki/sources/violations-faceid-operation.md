---
type: source
status: active
created: 2026-06-10
updated: 2026-06-10
source_path: VIOLATIONS_FACEID_OPERATION.md
---

# Violations Face ID Operation

## Summary

Операционный документ о деплое и поддержке Face ID runtime для модуля нарушений: синхронизация эталонных фото, rebuild runtime-store и перезапуск Windows service.

## Key Points

- Обычный deploy включает `git pull`, `php artisan migrate`, `npm run build`.
- `php artisan migrate` может автоматически синхронизировать Face ID runtime-store и попросить Python backend сделать rebuild.
- Основная ручная команда оператора: `php artisan violations:sync-faceid-runtime --json`.
- Документ перечисляет рабочие env-переменные, runtime manifest, reference store и лог синхронизации.

## Related Pages

- [[concepts/face-id|Face ID]]
- [[concepts/violations|Violations]]
- [[syntheses/faceid-violations-flow|Face ID and Violations Flow]]

## Source Notes

- Этот документ описывает ops-контур вокруг Python backend, но не сам пользовательский UI нарушений.
- Он показывает, что Face ID runtime интегрирован в общий Laravel deploy pipeline.

## Citations

- `VIOLATIONS_FACEID_OPERATION.md:3-31`
- `VIOLATIONS_FACEID_OPERATION.md:33-45`
- `VIOLATIONS_FACEID_OPERATION.md:46-82`
- `VIOLATIONS_FACEID_OPERATION.md:84-98`

