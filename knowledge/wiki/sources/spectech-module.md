---
type: source
status: active
created: 2026-06-10
updated: 2026-06-10
source_path: SPECTECH_MODULE.md
---

# Spectech Module

## Summary

Краткая ранняя заметка о модуле спецтехники: перечисляет базовые backend/frontend артефакты, два permission и минимальный набор routes.

## Key Points

- Документ фиксирует стартовый контур: `SpectechRequest`, `SpectechRequestController`, migration `2026_05_08_100000_create_spectech_requests_table.php` и несколько Inertia страниц.
- RBAC: `spectech.view` и `spectech.manage`.
- API в документе ограничен `GET/POST requests` и `PATCH status`.

## Related Pages

- [[entities/spectech|Spectech]]
- [[concepts/rbac-permissions|RBAC Permissions]]
- [[syntheses/spectech-workflow|Spectech Workflow]]

## Source Notes

- По текущим `routes/web.php` документ уже неполон: в коде есть planning, reports, references, locations scheme, scheduling API и export/report endpoints.
- Это хороший стартовый changelog, но не актуальная полная карта модуля.

## Citations

- `SPECTECH_MODULE.md:3-20`
- `SPECTECH_MODULE.md:22-48`
- `SPECTECH_MODULE.md:49-81`
- `routes/web.php:372-414`
- `database/seeders/PermissionsSeeder.php:92-98`

