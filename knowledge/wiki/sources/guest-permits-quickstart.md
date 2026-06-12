---
type: source
status: active
created: 2026-06-10
updated: 2026-06-10
source_path: QUICKSTART_GUESTS.md
---

# Guest Permits Quickstart

## Summary

Пользовательский quickstart по модулю гостей: где он находится в UI, какие операции доступны, какие права нужны и какие основные сценарии считаются штатными.

## Key Points

- Главный вход в модуль: `/guests` и пункт `Операторская -> Гости`.
- Описаны сценарии для разового визита, визита с ТС и многоразового визита.
- Указаны 12 API endpoints и базовая структура таблиц.
- Документ explicitly пишет, что транспортные permits гостя синхронизируются с DSS, а `GuestVisit` оркестрирует `EntryPermit`.

## Related Pages

- [[entities/guest-visits|Guest Visits]]
- [[entities/entry-permits|Entry Permits]]
- [[entities/dss|DSS]]

## Source Notes

- Это лучший источник о пользовательском workflow, но не о фактической внутренней реализации.
- В quickstart уже отражено расширение `source` enum до `telegram_bot`, чего не было в исходной архитектурной версии.

## Citations

- `QUICKSTART_GUESTS.md:3-12`
- `QUICKSTART_GUESTS.md:15-47`
- `QUICKSTART_GUESTS.md:50-105`
- `QUICKSTART_GUESTS.md:108-149`
- `QUICKSTART_GUESTS.md:153-250`

