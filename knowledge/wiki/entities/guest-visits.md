---
type: entity
status: active
created: 2026-06-10
updated: 2026-06-10
---

# Guest Visits

## Summary

`GuestVisit` — корневая бизнес-сущность гостевого визита. Модуль уже отделён от старого транспортного permit flow и оркестрирует гостя, связанные ТС, permits и факт присутствия.

## Current Shape

- Таблица `guest_visits` содержит гостя, встречающую сторону, период визита, workflow status, тип пропуска, историю входа/выхода и `source`.
- Есть отдельные таблицы `guest_visit_vehicles` и `guest_visit_permits`.
- API покрывает список, создание, обновление, просмотр, отмену, закрытие, check-in, check-out, добавление/удаление ТС, выпуск и отзыв пропусков.
- UI живёт на `/guests`, а RBAC использует отдельную группу `guest_visits.*`.

## Links

- [[entities/entry-permits|Entry Permits]]
- [[entities/visitors|Visitors]]
- [[entities/dss|DSS]]
- [[sources/guest-permits-architecture|Guest Permits Architecture]]
- [[sources/guest-permits-implementation-status|Guest Permits Implementation Status]]
- [[syntheses/guest-dss-flow|Guest and DSS Flow]]

## Tensions

- Архитектурный документ описывает модуль как план внедрения, но код и status docs показывают уже реализованный контур.
- `source` расширен до `telegram_bot`, то есть модуль ушёл дальше первоначальной архитектурной версии.

## Evidence

- `database/migrations/2026_04_14_120000_create_guest_visits_table.php:11-38`
- `database/migrations/2026_04_28_120000_extend_guest_visits_source_enum.php:8-28`
- `routes/api.php:72-83`
- `routes/web.php:76`
- `database/seeders/PermissionsSeeder.php:31-38`

