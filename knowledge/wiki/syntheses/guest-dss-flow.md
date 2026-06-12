---
type: synthesis
status: active
created: 2026-06-10
updated: 2026-06-10
---

# Guest and DSS Flow

## Summary

Гостевой модуль и DSS связаны не напрямую через физлицо, а через транспортный контур. `GuestVisit` агрегирует заявку и бизнес-контекст, `EntryPermit` хранит право доступа, `Visitor` хранит факт прохода, а DSS обслуживает vehicle-related часть.

## Main Findings

- Для гостя без ТС DSS не является главным носителем состояния; основной контур живёт внутри guest/visitor module.
- Для гостя с ТС создаётся как минимум `person` permit и `vehicle` permit, причём vehicle permit синхронизируется с DSS.
- AddPerson в DSS существует как отдельная операция, но в просмотренных документах главный DSS business value всё равно остаётся вокруг транспорта, capture и permit sync.
- Архитектурная рекомендация “DSS знает только о транспортном пропуске” в целом совпадает с текущими документами и контрактом permit vehicle sync.

## Cross-Links

- [[entities/guest-visits|Guest Visits]]
- [[entities/entry-permits|Entry Permits]]
- [[entities/visitors|Visitors]]
- [[entities/dss|DSS]]

## Evidence

- `GUEST_PERMITS_ARCHITECTURE.md:288-296`
- `QUICKSTART_GUESTS.md:237-249`
- `DSS_API_CONTRACT.md:150-197`
- `routes/api.php:72-83`
- `routes/web.php:153-155`

