---
type: entity
status: active
created: 2026-06-10
updated: 2026-06-10
---

# Visitors

## Summary

`Visitor` в проекте — факт въезда/выезда и присутствия на территории. Для гостевого модуля это не заменяемая сущность, а трассирующий слой между заявкой, пропуском и реальным checkpoint event.

## Current Shape

- Архитектурно `visitors` расширен полем `guest_visit_id`, сохраняя при этом `entry_permit_id`.
- В routes есть большой legacy/security контур вокруг регистрации въезда, pending review, exit review и истории посетителей.
- Для guest module `check-in` и `check-out` встроены как отдельные guest endpoints.

## Links

- [[entities/guest-visits|Guest Visits]]
- [[entities/entry-permits|Entry Permits]]
- [[entities/dss|DSS]]
- [[syntheses/guest-dss-flow|Guest and DSS Flow]]
- [[syntheses/faceid-violations-flow|Face ID and Violations Flow]]

## Tensions

- Visitor flow уже давно живёт как отдельный checkpoint контур, поэтому новые guest features вынуждены встраиваться в существующую security-логику, а не заменять её.

## Evidence

- `GUEST_PERMITS_ARCHITECTURE.md:111-124`
- `QUICKSTART_GUESTS.md:247-249`
- `routes/web.php:227-245`
- `routes/api.php:72-83`

