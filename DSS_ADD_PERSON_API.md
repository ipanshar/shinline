# DSS API - Добавление пользователя

## Описание
API для добавления нового пользователя (person) в систему DSS (Distributed Security System) через метод `/obms/api/v1.1/acs/person`.

## Установка

### 1. Миграция базы данных
Миграция уже применена. Она добавляет запись о новом API методе в таблицу `dss_apis`:

```sql
INSERT INTO dss_apis (api_name, method, request_url, dss_setings_id) 
VALUES ('AddPerson', 'POST', '/obms/api/v1.1/acs/person', 1);
```

### 2. Сервис DssService
Добавлен метод `dssAddPerson()` в файле `app/Services/DssService.php`

### 3. Контроллер DssController
Добавлен метод `dssAddPerson()` в файле `app/Http/Controllers/DssController.php`

### 4. Маршрут
Добавлен маршрут в `routes/api.php`:
```php
Route::post('/dss/add-person', [DssController::class, 'dssAddPerson'])->middleware('auth:sanctum');
```

## Использование API

### Endpoint
```
POST /api/dss/add-person
```

### Headers
```
Authorization: Bearer {your_sanctum_token}
Content-Type: application/json
Accept: application/json
```

### Тело запроса

#### Формат входных данных (ваш формат):
```json
{
  "firstName": "Сергей",
  "lastName": "Иванов",
  "gender": 1,
  "iin": "010405599456",
  "data": "1995-12-06",
  "foto": "BASE64_IMAGE_DATA"
}
```

#### Параметры:
| Параметр | Тип | Обязательный | Описание |
|----------|-----|--------------|----------|
| firstName | string | Да | Имя пользователя (макс. 255 символов) |
| lastName | string | Да | Фамилия пользователя (макс. 255 символов) |
| gender | integer | Да | Пол: 1 - мужской, 2 - женский |
| iin | string | Да | Номер паспорта/ИИН (макс. 50 символов) |
| data | string | Да | Дата рождения в формате Y-m-d (например: 1995-12-06) |
| foto | string/array | Да | Фото в формате BASE64 (может быть одна строка или массив строк) |

#### Формат данных, отправляемых в DSS:
```json
{
  "baseInfo": {
    "personId": "010405599456",
    "firstName": "Сергей",
    "lastName": "Иванов",
    "gender": "1",
    "orgCode": "001",
    "source": "0",
    "facePictures": ["BASE64_IMAGE_DATA"]
  },
  "extensionInfo": {
    "idType": "0",
    "idNo": "010405599456",
    "nationalityId": "9999"
  },
  "authenticationInfo": {
    "startTime": "820454400",
    "endTime": "2000000000"
  },
  "accessInfo": {
    "accessType": "0"
  },
  "faceComparisonInfo": {
    "enableFaceComparisonGroup": "1"
  },
  "entranceInfo": {}
}
```

### Ответы API

#### Успешный ответ (201):
```json
{
  "status": true,
  "message": "Пользователь успешно добавлен в DSS",
  "data": {
    // данные ответа от DSS API
  }
}
```

#### Ошибка валидации (422):
```json
{
  "status": false,
  "message": "Ошибка валидации данных",
  "errors": {
    "firstName": ["The first name field is required."],
    "gender": ["The gender field must be 1 or 2."]
  }
}
```

#### Ошибка DSS API (400):
```json
{
  "status": false,
  "message": "Ошибка при добавлении пользователя в DSS",
  "error": "Ошибка DSS API",
  "details": {
    "code": 7001,
    "message": "Invalid token"
  }
}
```

#### Внутренняя ошибка (500):
```json
{
  "status": false,
  "message": "Внутренняя ошибка сервера",
  "error": "Error message"
}
```

## Примеры использования

### cURL
```bash
curl -X POST http://your-domain.com/api/dss/add-person \
  -H "Authorization: Bearer YOUR_SANCTUM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Сергей",
    "lastName": "Иванов",
    "gender": 1,
    "iin": "010405599456",
    "data": "1995-12-06",
    "foto": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  }'
```

### JavaScript (Axios)
```javascript
import axios from 'axios';

const addPersonToDss = async () => {
  try {
    const response = await axios.post('/api/dss/add-person', {
      firstName: 'Сергей',
      lastName: 'Иванов',
      gender: 1,
      iin: '010405599456',
      data: '1995-12-06',
      foto: 'BASE64_IMAGE_DATA'
    }, {
      headers: {
        'Authorization': `Bearer ${yourToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Успешно:', response.data);
  } catch (error) {
    console.error('Ошибка:', error.response.data);
  }
};
```

### PHP
```php
$client = new \GuzzleHttp\Client();

$response = $client->post('http://your-domain.com/api/dss/add-person', [
    'headers' => [
        'Authorization' => 'Bearer ' . $yourToken,
        'Content-Type' => 'application/json',
    ],
    'json' => [
        'firstName' => 'Сергей',
        'lastName' => 'Иванов',
        'gender' => 1,
        'iin' => '010405599456',
        'data' => '1995-12-06',
        'foto' => 'BASE64_IMAGE_DATA'
    ]
]);

$result = json_decode($response->getBody(), true);
```

## Логирование

Все операции логируются в Laravel Log:
- Успешное добавление: `Log::info('Пользователь успешно добавлен в DSS')`
- Ошибки DSS: `Log::error('Ошибка добавления пользователя в DSS')`
- Исключения: `Log::error('Исключение при добавлении пользователя в DSS')`

## Примечания

1. **Автоматическая авторизация**: Если токен DSS не установлен или истек, метод автоматически выполняет авторизацию.

2. **Дата рождения**: Преобразуется в Unix timestamp для отправки в DSS.

3. **Несколько фотографий**: Параметр `foto` может быть массивом для добавления нескольких фотографий:
   ```json
   {
     "foto": ["BASE64_IMAGE_1", "BASE64_IMAGE_2", "BASE64_IMAGE_3"]
   }
   ```

4. **Код организации**: По умолчанию используется `"001"`. Можно настроить в коде сервиса.

5. **Национальность**: По умолчанию используется `"9999"`. Можно настроить в коде сервиса.

6. **Период действия**: 
   - `startTime` устанавливается как дата рождения (timestamp)
   - `endTime` устанавливается как `2000000000` (далекое будущее)

## Настройка

Если вам нужно изменить параметры по умолчанию, отредактируйте метод `dssAddPerson()` в файле `app/Services/DssService.php`:

```php
'orgCode' => '001', // Измените код организации
'nationalityId' => '9999', // Измените ID национальности
'endTime' => '2000000000' // Измените время окончания действия
```

## Требования

1. В таблице `dss_apis` должна быть запись с `api_name = 'AddPerson'`
2. DSS должен быть настроен и доступен (таблица `dss_setings`)
3. Пользователь должен быть авторизован через Laravel Sanctum
4. Фотография должна быть в формате BASE64

## Тестирование

Для проверки работы API используйте Postman или любой другой REST клиент с указанными выше примерами запросов.
