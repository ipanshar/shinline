---
type: source
status: active
created: 2026-06-10
updated: 2026-06-10
source_path: DSS_API_CONTRACT.md
---

# DSS API Contract

## Summary

Документ фиксирует внешний контракт интеграции с Dahua DSS: авторизацию в два этапа, lifecycle токена, запросы к захватам ТС, MQTT-конфигурацию, AddPerson и синхронизацию транспортных пропусков.

## Key Points

- Базовый URL хранится в `dss_setings.base_url`, а конфигурация endpoint'ов в `dss_apis`.
- Для защищённых вызовов используется `X-Subject-Token`; успешный ответ DSS ожидается с `code = 1000`.
- MQTT listener слушает `mq.event.msg.topic.{userId}` и передаёт payload'ы в `DssCaptureService::ingestRealtimeCaptureItems()`.
- AddPerson принимает локальные поля `firstName`, `lastName`, `gender`, `iin`, `data`, `foto` и мапит их в DSS payload с `baseInfo`, `extensionInfo`, `authenticationInfo`, `accessInfo`, `faceComparisonInfo` и `entranceInfo`.
- Синхронизация транспортных пропусков опирается на `App\Services\DssPermitVehicleService` и хранит `remote_vehicle_id` локально.

## Related Pages

- [[entities/dss|DSS]]
- [[entities/entry-permits|Entry Permits]]
- [[entities/visitors|Visitors]]
- [[concepts/rbac-permissions|RBAC Permissions]]
- [[syntheses/guest-dss-flow|Guest and DSS Flow]]

## Source Notes

- Документ полезен как канонический контракт DSS, а не как пользовательская инструкция.
- В нём явно отделены локальные backend-методы от внешних DSS endpoint'ов.
- Он важен для проверки, где DSS остаётся транспортно-ориентированным, а где приложение держит бизнес-логику само.

## Citations

- `DSS_API_CONTRACT.md:3-12`
- `DSS_API_CONTRACT.md:13-55`
- `DSS_API_CONTRACT.md:85-149`
- `DSS_API_CONTRACT.md:150-197`
- `DSS_API_CONTRACT.md:199-222`

