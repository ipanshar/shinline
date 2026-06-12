---
type: concept
status: active
created: 2026-06-10
updated: 2026-06-10
---

# Territory Navigation

## Summary

Территориальная навигация пока представлена workbook-артефактом со схемами `Т1`, `Т2`, `Т3`, координатными подписями и точками. Это похоже на операционную карту местности, а не на полноценный приложенческий модуль.

## Current Shape

- Источник — Excel workbook `2026 Навигация территории ШЛ.xlsx`.
- Листы содержат координатные ориентиры `N-Север` и `Е-Восток`, пронумерованные точки и подпись подготовившего.
- Прямая кодовая связка с текущими безопасно просмотренными модулями не обнаружена.

## Links

- [[sources/territory-navigation-2026|Territory Navigation 2026]]
- [[entities/spectech|Spectech]]

## Open Questions

- Является ли workbook источником данных для `/spectech/locations/scheme-file`, либо это параллельный операционный документ.
- Нужно ли в будущем выделить отдельную страницу по location schemes после просмотра связанного controller/view слоя.

## Evidence

- `2026 Навигация территории ШЛ.xlsx` (sheet metadata inspected on 2026-06-10)
- `routes/web.php:375-376`

