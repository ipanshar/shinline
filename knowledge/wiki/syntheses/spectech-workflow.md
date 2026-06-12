---
type: synthesis
status: active
created: 2026-06-10
updated: 2026-06-10
---

# Spectech Workflow

## Summary

Spectech уже вырос за пределы “простого модуля заявок”. Документация фиксирует начальную версию, а текущие routes показывают более широкий workflow с planning, availability checks, truck catalog, schedules, weekly reports и exports.

## Main Findings

- Исходный документ описывает только requests-centric module.
- Текущие web routes добавляют `references`, `planning`, `reports` и `locations/scheme-file`.
- Текущий API покрывает не только CRUD/statuses для requests, но и scheduling, equipment types, availability, weekly reporting и export.
- Permission model осталась компактной: `spectech.view` и `spectech.manage`.

## Cross-Links

- [[entities/spectech|Spectech]]
- [[concepts/territory-navigation|Territory Navigation]]
- [[concepts/rbac-permissions|RBAC Permissions]]

## Evidence

- `SPECTECH_MODULE.md:3-48`
- `routes/web.php:372-414`
- `database/seeders/PermissionsSeeder.php:92-98`

