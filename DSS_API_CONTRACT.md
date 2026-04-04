# DSS API Contract

Документ фиксирует используемые внешние методы Dahua DSS, их обязательные поля и ожидаемые ответы.

## Общие требования

- Базовый URL хранится в `dss_setings.base_url`.
- Конфигурация endpoint'ов хранится в таблице `dss_apis`.
- Для защищённых вызовов используется заголовок `X-Subject-Token`.
- Формат тела запроса — `application/json`.
- Успешный ответ DSS ожидается с `code = 1000`.

## 1. Authorize

Используется в два этапа через один endpoint с разными payload.

### Шаг 1: First Login
- Внутренний метод: `DssService::firstLogin`
- Конфигурация API: `api_name = Authorize`
- HTTP method: `POST`
- Обязательные поля запроса:
  - `userName: string`
  - `ipAddress: string` (может быть пустой строкой)
  - `clientType: string` (`WINPC_V2`)
- Ожидаемые поля ответа:
  - `realm: string`
  - `randomKey: string`

### Шаг 2: Second Login
- Внутренний метод: `DssService::secondLogin`
- HTTP method: `POST`
- Обязательные поля запроса:
  - `userName: string`
  - `signature: string`
  - `randomKey: string`
  - `encryptType: string` (`MD5`)
  - `clientType: string` (`WINPC_V2`)
- Ожидаемые поля ответа:
  - `token: string`
  - `credential?: string`

Локально после успешного второго логина backend сохраняет в `dss_setings`:
- `secret_key`
- `secret_vector`

Если DSS явно не вернул эти значения в ответе, backend генерирует их локально для последующего использования без изменения текущего payload авторизации.

## 2. KeepAlive

- Внутренний метод: `DssService::dssKeepAlive`
- Конфигурация API: `api_name = KeepAlive`
- HTTP method: `PUT`
- Заголовки:
  - `X-Subject-Token: string`
- Обязательные поля запроса:
  - `token: string`
- Ожидаемые поля ответа:
  - `code: number`
  - `data.token: string`
- Особый случай:
  - `code = 7000` означает истечение/невалидность токена, требуется новая авторизация.

## 3. UpdateToken

- Внутренний метод: `DssService::dssUpdateToken`
- Конфигурация API: `api_name = UpdateToken`
- HTTP method: `POST`
- Заголовки:
  - `X-Subject-Token: string`
- Обязательные поля запроса:
  - `token: string`
- Ожидаемые поля ответа:
  - `code: number`
  - `data.token: string`
  - `data.credential?: string`

## 4. VehicleCapture

- Внутренний метод: `DssService::dssVehicleCapture`
- Конфигурация API: `api_name = VehicleCapture`
- HTTP method: `POST`
- Заголовки:
  - `X-Subject-Token: string`
- Обязательные поля запроса:
  - `plateNoMatchMode: integer`
  - `startTime: integer` (Unix timestamp)
  - `endTime: integer` (Unix timestamp)
  - `page: integer`
  - `currentPage: integer`
  - `pageSize: integer`
  - `orderDirection: string`
- Ожидаемые поля ответа:
  - `code: number`
  - `data.pageData: array`
- Используемые поля элементов `pageData`:
  - `channelId: string`
  - `channelName: string`
  - `plateNo: string`
  - `captureTime: integer`
  - `capturePicture?: string`
  - `plateNoPicture?: string`
  - `vehicleBrandName?: string`
  - `vehicleModelName?: string`
  - `vehicleColorName?: string`
  - `confidence?: number`
  - `plateScore?: number`

## 5. AddPerson

- Внутренний метод: `DssService::dssAddPerson`
- Конфигурация API: `api_name = AddPerson`
- HTTP method: `POST`
- Заголовки:
  - `X-Subject-Token: string`
- Обязательные поля входа в локальный backend:
  - `firstName: string`
  - `lastName: string`
  - `gender: integer` (`1` или `2`)
  - `iin: string`
  - `data: string` (`Y-m-d`)
  - `foto: string | string[]` (base64)
- Обязательные поля запроса в DSS:
  - `baseInfo.personId`
  - `baseInfo.firstName`
  - `baseInfo.lastName`
  - `baseInfo.gender`
  - `baseInfo.orgCode`
  - `baseInfo.source`
  - `baseInfo.facePictures`
  - `extensionInfo.idType`
  - `extensionInfo.idNo`
  - `extensionInfo.nationalityId`
  - `authenticationInfo.startTime`
  - `authenticationInfo.endTime`
  - `accessInfo.accessType`
  - `faceComparisonInfo.enableFaceComparisonGroup`
  - `entranceInfo.parkingSpaceQuotas`
  - `entranceInfo.vehicles`
- Ожидаемые поля ответа:
  - `code: number`
  - `data: object`

## Локальные защищённые маршруты

Все пользовательские POST-операции DSS должны вызываться через `/api/dss/*`.

### Требуют `integrations.dss`
- `/api/dss/autorization`
- `/api/dss/settings`
- `/api/dss/settings/update`
- `/api/dss/settings/create`
- `/api/dss/settings/delete`
- `/api/dss/keepalive`
- `/api/dss/update-token`
- `/api/dss/unauthorize`
- `/api/dss/dssdevices`
- `/api/dss/dssdevices/update`
- `/api/dss/add-person`

### Требуют `integrations.dss` или `history.view`
- `/api/dss/truck-zone-history`
- `/api/dss/current-truck-zone`

## Публичное исключение

- `/dss/dssalarmadd` и `/api/dss/dssalarmadd` остаются отдельным ingress endpoint для внешних уведомлений/alarms DSS и требуют отдельной схемы защиты (IP allowlist, secret, signature) на следующем этапе.