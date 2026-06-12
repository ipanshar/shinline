---
type: entity
status: active
created: 2026-06-10
updated: 2026-06-10
---

# DSS

## Summary

DSS в этом проекте — внешний контур безопасности и транспортного контроля. Локальное приложение управляет авторизацией, token lifecycle, захватами ТС, MQTT ingest, транспортными пропусками и частью операторских экранов вокруг DSS.

## Current Shape

- HTTP-контур DSS покрывает авторизацию, настройки, keepalive, update-token, устройства, AddPerson, историю зон, technical overview и Telegram-конфигурацию.
- Realtime-контур DSS включает MQTT listener и ingest vehicle captures.
- Операционный Windows-контур включает daemon, queue worker и health-check watchdog.
- DSS интегрирован в RBAC через `integrations.dss`.

## Links

- [[sources/dss-api-contract|DSS API Contract]]
- [[sources/dss-add-person-api|DSS Add Person API]]
- [[sources/dss-windows-operation|DSS Windows Operation]]
- [[entities/entry-permits|Entry Permits]]
- [[entities/visitors|Visitors]]
- [[entities/guest-visits|Guest Visits]]

## Tensions

- DSS ориентирован на транспортные и capture-сущности, а не на полную бизнес-модель гостя.
- Документация по AddPerson существует отдельно, но фактически это частный случай общего DSS-контракта.

## Evidence

- `routes/web.php:141-165`
- `routes/api.php:196`
- `database/seeders/PermissionsSeeder.php:75-80`
- `DSS_API_CONTRACT.md:5-222`
- `DSS_WINDOWS_OPERATION.md:12-95`

