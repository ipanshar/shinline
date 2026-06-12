---
type: index
status: active
created: 2026-06-10
updated: 2026-06-10
---

# Wiki Index

Каталог текущего wiki по существующим данным проекта. Для wiki-запросов сначала читать этот файл, затем переходить в нужные source/entity/concept/synthesis pages.

## Sources

- [[sources/dss-api-contract|DSS API Contract]] - основной контракт внешней интеграции с Dahua DSS.
- [[sources/dss-add-person-api|DSS Add Person API]] - детальный payload note по локальной операции добавления человека в DSS.
- [[sources/dss-windows-operation|DSS Windows Operation]] - Windows/NSSM/Task Scheduler контур DSS daemon.
- [[sources/guest-permits-architecture|Guest Permits Architecture]] - целевая архитектура guest module и его связи с `EntryPermit`, `Visitor` и DSS.
- [[sources/guest-permits-implementation-status|Guest Permits Implementation Status]] - self-reported статус полной реализации guest module.
- [[sources/guest-permits-quickstart|Guest Permits Quickstart]] - пользовательская памятка по guest UI и сценариям.
- [[sources/guest-permits-verification-checklist|Guest Permits Verification Checklist]] - historical checklist проверки guest module.
- [[sources/spectech-module|Spectech Module]] - ранний changelog модуля спецтехники.
- [[sources/violations-faceid-operation|Violations Face ID Operation]] - ops note по sync/rebuild Face ID runtime для нарушений.
- [[sources/faceid-pilot|Face ID Pilot]] - описание Python/React prototype в `testFaceID`.
- [[sources/territory-navigation-2026|Territory Navigation 2026]] - workbook со схемами территории и координатными точками.

## Entities

- [[entities/dss|DSS]] - внешний security/transport контур с HTTP, MQTT и ops pipeline.
- [[entities/guest-visits|Guest Visits]] - корневая бизнес-сущность гостевого визита и её API/UI контур.
- [[entities/entry-permits|Entry Permits]] - универсальные пропуска, используемые гостевым и DSS-контурами.
- [[entities/visitors|Visitors]] - события присутствия и checkpoint flow.
- [[entities/spectech|Spectech]] - быстро растущий модуль заявок, planning и reporting по спецтехнике.

## Concepts

- [[concepts/face-id|Face ID]] - Python runtime и sync pipeline для распознавания лиц.
- [[concepts/violations|Violations]] - модуль нарушений, review и identity resolution.
- [[concepts/territory-navigation|Territory Navigation]] - схемы территории и возможная связь с location-based модулями.
- [[concepts/rbac-permissions|RBAC Permissions]] - permission catalog и роль модулей в общем access model.

## Syntheses

- [[syntheses/architecture-overview|Architecture Overview]] - краткая карта того, как связаны основные контуры проекта.
- [[syntheses/guest-dss-flow|Guest and DSS Flow]] - как гостевой модуль сочетается с permits, visitors и DSS.
- [[syntheses/faceid-violations-flow|Face ID and Violations Flow]] - связь Python Face ID runtime и Laravel violations module.
- [[syntheses/spectech-workflow|Spectech Workflow]] - evolution note по модулю спецтехники.
- [[syntheses/documentation-gaps-and-evolution|Documentation Gaps and Evolution]] - найденные расхождения, устаревшие участки и эволюция документов.

## Maintenance Notes

- Ingest only curated raw sources from `knowledge/raw/` unless the user explicitly names another source.
- Update this index whenever wiki pages are created, renamed, or materially changed.
- Keep each entry to a link plus a one-line description.
- For this initial fill pass, original repo docs and safe code references were used because the user explicitly requested existing project data.
