---
type: synthesis
status: active
created: 2026-06-10
updated: 2026-06-10
---

# Architecture Overview

## Summary

По текущим источникам проект — это не один модуль КПП, а набор пересекающихся операционных контуров: visitor/security flow, DSS integration, guest visits, spectech, violations/Face ID и общая RBAC-модель.

## Main Findings

- `GuestVisit` выделен как отдельная бизнес-сущность, но intentionally встроен поверх существующих `EntryPermit` и `Visitor`.
- DSS остаётся внешним транспортно-ориентированным контуром: token lifecycle, devices, vehicle capture, MQTT, permit vehicle sync.
- Face ID вынесен в Python runtime и обслуживается Laravel-командами и Windows service orchestration.
- Spectech выглядит как быстро растущий самостоятельный модуль с собственным UI/API и частично отдельным planning/reporting контуром.
- RBAC — сквозной координирующий слой между модулями.

## Cross-Links

- [[entities/guest-visits|Guest Visits]]
- [[entities/dss|DSS]]
- [[entities/spectech|Spectech]]
- [[concepts/face-id|Face ID]]
- [[concepts/violations|Violations]]
- [[concepts/rbac-permissions|RBAC Permissions]]

## Evidence

- `GUEST_PERMITS_ARCHITECTURE.md:23-35`
- `routes/web.php:141-165`
- `routes/web.php:372-431`
- `testFaceID/README.md:34-92`
- `database/seeders/PermissionsSeeder.php:16-114`

