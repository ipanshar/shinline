---
type: source
status: active
created: 2026-06-10
updated: 2026-06-10
source_path: VERIFICATION_CHECKLIST.md
---

# Guest Permits Verification Checklist

## Summary

Чеклист верификации guest module: миграции, модели, сервисы, контроллеры, request-классы, маршруты, frontend, permissions и run-time окружение.

## Key Points

- Документ фиксирует ожидаемое число guest-related migrations и классов.
- Проверка маршрутов разделена на web route `/guests` и 12 API endpoints.
- Чеклист содержит env-specific команды и ожидаемые результаты для локальной машины автора.
- Итоговый вывод документа: `PASSED ALL CHECKS`.

## Related Pages

- [[entities/guest-visits|Guest Visits]]
- [[concepts/rbac-permissions|RBAC Permissions]]
- [[sources/guest-permits-implementation-status|Guest Permits Implementation Status]]

## Source Notes

- Документ полезен как check matrix, но не как независимое доказательство того, что всё ещё актуально.
- В нём явно видны environment-specific следы старой машины автора, например путь `/Users/akim/Desktop/shinline`.

## Citations

- `VERIFICATION_CHECKLIST.md:1-28`
- `VERIFICATION_CHECKLIST.md:32-117`
- `VERIFICATION_CHECKLIST.md:121-223`
- `VERIFICATION_CHECKLIST.md:227-251`
- `VERIFICATION_CHECKLIST.md:255-416`

