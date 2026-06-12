---
type: concept
status: active
created: 2026-06-10
updated: 2026-06-10
---

# Violations

## Summary

Модуль нарушений объединяет фиксацию инцидентов, review UI, справочники категорий/типов и дополнительный контур identity resolution через Face ID и reference employees.

## Current Shape

- Web UI включает `/violations` и `/violations/temporary-passes`.
- Есть admin API для incidents, catalog, resolve identity и настройки categories/types.
- Telegram miniapp имеет отдельные violations endpoints.
- RBAC отделяет `violations.record`, `violations.review`, `violations.reference`, `violations.settings`.

## Links

- [[concepts/face-id|Face ID]]
- [[concepts/rbac-permissions|RBAC Permissions]]
- [[sources/violations-faceid-operation|Violations Face ID Operation]]
- [[syntheses/faceid-violations-flow|Face ID and Violations Flow]]

## Open Questions

- Насколько модуль нарушений зависит от live Face ID runtime в повседневной работе, а не только в специальных review сценариях.

## Evidence

- `routes/web.php:421-431`
- `routes/api.php:240-243`
- `database/seeders/PermissionsSeeder.php:109-113`
- `database/seeders/PermissionsSeeder.php:248-260`

