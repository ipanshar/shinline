---
type: source
status: active
created: 2026-06-10
updated: 2026-06-10
source_path: GUEST_PERMITS_ARCHITECTURE.md
---

# Guest Permits Architecture

## Summary

Архитектурный документ предлагает вынести гостевые визиты в отдельный доменный модуль, где `GuestVisit` оркестрирует `EntryPermit`, `Visitor` и `Truck`, не ломая существующий DSS-контур.

## Key Points

- Проблема исходной схемы: гостевые поля были смешаны с общим транспортным пропуском.
- Предлагаемая модель: `guest_visits`, `guest_visit_vehicles`, `guest_visit_permits`, плюс `guest_visit_id` в `visitors`.
- Гостевой модуль должен выпускать `person` и `vehicle` permits отдельно.
- DSS должен знать только о транспортном пропуске, а не о бизнес-сущности гостя.
- Документ заканчивается поэтапным планом внедрения и рекомендацией не раздувать старый `EntryPermitsManager`.

## Related Pages

- [[entities/guest-visits|Guest Visits]]
- [[entities/entry-permits|Entry Permits]]
- [[entities/visitors|Visitors]]
- [[entities/dss|DSS]]
- [[syntheses/guest-dss-flow|Guest and DSS Flow]]

## Source Notes

- Это проектная целевая архитектура, а не снимок текущего состояния.
- По текущим миграциям и маршрутам большая часть этого плана уже реализована.
- Отдельно стоит отслеживать, где документ описывает намерение, а где код уже пошёл дальше, например с `source = telegram_bot`.

## Citations

- `GUEST_PERMITS_ARCHITECTURE.md:3-35`
- `GUEST_PERMITS_ARCHITECTURE.md:36-124`
- `GUEST_PERMITS_ARCHITECTURE.md:125-176`
- `GUEST_PERMITS_ARCHITECTURE.md:178-223`
- `GUEST_PERMITS_ARCHITECTURE.md:224-365`

