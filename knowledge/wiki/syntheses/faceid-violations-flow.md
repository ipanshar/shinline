---
type: synthesis
status: active
created: 2026-06-10
updated: 2026-06-10
---

# Face ID and Violations Flow

## Summary

Face ID и violations образуют двухконтурную систему: Python runtime отвечает за embeddings, поиск и reference manifest, а Laravel-модуль нарушений отвечает за review, catalog, temporary passes и orchestration sync.

## Main Findings

- Runtime refresh сведён к одной команде `violations:sync-faceid-runtime`.
- Импорт reference data отделён от runtime поиска: dump или live Sigur DB используются для наполнения локального reference store, а не для online query.
- Violations UI и Telegram endpoints живут в основном Laravel контуре; Face ID выступает как supporting recognition subsystem.
- Windows service и NSSM явно считаются целевым operational shape для production-like backend.

## Cross-Links

- [[concepts/face-id|Face ID]]
- [[concepts/violations|Violations]]
- [[concepts/rbac-permissions|RBAC Permissions]]

## Evidence

- `VIOLATIONS_FACEID_OPERATION.md:13-44`
- `VIOLATIONS_FACEID_OPERATION.md:46-98`
- `testFaceID/README.md:38-92`
- `testFaceID/README.md:103-213`
- `routes/web.php:421-431`
- `routes/api.php:240-243`

