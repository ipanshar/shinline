---
type: source
status: active
created: 2026-06-10
updated: 2026-06-10
source_path: DSS_WINDOWS_OPERATION.md
---

# DSS Windows Operation

## Summary

Документ описывает production-like контур запуска DSS daemon на Windows/IIS: NSSM service для daemon, отдельный queue worker и watchdog через Task Scheduler.

## Key Points

- `php artisan dss:daemon` запускается как сервис `ShinlineDssDaemon`.
- Очереди для DSS enrichment/media/notifications выносятся в отдельный `queue:work`.
- `dss:health-check` выполняется каждую минуту и может делать `nssm restart`.
- Автоперезапуск зависит от `DSS_RESTART_SERVICE` и `DSS_NSSM_PATH`.

## Related Pages

- [[entities/dss|DSS]]
- [[syntheses/architecture-overview|Architecture Overview]]

## Source Notes

- Документ операционный и Windows-специфичный.
- Он дополняет API контракт, показывая как DSS работает как daemon/worker pipeline, а не только набор HTTP ручек.

## Citations

- `DSS_WINDOWS_OPERATION.md:5-10`
- `DSS_WINDOWS_OPERATION.md:12-36`
- `DSS_WINDOWS_OPERATION.md:38-74`
- `DSS_WINDOWS_OPERATION.md:75-95`

