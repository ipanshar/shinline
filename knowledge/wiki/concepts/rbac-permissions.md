---
type: concept
status: active
created: 2026-06-10
updated: 2026-06-10
---

# RBAC Permissions

## Summary

RBAC в проекте организован как единый permission catalog в `PermissionsSeeder`, где guest visits, DSS, spectech, violations и другие модули получают отдельные permission groups.

## Current Shape

- Гостевые визиты отделены от общих permits через `guest_visits.*`.
- DSS живёт под `integrations.dss`.
- Spectech использует `spectech.view` и `spectech.manage`.
- Violations имеют отдельный набор review/reference/settings permissions.

## Links

- [[entities/guest-visits|Guest Visits]]
- [[entities/dss|DSS]]
- [[entities/spectech|Spectech]]
- [[concepts/violations|Violations]]

## Tensions

- В доступных источниках нет отдельного документа про RBAC как продуктовую модель, только seed-based implementation view.
- Role assignments различаются по модулям: например `Управляющий` в seed-файле явно получает GreenLog permissions, а не полный guest-visits пакет, хотя пользовательские guest docs упоминают управляющего как доступную роль.

## Evidence

- `database/seeders/PermissionsSeeder.php:16-114`
- `database/seeders/PermissionsSeeder.php:131-260`
- `QUICKSTART_GUESTS.md:89-105`
- `IMPLEMENTATION_STATUS.md:176-190`

