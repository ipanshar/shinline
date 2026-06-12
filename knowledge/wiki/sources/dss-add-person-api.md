---
type: source
status: active
created: 2026-06-10
updated: 2026-06-10
source_path: DSS_ADD_PERSON_API.md
---

# DSS Add Person API

## Summary

Документ описывает локальный endpoint для добавления человека в DSS, формат входных данных, маппинг в DSS payload, ожидаемые ответы и операционные детали вроде автологина и логирования.

## Key Points

- Локальный endpoint описан как `POST /api/dss/add-person`.
- Входные поля: `firstName`, `lastName`, `gender`, `iin`, `data`, `foto`.
- `foto` может быть одной base64-строкой или массивом строк.
- Сервис автоматически авторизуется в DSS, если токен отсутствует или истёк.
- Документ описывает только token-based API-вызов; текущий код также имеет session-auth маршрут для web UI.

## Related Pages

- [[entities/dss|DSS]]
- [[concepts/face-id|Face ID]]
- [[sources/dss-api-contract|DSS API Contract]]

## Source Notes

- Этот документ уже частично дублирует раздел `AddPerson` из общего DSS контракта.
- Для wiki его полезнее трактовать как подробный payload note по одной операции, а не как отдельную архитектуру.
- В текущем приложении AddPerson присутствует как в `routes/api.php`, так и в `routes/web.php`.

## Citations

- `DSS_ADD_PERSON_API.md:3-18`
- `DSS_ADD_PERSON_API.md:22-40`
- `DSS_ADD_PERSON_API.md:42-95`
- `DSS_ADD_PERSON_API.md:97-141`
- `DSS_ADD_PERSON_API.md:210-257`
- `routes/api.php:196`
- `routes/web.php:153`

