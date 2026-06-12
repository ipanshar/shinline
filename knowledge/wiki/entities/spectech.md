---
type: entity
status: active
created: 2026-06-10
updated: 2026-06-10
---

# Spectech

## Summary

Модуль спецтехники стартовал как контур заявок, но текущие маршруты показывают более широкий продукт: каталог, заявки, dashboard, locations, references, planning, schedule API, weekly reports и экспорт.

## Current Shape

- Базовые permissions: `spectech.view` и `spectech.manage`.
- Web UI включает как минимум `catalog`, `requests`, `dashboard`, `locations`, `references`, `planning` и `reports`.
- API включает заявки, статусы, отмену, создание из schedule, availability check, truck catalog, scheduling и weekly reports.

## Links

- [[sources/spectech-module|Spectech Module]]
- [[concepts/rbac-permissions|RBAC Permissions]]
- [[concepts/territory-navigation|Territory Navigation]]
- [[syntheses/spectech-workflow|Spectech Workflow]]

## Tensions

- `SPECTECH_MODULE.md` отражает только ранний scope и уже не покрывает planning/reporting часть.
- Вероятна связь со схемами локаций и навигации территории, но в просмотренных источниках она ещё не формализована.

## Evidence

- `SPECTECH_MODULE.md:3-48`
- `routes/web.php:372-414`
- `database/seeders/PermissionsSeeder.php:92-98`

