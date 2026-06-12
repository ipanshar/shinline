---
type: entity
status: active
created: 2026-06-10
updated: 2026-06-10
---

# Entry Permits

## Summary

`EntryPermit` остаётся универсальной сущностью права прохода/проезда. Гостевой модуль не заменяет её, а использует как подчинённый механизм для person/vehicle permits.

## Current Shape

- Архитектурная роль `EntryPermit` — отделить право доступа от бизнес-контекста визита.
- Для гостевого домена `guest_visit_permits` связывает `guest_visit_id` с `entry_permit_id` и типом субъекта `person|vehicle`.
- Vehicle permits синхронизируются с DSS через существующий DSS-контур.

## Links

- [[entities/guest-visits|Guest Visits]]
- [[entities/dss|DSS]]
- [[entities/visitors|Visitors]]
- [[syntheses/guest-dss-flow|Guest and DSS Flow]]

## Tensions

- Старые guest-поля в `entry_permits` рассматривались как переходные; wiki стоит трактовать их как legacy compatibility layer.
- Исторически домен permit был перегружен гостевой логикой, и архитектурный документ специально уводит от этого.

## Evidence

- `GUEST_PERMITS_ARCHITECTURE.md:29-35`
- `GUEST_PERMITS_ARCHITECTURE.md:93-136`
- `DSS_API_CONTRACT.md:185-197`
- `QUICKSTART_GUESTS.md:237-249`

