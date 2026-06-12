---
type: synthesis
status: active
created: 2026-06-10
updated: 2026-06-10
---

# Documentation Gaps and Evolution

## Summary

Просмотренные источники полезны, но это смесь целевой архитектуры, self-reported status docs, quickstarts и ops notes. Несколько документов уже отражают более ранний этап, чем текущие routes и migrations.

## Main Findings

- `GUEST_PERMITS_ARCHITECTURE.md` описывает план внедрения, а `IMPLEMENTATION_STATUS.md`, `QUICKSTART_GUESTS.md`, `VERIFICATION_CHECKLIST.md` уже считают модуль завершённым.
- Первоначальная guest architecture предлагала `source = operator|integration|import`, но текущая migration и quickstart уже включают `telegram_bot`.
- `SPECTECH_MODULE.md` заметно отстаёт от `routes/web.php`, где спектр страниц и API намного шире.
- RBAC docs в guest quickstart/status называют управляющего допустимой ролью, но текущий `PermissionsSeeder` явно не выдаёт `guest_visits.*` роли `Управляющий`; это требует отдельной проверки продукта против seed implementation.
- Verification checklist содержит машинно-зависимые пути и команды старой среды автора, поэтому его нужно читать как historical checklist, а не как актуальную операционную инструкцию для этой машины.

## Cross-Links

- [[sources/guest-permits-architecture|Guest Permits Architecture]]
- [[sources/guest-permits-implementation-status|Guest Permits Implementation Status]]
- [[sources/guest-permits-verification-checklist|Guest Permits Verification Checklist]]
- [[sources/spectech-module|Spectech Module]]
- [[concepts/rbac-permissions|RBAC Permissions]]

## Evidence

- `GUEST_PERMITS_ARCHITECTURE.md:64-70`
- `QUICKSTART_GUESTS.md:169-170`
- `database/migrations/2026_04_14_120000_create_guest_visits_table.php:30`
- `database/migrations/2026_04_28_120000_extend_guest_visits_source_enum.php:15-28`
- `routes/web.php:372-414`
- `database/seeders/PermissionsSeeder.php:218-234`
- `QUICKSTART_GUESTS.md:91-105`
- `VERIFICATION_CHECKLIST.md:12-25`

