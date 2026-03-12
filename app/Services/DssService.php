<?php
// Этот файл содержит сервис для работы с DSS (Distributed Security System).
// Он включает методы для авторизации, поддержания сессии, обновления токена и выхода из системы.
// Сервис использует Guzzle для HTTP-запросов и взаимодействует с моделью DssSetings для получения настроек DSS.
//
// Методы:
// - firstLogin: Выполняет первый этап авторизации, получая realm и randomKey.
// - secondLogin: Выполняет второй этап авторизации, получая токен.
// - dssAutorize: Выполняет полную авторизацию в DSS, обновляя токен и время начала сессии.
// - dssKeepAlive: Поддерживает сессию активной, отправляя запрос keepalive.
// - dssUpdateToken: Обновляет токен, если он не установлен или превышено количество обновлений.
// - dssUnauthorize: Выходит из системы DSS, удаляя токен и сбрасывая время начала сессии.
//
// Этот сервис используется в контроллере DssController для обработки запросов, связанных с DSS.
namespace App\Services;

use App\Http\Controllers\TelegramController;
use App\Models\Checkpoint;
use App\Models\Devaice;
use App\Models\DssApi;
use App\Models\DssSetings;
use App\Models\EntryPermit;
use App\Models\Status;
use App\Models\Task;
use App\Models\Truck;
use App\Models\TruckBrand;
use App\Models\TruckCategory;
use App\Models\TruckModel;
use App\Models\VehicleCapture;
use App\Models\Yard;
use App\Models\Zone;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class DssService
{
    protected $client;
    protected $dssSettings;
    protected $baseUrl;
    protected $token;
    protected $dssApi;
    protected $credential;
    protected $subhour;

    public function __construct()
    {
        $this->dssSettings = DssSetings::first();
        $this->baseUrl = $this->dssSettings?->base_url;
        $this->token = $this->dssSettings?->token;
        $this->credential = $this->dssSettings?->credential;
        $this->subhour = $this->dssSettings?->subhour;
        $this->client = new Client();
    }

    private function ensureSettings(array $requiredFields = []): ?array
    {
        if (!$this->dssSettings) {
            return ['error' => 'DSS settings not found'];
        }

        foreach ($requiredFields as $field) {
            if (blank($this->dssSettings->{$field})) {
                return ['error' => "DSS setting '{$field}' is not configured"];
            }
        }

        return null;
    }

    private function getApiDefinition(string $apiName): ?DssApi
    {
        if (!$this->dssSettings) {
            return null;
        }

        return DssApi::where('api_name', $apiName)
            ->where('dss_setings_id', $this->dssSettings->id)
            ->first();
    }

    // Первый этап авторизации
    // Получаем realm и randomKey
    public function firstLogin($username)
    {
        if ($error = $this->ensureSettings(['base_url'])) {
            return $error;
        }

        $this->dssApi = $this->getApiDefinition('Authorize');
        if (!$this->dssApi) {
            return ['error' => 'DSS API method Authorize not found'];
        }

        try {
            $response = $this->client->post($this->baseUrl . $this->dssApi->request_url, [
                'json' => [
                    'userName' => $username,
                    'ipAddress' => '',
                    'clientType' => 'WINPC_V2'
                ]
            ]);

            return json_decode($response->getBody(), true);
        } catch (RequestException $e) {
            if ($e->hasResponse()) {
                return  json_decode($e->getResponse()->getBody(), true);
            } else {
                return  ['error' => $e->getMessage()];
            }
        }
    }
    // Второй этап авторизации
    // Получаем токен
    public function secondLogin($username, $password, $realm, $randomKey)
    {
        $temp1 = md5($password);
        $temp2 = md5($username . $temp1);
        $temp3 = md5($temp2);
        $temp4 = md5($username . ":" . $realm . ":" . $temp3);
        $signature = md5($temp4 . ":" . $randomKey);
        $response = null;
        try {
            $response = $this->client->post($this->baseUrl . $this->dssApi->request_url, [
                'json' => [
                    'userName' => $username,
                    'signature' => $signature,
                    'randomKey' => $randomKey,
                    'encryptType' => 'MD5',
                    'clientType' => 'WINPC_V2'
                ]
            ]);
            return json_decode($response->getBody(), true);
        } catch (RequestException $m) {
            if ($m->hasResponse()) {
                return  json_decode($m->getResponse()->getBody(), true);
            } else {
                return  ['error' => $m->getMessage(), 'data' => $m];
            }
        }
    }

    // Авторизация в DSS
    public function dssAutorize()
    {
        if ($error = $this->ensureSettings(['base_url', 'user_name', 'password'])) {
            return $error;
        }

        $firstLogin = $this->firstLogin($this->dssSettings->user_name);
        if (isset($firstLogin['error'])) {
            return ['error' => $firstLogin['error']];
        }

        $secondLogin = $this->secondLogin(
            $this->dssSettings->user_name,
            $this->dssSettings->password,
            $firstLogin['realm'],
            $firstLogin['randomKey']
        );

        if (!isset($secondLogin['error']) && isset($secondLogin['token'])) {
            $this->dssSettings->token = $secondLogin['token'];
            $this->dssSettings->credential = $secondLogin['credential'] ?? null; // Обновляем учетные данные, если они есть
            $this->dssSettings->begin_session = now(); // Устанавливаем время начала сессии
            $this->dssSettings->update_token = null; // Сбрасываем время обновления токена
            $this->dssSettings->update_token_count = 0; // Сбрасываем счетчик обновлений токена  
            $this->dssSettings->save();
            $this->token = $secondLogin['token']; // Обновляем токен в сервисе
            $this->credential = $secondLogin['credential']; // Обновляем учетные данные в сервисе
            return ['success' => true, 'token' => $this->token];
        } else {
            return ['error' => 'Ошибка: токен не установлен', 'firstLogin' => $firstLogin, 'secondLogin' => $secondLogin];
        }
        return $secondLogin;
    }
    // Обновление сессии
    // Поддержание сессии активной
    public function dssKeepAlive()
    {
        if ($error = $this->ensureSettings(['base_url'])) {
            return $error;
        }

        if (!$this->dssSettings->token) {
            $authResult = $this->dssAutorize();
            if (isset($authResult['error'])) {
                return $authResult;
            }
        }

        $dssApi = $this->getApiDefinition('KeepAlive');
        if (!$dssApi) {
            return ['error' => 'DSS API method KeepAlive not found'];
        }

        // Отправка запроса
        $response = null;
        try {
            $response = $this->client->put($this->baseUrl . $dssApi->request_url, [
                'headers' => [
                    'X-Subject-Token' =>  $this->token,
                    'Content-Type' => 'application/json',
                    'Charset' => 'utf-8'
                ],
                'json' => [
                    'token' => $this->dssSettings->token,
                ]
            ]);
        } catch (RequestException $e) {
            $authResult = $this->dssAutorize();
            if (isset($authResult['error'])) {
                return $authResult;
            }

            $response = $this->client->put($this->baseUrl . $dssApi->request_url, [
                'headers' => [
                    'X-Subject-Token' =>  $this->token,
                    'Content-Type' => 'application/json',
                    'Charset' => 'utf-8'
                ],
                'json' => [
                    'token' => $this->dssSettings->token,
                ]
            ]);
        }

        // Проверяем успешность ответа
        if ($response->getStatusCode() == 200 && $response->getBody()) {
            $responseData = json_decode($response->getBody(), true);

            // Проверяем код ответа
            if (isset($responseData['code']) && $responseData['code'] === 1000) {
                if (isset($responseData['data']['token'])) {
                    $token = $responseData['data']['token'];
                    $this->dssSettings->keepalive = now(); // Устанавливаем время последнего keepalive
                    $this->dssSettings->save();
                    return ['success' => true, 'live_token' => $token];
                } else {
                    return ['error' => 'Токен отсутствует в ответе!'];
                }
            } else {
                if ($responseData['code'] === 7000) {
                    $this->dssSettings->token = null;
                    $this->dssSettings->begin_session = null;
                    $this->dssSettings->save();
                }
                return ['error' => 'Неверный код ответа: ' . $responseData['code'], 'data' => $responseData];
            }
        } else {
            return ['error' => 'Ошибка запроса: ' . $response->getStatusCode()];
        }
    }

    // Обновление токена
    public function dssUpdateToken()
    {
        if ($error = $this->ensureSettings(['base_url'])) {
            return $error;
        }

        if (!$this->dssSettings->token || $this->dssSettings->update_token_count > 4) {
            return $this->dssAutorize();
        } else {
            $dssApi = $this->getApiDefinition('UpdateToken');
            if (!$dssApi) {
                return ['error' => 'DSS API method UpdateToken not found'];
            }

            // Отправка запроса
            $response = $this->client->post($this->baseUrl . $dssApi->request_url, [
                'headers' => [
                    'X-Subject-Token' =>  $this->token,
                    'Content-Type' => 'application/json',
                    'Charset' => 'utf-8'
                ],
                'json' => [
                    'token' => $this->token,
                ]
            ]);

            // Проверяем успешность ответа
            if ($response->getStatusCode() == 200 && $response->getBody()) {
                $responseData = json_decode($response->getBody(), true);

                // Проверяем код ответа
                if (isset($responseData['code']) && $responseData['code'] === 1000) {
                    // Извлекаем новый токен
                    if (isset($responseData['data']['token'])) {
                        $newToken = $responseData['data']['token'];
                        // Обновляем токен в настройках DSS
                        $this->dssSettings->token = $newToken;
                        $this->dssSettings->credential = $responseData['data']['credential'] ?? $this->dssSettings->credential; // Обновляем учетные данные, если они есть
                        $this->dssSettings->update_token = now(); // Устанавливаем время обновления токена
                        $this->dssSettings->update_token_count += 1; // Увеличиваем счетчик обновлений токена
                        $this->dssSettings->save();
                        return ['success' => true, 'new_token' => $newToken];
                    } else {
                        return ['error' => 'Токен отсутствует в ответе!'];
                    }
                } else {
                    $this->dssSettings->token = null; // Сбрасываем токен в настройках DSS
                    $this->dssSettings->begin_session = null; // Сбрасываем время начала сессии
                    $this->dssSettings->update_token = null; // Сбрасываем время обновления токена
                    $this->dssSettings->update_token_count = 0; // Сбрасываем счетчик обновлений токена
                    $this->dssSettings->save();
                    return ['error' => 'Неверный код ответа: ' . $responseData['code']];
                }
            } else {
                return ['error' => 'Ошибка запроса: ' . $response->getStatusCode()];
            }
        }
    }

    public function dssVehicleCapture()
    {
        if ($error = $this->ensureSettings(['base_url'])) {
            return $error;
        }

        if (!$this->dssSettings->token) {
            $authResult = $this->dssAutorize();
            if (isset($authResult['error'])) {
                return $authResult;
            }
        }

        $dssApi = $this->getApiDefinition('VehicleCapture');
        if (!$dssApi) {
            return ['error' => 'DSS API method VehicleCapture not found'];
        }

        $currentTimestamp = time();
        // Отправка запроса
        $response = $this->client->post($this->baseUrl . $dssApi->request_url, [
            'headers' => [
                'X-Subject-Token' =>  $this->token,
                'Content-Type' => 'application/json',
                'Charset' => 'utf-8'
            ],
            'json' => [
                'plateNoMatchMode' => 1, // 1 - точное совпадение, 0 - частичное совпадение
                'startTime' => $currentTimestamp - 4, // 4 секунды назад
                'endTime' => $currentTimestamp, // Текущее время
                'page' => 1,
                'currentPage' => 1,
                'pageSize' => 200,
                'orderDirection' => 'asc',
            ]
        ]);

        // Проверяем успешность ответа
        if ($response->getStatusCode() == 200 && $response->getBody()) {
            $responseData = json_decode($response->getBody(), true);

            // Проверяем код ответа
            if (isset($responseData['code']) && $responseData['code'] === 1000) {
                $pageData = $responseData['data']['pageData'] ?? [];
                if (empty($pageData)) {
                    return ['error' => 'Нет данных для отображения', 'data' => $responseData];
                }
                foreach ($pageData as $item) {
                    if (empty($item['channelId']) || empty($item['plateNo']) || strlen($item['plateNo']) < 4) {
                        continue; // Пропускаем запись, если отсутствует channelId или plateNo или plateNo короче 4 символов
                    }
                    // Проверяем, существует ли устройство с таким channelId
                    $device = Devaice::where('channelId', $item['channelId'])->first();
                    if (!$device) {
                        // Если устройство не найдено, создаем новое
                        Devaice::create([
                            'channelId' => $item['channelId'],
                            'channelName' => $item['channelName']
                        ]);
                    }
                    // Если устройство найдено, обновляем его имя
                    else {
                        $device->channelName = $item['channelName'];
                        $device->save();
                    }
                    $truck_brand_id = TruckBrand::where('name', $item['vehicleBrandName'])->first()->id ?? null;
                    if (!$truck_brand_id) {
                        $truck_brand_id = TruckBrand::create([
                            'name' => $item['vehicleBrandName']
                        ])->id;
                    }
                    $truck_category = TruckCategory::where('name', $item['vehicleModelName'])->first() ?? null;
                    if (!$truck_category) {
                        $truck_category = TruckCategory::create([
                            'name' => $item['vehicleModelName'],
                            'ru_name' => $item['vehicleModelName']
                        ]);
                    }
                    $truck_model = TruckModel::where('name', $truck_category->ru_name)->first() ?? null;
                    if (!$truck_model) {
                        $truck_model = TruckModel::create([
                            'name' => $truck_category->ru_name,
                            'truck_brand_id' => $truck_brand_id,
                            'truck_category_id' => $truck_category->id
                        ]);
                    }

                    // Ищем грузовик по точному номеру
                    $truk = Truck::where('plate_number', $item['plateNo'])->first();

                    // Получаем уверенность распознавания (если передаётся от DSS)
                    $confidence = $item['confidence'] ?? $item['plateScore'] ?? null;

                    // Если грузовик не найден в базе и уверенность низкая (или неизвестна)
                    // НЕ создаём грузовик автоматически - это решит оператор
                    $truckWasFound = $truk !== null;

                    if (!$truk) {
                        // Пробуем найти похожий номер (нормализованный поиск)
                        $normalizedPlate = strtolower(str_replace([' ', '-'], '', $item['plateNo']));
                        $truk = Truck::whereRaw("REPLACE(LOWER(plate_number), ' ', '') = ?", [$normalizedPlate])->first();

                        // ВАЖНО: НЕ создаём грузовик автоматически!
                        // Камеры DSS часто ошибаются, создавая мусор в таблице trucks.
                        // Грузовик создаётся только оператором через подтверждение посетителя.
                        // Если confidence неизвестен (null) или < 95% - грузовик не создаётся.
                        // Номер попадёт в "Ожидают подтверждения" и оператор сам решит.
                        // Исключение: очень высокая уверенность (>=95%) И номер найден через разрешение.
                        if (!$truk && $confidence !== null && $confidence >= 95) {
                            // Даже при высокой уверенности - проверяем есть ли разрешение на въезд
                            // Если нет - не создаём грузовик
                            $hasPermitForPlate = EntryPermit::whereHas('truck', function ($q) use ($normalizedPlate) {
                                $q->whereRaw("REPLACE(LOWER(plate_number), ' ', '') = ?", [$normalizedPlate]);
                            })
                            // Только активные и не просроченные разрешения
                            ->where('status_id', Status::where('key', 'active')->first()->id ?? 0)
                            ->where(function ($q) {
                                $q->whereNull('end_date')
                                  ->orWhere('end_date', '>=', now()->startOfDay());
                            })
                            ->exists();

                            if (!$hasPermitForPlate) {
                                // Грузовик НЕ создаём - пусть оператор решит
                                Log::info("DSS: Номер {$item['plateNo']} не найден в базе, confidence={$confidence}. Не создаём грузовик - ждём подтверждения оператора.");
                            }
                        }
                    } else {
                        // Если грузовик найден, обновляем его данные
                        $truk->color = $item['vehicleColorName'] ?? null;
                        $truk->truck_brand_id = $truck_brand_id;
                        $truk->truck_model_id = $truck_model->id ?? null;
                        $truk->truck_category_id = $truck_category->id ?? null;
                        $truk->save();
                    }
                    $Vehicle = VehicleCapture::updateOrCreate(
                        ['devaice_id' => $device->id, 'captureTime' => $item['captureTime'], 'plateNo' => $item['plateNo']],
                        [
                            'devaice_id' => $device->id,
                            'truck_id' =>   $truk->id ?? null,
                            'plateNo' => $item['plateNo'],
                            'capturePicture' => $item['capturePicture'] ?? null,
                            'plateNoPicture' => $item['plateNoPicture'] ?? null,
                            'vehicleBrandName' => $item['vehicleBrandName'] ?? null,
                            'captureTime' => $item['captureTime'],
                            'vehicleColorName' => $item['vehicleColorName'] ?? null,
                            'vehicleModelName' => $item['vehicleModelName'] ?? null
                        ]
                    );
                    if ($Vehicle->imageDownload == 0) {
                        $capturePicture = $Vehicle->capturePicture . '?token=' . $this->dssSettings->credential;
                        //Log::info('Capture picture URL: ' . $capturePicture);
                        $ResponseCapturePicture = Http::withoutVerifying()->get($capturePicture);
                        if ($ResponseCapturePicture->successful()) {
                            $imageData = $ResponseCapturePicture->body();
                            $fileName = $Vehicle->id . '.jpg';
                            Storage::disk('public')->put("images/vehicle/capture/{$fileName}", $imageData);
                            $Vehicle->local_capturePicture = "images/vehicle/capture/{$fileName}";
                            $Vehicle->imageDownload = 1; // Устанавливаем флаг, что изображение загружено
                            $Vehicle->save();
                        }
                    }
                    // Передаём данные для системы подтверждения
                    $captureDataWithConfidence = array_merge($item, [
                        'confidence' => $confidence,
                        'truck_was_found' => $truckWasFound,
                    ]);

                    // Автоматическая фиксация зоны и создание посетителя
                    $this->recordZoneEntry($device, $truk, $captureDataWithConfidence);
                }
                return ['success' => true];
            } else {
                return ['error' => 'Неверный код ответа: ' . $responseData['code'], 'data' => $responseData];
            }
        } else {
            return ['error' => 'Ошибка запроса: ' . $response->getStatusCode()];
        }
    }
    /**
     * Проверяет и записывает входы грузовиков в зоны на основе захватов устройств.
     * Если кпп находится в зоне устройства, фиксируется вход грузовика в эту зону.
     */
    private function recordZoneEntry($device, $truck, $captureData)
    {
        // Проверяем что у устройства есть зона
        if (!$device->zone_id) {
            return;
        }
        // Получаем зону и разрешение на въезд для грузовика в эту зону
        $zone = Zone::find($device->zone_id);
        $activeStatus = Status::where('key', 'active')->first();
        $permit = $truck ? EntryPermit::where('truck_id', $truck->id)
            ->where('yard_id', $zone->yard_id)
            ->where('status_id', '=', $activeStatus->id)
            // Проверяем что разрешение не просрочено
            ->where(function ($q) {
                $q->whereNull('end_date')
                  ->orWhere('end_date', '>=', now()->startOfDay());
            })
            ->first() : null;

        // Получаем задание, связанное с разрешением    
        $task = $permit ? Task::find($permit->task_id) : null;

        $captureTime = \Carbon\Carbon::createFromTimestamp($captureData['captureTime'])->setTimezone(config('app.timezone'));

        // Записываем историю зон только если грузовик известен
        if ($truck) {
            $tr = \App\Models\TruckZoneHistory::updateOrCreate(
                ['truck_id' => $truck->id, 'zone_id' => $device->zone_id, 'entry_time' => $captureTime],
                [
                    'truck_id' => $truck->id,
                    'device_id' => $device->id,
                    'zone_id' => $device->zone_id,
                    'task_id' => $task->id ?? null,
                    'entry_time' => $captureTime,
                ]
            );
            $tr->save();
        }

        // Если у устройства есть привязанный КПП, создаем или обновляем запись о посетителе
        if ($device->checkpoint_id > 0) {
            $this->CreateOrUpdateVisitor($device, $truck, $zone, $permit, $task, $captureTime, $captureData);
        }
    }

    /**
     * Создаёт или обновляет запись о посетителе с системой подтверждения
     */
    private function CreateOrUpdateVisitor($device, $truck, $zone, $permit = null, $task = null, $captureTime = null, $captureData = [])
    {
        $PermitText = $permit ? ($permit->one_permission ? 'Одноразовое' : 'Многоразовое') : 'Нет разрешения';
        $statusRow = Status::where('key', 'on_territory')->first();

        // Получаем данные о распознавании
        $plateNo = $captureData['plateNo'] ?? ($truck ? $truck->plate_number : 'UNKNOWN');
        $confidence = $captureData['confidence'] ?? null;
        $truckWasFound = $captureData['truck_was_found'] ?? ($truck !== null);

        // Получаем информацию о дворе (строгий режим)
        $yard = Yard::find($zone->yard_id);
        $isStrictMode = $yard && $yard->strict_mode;

        if ($device->type == 'Exit') {
            // Выезд - ищем посетителя по truck_id (если есть) или по plate_number
            $visitorQuery = \App\Models\Visitor::query()
                ->where('yard_id', $zone->yard_id)
                ->whereNull('exit_device_id')
                ->whereNull('exit_date')
                ->where('confirmation_status', \App\Models\Visitor::CONFIRMATION_CONFIRMED);

            if ($truck) {
                $visitorQuery->where('truck_id', $truck->id);
            } else {
                $visitorQuery->where('plate_number', $plateNo);
            }

            $visitor = $visitorQuery->orderBy('id', 'desc')->first();

            if ($visitor) {
                $this->closeVisitorExit($visitor, $device, $captureTime);
            }
        } elseif ($device->type == 'Entry') {
            // Въезд - система подтверждения
            // Логика автоподтверждения:
            // - Строгий режим: ТС должно быть в базе И иметь разрешение
            // - Нестрогий режим: достаточно найти ТС в базе

            if ($isStrictMode) {
                // Строгий режим: ТС + разрешение
                $autoConfirm = $truckWasFound && $permit;
            } else {
                // Нестрогий режим: достаточно ТС
                $autoConfirm = $truckWasFound;
            }

            // Проверяем, нет ли уже посетителя на территории
            $existingVisitor = $truck ? \App\Models\Visitor::where('yard_id', $zone->yard_id)
                ->where('truck_id', $truck->id)
                ->whereNull('exit_date')
                ->where('confirmation_status', \App\Models\Visitor::CONFIRMATION_CONFIRMED)
                ->first() : null;

            if ($existingVisitor) {
                // Грузовик уже числится на территории
                // Проверяем, сколько времени прошло с момента въезда
                $entryTime = $existingVisitor->entry_date;
                $currentTime = $captureTime ?? now();
                $minutesSinceEntry = $entryTime->diffInMinutes($currentTime);
                
                // Минимальный интервал для считания повторного въезда реальным (в минутах)
                // Если прошло меньше этого времени - это просто повторная фиксация камерой
                $minIntervalMinutes = 10;
                
                if ($minutesSinceEntry < $minIntervalMinutes) {
                    // Это повторная фиксация камерой в течение короткого времени
                    // Просто игнорируем - ТС всё ещё на территории
                    Log::debug('DSS: Повторная фиксация ТС камерой (игнорируем)', [
                        'plate_number' => $plateNo,
                        'truck_id' => $truck->id,
                        'minutes_since_entry' => $minutesSinceEntry,
                        'min_interval' => $minIntervalMinutes,
                    ]);
                    return;
                }
                
                // Прошло достаточно времени - это реальный повторный въезд
                // Камера выезда "промахнулась" и не зафиксировала выезд
                
                Log::warning('DSS: Повторный въезд ТС - выезд не был зафиксирован камерой', [
                    'plate_number' => $plateNo,
                    'truck_id' => $truck->id,
                    'yard_id' => $zone->yard_id,
                    'previous_entry_date' => $existingVisitor->entry_date,
                    'new_entry_time' => $captureTime,
                    'minutes_since_entry' => $minutesSinceEntry,
                    'device_id' => $device->id,
                    'device_name' => $device->channelName ?? 'Unknown',
                ]);

                // Автоматически закрываем предыдущий визит (пропущенный выезд)
                $this->closeVisitorExit($existingVisitor, null, $captureTime, true);

                // Отправляем уведомление о проблеме
                $checkpoint = Checkpoint::find($device->checkpoint_id);
                $notificationText = "<b>⚠️ Пропущенный выезд ТС</b>\n\n" .
                    "<b>🏷️ ТС:</b> " . e($plateNo) . "\n" .
                    "<b>🏢 Двор:</b> " . e($yard->name ?? 'Неизвестный') . "\n" .
                    "<b>📍 КПП въезда:</b> " . e($checkpoint->name ?? 'Неизвестный') . "\n" .
                    "<b>⏰ Предыдущий въезд:</b> " . $existingVisitor->entry_date->format('d.m.Y H:i') . "\n" .
                    "<b>⏰ Новый въезд:</b> " . ($captureTime ? $captureTime->format('d.m.Y H:i') : now()->format('d.m.Y H:i')) . "\n" .
                    "<b>⏱️ Прошло времени:</b> " . $minutesSinceEntry . " мин.\n\n" .
                    "<i>Камера выезда не зафиксировала выезд. Предыдущий визит автоматически закрыт.</i>";
                
                try {
                    (new TelegramController())->sendNotification($notificationText);
                } catch (\Exception $e) {
                    Log::error('DSS: Ошибка отправки уведомления о пропущенном выезде', ['error' => $e->getMessage()]);
                }
            }

            // Создаём запись о посетителе
            $visitor = \App\Models\Visitor::create([
                'yard_id' => $zone->yard_id,
                'truck_id' => $truck?->id,
                'plate_number' => $plateNo,
                'original_plate_number' => $plateNo,
                'task_id' => $task?->id,
                'entrance_device_id' => $device->id,
                'entry_permit_id' => $permit?->id,
                'entry_date' => $captureTime ?? now(),
                'status_id' => $statusRow->id,
                'confirmation_status' => $autoConfirm
                    ? \App\Models\Visitor::CONFIRMATION_CONFIRMED
                    : \App\Models\Visitor::CONFIRMATION_PENDING,
                'confirmed_at' => $autoConfirm ? now() : null,
                'recognition_confidence' => $confidence,
                'truck_category_id' => $truck?->truck_category_id,
                'truck_brand_id' => $truck?->truck_brand_id,
            ]);

            // Если автоподтверждение - отправляем уведомление о въезде
            if ($autoConfirm) {
                // Обновляем задачу если есть
                if ($task) {
                    $task->status_id = $statusRow->id;
                    $task->begin_date = now();
                    $task->yard_id = $zone->yard_id;
                    $task->save();
                }

                $warehouse = $task ? DB::table('task_loadings')
                    ->leftJoin('warehouses', 'task_loadings.warehouse_id', '=', 'warehouses.id')
                    ->where('task_loadings.task_id', $task->id)
                    ->where('warehouses.yard_id', $zone->yard_id)
                    ->select('warehouses.name as name')
                    ->get() : collect();

                // Формируем текст уведомления в зависимости от наличия задачи
                $notificationText = '<b>🚛 Въезд на территорию ' . e($yard->name ?? 'Неизвестный двор') . "</b>\n\n" .
                    '<b>🏷️ ТС:</b> ' . e($truck->plate_number) . "\n";

                // if ($task) {
                //     $notificationText .= '<b>📦 Задание:</b> ' . e($task->name) . "\n" .
                //         '<b>📝 Описание:</b> ' . e($task->description) . "\n" .
                //         '<b>👤 Водитель:</b> ' . ($task->user_id 
                //             ? e(DB::table('users')->where('id', $task->user_id)->value('name')) .
                //               ' (' . e(DB::table('users')->where('id', $task->user_id)->value('phone')) . ')' 
                //             : 'Не указан') . "\n" .
                //         '<b>✍️ Автор:</b> ' . e($task->avtor) . "\n" .
                //         '<b>🏬 Склады:</b> ' . e($warehouse->pluck('name')->implode(', ')) . "\n";
                // } else {
                //     $notificationText .= '<b>📦 Задание:</b> <i>Без задания</i>' . "\n";
                // }

                // $notificationText .= '<b>🛂 Разрешение:</b> <i>' . e($PermitText) . '</i>' . "\n" .
                //     '<b>🔒 Режим двора:</b> ' . ($isStrictMode ? '🔴 Строгий' : '🟢 Свободный') . "\n" .
                //     '<b>📍 КПП:</b> ' . e(Checkpoint::where('id', $device->checkpoint_id)->value('name')) . ' - ' . $device->channelName;
                // (new TelegramController())->sendNotification($notificationText);

                // Если есть задача - добавляем её детали в уведомление
                if ($task) {
                    $notificationText .= '<b>📦 Задание:</b> ' . e($task->name) . "\n" .
                        '<b>📝 Описание:</b> ' . e($task->description) . "\n" .
                        '<b>👤 Водитель:</b> ' . ($task->user_id
                            ? e(DB::table('users')->where('id', $task->user_id)->value('name')) .
                            ' (' . e(DB::table('users')->where('id', $task->user_id)->value('phone')) . ')'
                            : 'Не указан') . "\n" .
                        '<b>✍️ Автор:</b> ' . e($task->avtor) . "\n" .
                        '<b>🏬 Склады:</b> ' . e($warehouse->pluck('name')->implode(', ')) . "\n".
                        '<b>🛂 Разрешение:</b> <i>' . e($PermitText) . '</i>' . "\n" .
                        '<b>🔒 Режим двора:</b> ' . ($isStrictMode ? '🔴 Строгий' : '🟢 Свободный') . "\n" .
                        '<b>📍 КПП:</b> ' . e(Checkpoint::where('id', $device->checkpoint_id)->value('name')) . ' - ' . $device->channelName;
                    (new TelegramController())->sendNotification($notificationText);
                }
                
            } else {
                // Определяем причину ожидания подтверждения
                $reason = 'Требуется проверка';
                if (!$truckWasFound) {
                    $reason = '🚫 ТС не найдено в базе';
                } elseif ($isStrictMode && !$permit) {
                    $reason = '🔒 Нет разрешения (строгий режим)';
                }

                // Отправляем уведомление о необходимости подтверждения
                (new TelegramController())->sendNotification(
                    '<b>⚠️ Требуется подтверждение въезда</b>' . "\n\n" .
                        '<b>🏷️ Распознанный номер:</b> ' . e($plateNo) . "\n" .
                        '<b>📍 КПП:</b> ' . e(Checkpoint::where('id', $device->checkpoint_id)->value('name')) . ' - ' . $device->channelName . "\n" .
                        '<b>🏢 Двор:</b> ' . e($yard->name ?? 'Неизвестный') . "\n" .
                        '<b>🔒 Режим двора:</b> ' . ($isStrictMode ? '🔴 Строгий' : '🟢 Свободный') . "\n" .
                        ($confidence !== null ? '<b>🎯 Уверенность:</b> ' . $confidence . "%\n" : '') .
                        '<b>❓ Причина:</b> ' . $reason . "\n\n" .
                        '<i>Оператору КПП необходимо подтвердить или отклонить въезд</i>',
                );
            }
        }
    }

    // Удаляем записи о захватах транспортных средств старше 90 дней
    public function deleteOldVehicleCaptures()
    {
        $threshold = now()->subDays(90); // Устанавливаем порог в 90 дней
        $oldCaptures = VehicleCapture::where('captureTime', '<', $threshold->timestamp)->get();
        foreach ($oldCaptures as $capture) {
            // Удаляем изображение из хранилища, если оно существует
            if ($capture->local_capturePicture && Storage::disk('public')->exists($capture->local_capturePicture)) {
                Storage::disk('public')->delete($capture->local_capturePicture);
            }
            // Удаляем запись из базы данных
            $capture->delete();
        }
        return ['success' => true, 'deleted_count' => $oldCaptures->count()];
    }

    /**
     * Добавление нового пользователя в DSS через API /obms/api/v1.1/acs/person
     * 
     * @param array $personData - данные пользователя:
     *   - firstName: имя (обязательно)
     *   - lastName: фамилия (обязательно)
     *   - gender: пол (1 - мужской, 2 - женский)
     *   - iin: номер паспорта/ИИН (обязательно)
     *   - data: дата рождения в формате Y-m-d (например, 1995-12-06)
     *   - foto: фото в формате BASE64 (обязательно)
     * 
     * @return array - результат выполнения запроса
     */
    public function dssAddPerson(array $personData)
    {
        try {
            if ($error = $this->ensureSettings(['base_url'])) {
                return $error;
            }

            // Проверка токена
            if (!$this->token) {
                $authResult = $this->dssAutorize();
                if (isset($authResult['error'])) {
                    return ['error' => 'Ошибка авторизации: ' . $authResult['error']];
                }
            }

            // Валидация входных данных
            $requiredFields = ['firstName', 'lastName', 'gender', 'iin', 'data', 'foto'];
            foreach ($requiredFields as $field) {
                if (!isset($personData[$field]) || empty($personData[$field])) {
                    return ['error' => "Отсутствует обязательное поле: {$field}"];
                }
            }

            // Получаем API-метод из базы данных
            $dssApi = $this->getApiDefinition('AddPerson');

            if (!$dssApi) {
                return ['error' => 'API метод AddPerson не найден в базе данных. Необходимо добавить запись в таблицу dss_apis.'];
            }

            // Конвертируем дату рождения в timestamp
            $birthDate = strtotime($personData['data']);
            if ($birthDate === false) {
                return ['error' => 'Некорректный формат даты рождения. Используйте формат Y-m-d (например, 1995-12-06)'];
            }

            // Формируем массив фотографий (может быть несколько)
            $facePictures = is_array($personData['foto']) ? $personData['foto'] : [$personData['foto']];

            // Преобразуем gender: приходит 1 или 2, отправляем "1" или "2"
            $gender = (string)$personData['gender'];

            // Формируем тело запроса согласно документации DSS
            $requestBody = [
                'baseInfo' => [
                    'personId' => $personData['iin'], // Используем ИИН как personId
                    'firstName' => $personData['firstName'],
                    'lastName' => $personData['lastName'],
                    'gender' => $gender, // "1" - мужской, "2" - женский
                    'orgCode' => '001', // Код организации (можно сделать настраиваемым)
                    'source' => '0', // Источник данных
                    'facePictures' => $facePictures // Массив фотографий в BASE64
                ],
                'extensionInfo' => [
                    'idType' => '0', // Тип документа
                    'idNo' => $personData['iin'], // Номер документа (паспорт/ИИН)
                    'nationalityId' => '9999' // ID национальности (можно сделать настраиваемым)
                ],
                'authenticationInfo' => [
                    'startTime' => (string)$birthDate, // Время начала действия (дата рождения)
                    'endTime' => '2000000000' // Время окончания действия (далекое будущее)
                ],
                'accessInfo' => [
                    'accessType' => '0' // Тип доступа
                ],
                'faceComparisonInfo' => [
                    'enableFaceComparisonGroup' => '1' // Включить сравнение лиц
                ],
                'entranceInfo' => [
                    'parkingSpaceQuotas' => [], // Квоты парковочных мест (пустой массив)
                    'vehicles' => [] // Список транспортных средств (пустой массив)
                ]
            ];

            // Отправка запроса
            $response = $this->client->post($this->baseUrl . $dssApi->request_url, [
                'headers' => [
                    'X-Subject-Token' => $this->token,
                    'Content-Type' => 'application/json',
                    'Charset' => 'utf-8'
                ],
                'json' => $requestBody
            ]);

            // Проверяем успешность ответа
            if ($response->getStatusCode() == 200 && $response->getBody()) {
                $responseData = json_decode($response->getBody(), true);

                // Проверяем код ответа DSS
                if (isset($responseData['code']) && $responseData['code'] === 1000) {
                    Log::info('Пользователь успешно добавлен в DSS', [
                        'personId' => $personData['iin'],
                        'firstName' => $personData['firstName'],
                        'lastName' => $personData['lastName']
                    ]);

                    return [
                        'success' => true,
                        'message' => 'Пользователь успешно добавлен в DSS',
                        'data' => $responseData['data'] ?? null
                    ];
                } else {
                    Log::error('Ошибка добавления пользователя в DSS', [
                        'code' => $responseData['code'] ?? 'unknown',
                        'message' => $responseData['message'] ?? 'unknown',
                        'response' => $responseData
                    ]);

                    return [
                        'error' => 'Ошибка DSS API',
                        'code' => $responseData['code'] ?? 'unknown',
                        'message' => $responseData['message'] ?? 'Неизвестная ошибка',
                        'data' => $responseData
                    ];
                }
            } else {
                return ['error' => 'Ошибка HTTP запроса: ' . $response->getStatusCode()];
            }
        } catch (RequestException $e) {
            Log::error('Исключение при добавлении пользователя в DSS', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);

            if ($e->hasResponse()) {
                $errorBody = json_decode($e->getResponse()->getBody(), true);
                return [
                    'error' => 'Ошибка запроса к DSS',
                    'message' => $e->getMessage(),
                    'response' => $errorBody
                ];
            }

            return ['error' => 'Ошибка соединения с DSS: ' . $e->getMessage()];
        } catch (\Exception $e) {
            Log::error('Общая ошибка при добавлении пользователя в DSS', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);

            return ['error' => 'Внутренняя ошибка: ' . $e->getMessage()];
        }
    }

    // Выход из системы DSS
    public function dssUnauthorize()
    {
        if ($error = $this->ensureSettings(['base_url'])) {
            return $error;
        }

        if (!$this->dssSettings->token) {
            return ['error' => 'Токен не установлен!'];
        }

        $dssApi = $this->getApiDefinition('Unauthorize');
        if (!$dssApi) {
            return ['error' => 'DSS API method Unauthorize not found'];
        }

        // Отправка запроса
        $response = $this->client->post($this->baseUrl . $dssApi->request_url, [
            'headers' => [
                'X-Subject-Token' =>  $this->token,
                'Content-Type' => 'application/json',
                'Charset' => 'utf-8'
            ],
            'json' => [
                'token' => $this->token,
            ]
        ]);

        // Проверяем успешность ответа
        if ($response->getStatusCode() == 200 && $response->getBody()) {
            $responseData = json_decode($response->getBody(), true);

            // Проверяем код ответа
            if (isset($responseData['code']) && $responseData['code'] === 1000) {
                // Удаляем токен из настроек DSS
                $this->dssSettings->token = null;
                $this->dssSettings->begin_session = null; // Сбрасываем время начала сессии
                $this->dssSettings->update_token = null; // Сбрасываем время обновления токена
                $this->dssSettings->update_token_count = 0; // Сбрасываем счетчик обновлений токена
                $this->dssSettings->keepalive = null; // Сбрасываем время последнего keepalive
                $this->dssSettings->save();
                return ['success' => true];
            } else {
                return ['error' => 'Неверный код ответа: ' . $responseData['code']];
            }
        } else {
            return ['error' => 'Ошибка запроса: ' . $response->getStatusCode()];
        }
    }

    /**
     * Закрывает визит посетителя (фиксирует выезд)
     * Аннулирует разовые разрешения и завершает связанные задания
     * 
     * @param \App\Models\Visitor $visitor - запись посетителя
     * @param mixed $device - устройство выезда (null если выезд не зафиксирован камерой)
     * @param mixed $exitTime - время выезда
     * @param bool $missedExit - флаг пропущенного выезда (камера не зафиксировала)
     */
    private function closeVisitorExit($visitor, $device = null, $exitTime = null, $missedExit = false)
    {
        $leftTerritoryStatus = Status::where('key', 'left_territory')->first();
        $inactiveStatus = Status::where('key', 'not_active')->first();
        $completedStatus = Status::where('key', 'completed')->firstOr(function() use ($leftTerritoryStatus) {
            return $leftTerritoryStatus; // fallback если нет статуса completed
        });

        // Обновляем запись посетителя
        $visitor->exit_device_id = $device?->id;
        $visitor->exit_date = $exitTime ?? now();
        $visitor->status_id = $leftTerritoryStatus->id;
        
        // Если это пропущенный выезд - добавляем комментарий
        if ($missedExit) {
            $visitor->comment = ($visitor->comment ? $visitor->comment . "\n" : '') . 
                '[AUTO] Выезд не зафиксирован камерой. Закрыт автоматически при повторном въезде ' . now()->format('d.m.Y H:i');
        }
        
        $visitor->save();

        // Завершаем задание если есть
        if ($visitor->task_id) {
            $task = Task::find($visitor->task_id);
            if ($task) {
                $task->status_id = $completedStatus->id;
                $task->end_date = $exitTime ?? now();
                $task->save();

                // Log::info('DSS: Задание завершено при выезде ТС', [
                //     'task_id' => $task->id,
                //     'task_name' => $task->name,
                //     'visitor_id' => $visitor->id,
                //     'missed_exit' => $missedExit,
                // ]);
            }
        }

        // Аннулируем разовое разрешение если есть
        if ($visitor->entry_permit_id) {
            $permit = EntryPermit::find($visitor->entry_permit_id);
            if ($permit && $permit->one_permission && $inactiveStatus) {
                $permit->status_id = $inactiveStatus->id;
                $permit->end_date = $exitTime ?? now();
                $permit->save();

                // Log::info('DSS: Разовое разрешение аннулировано при выезде ТС', [
                //     'permit_id' => $permit->id,
                //     'truck_id' => $permit->truck_id,
                //     'visitor_id' => $visitor->id,
                //     'missed_exit' => $missedExit,
                // ]);
            }
        }

        // Также проверяем и аннулируем все активные разовые разрешения для этого ТС в этом дворе
        if ($visitor->truck_id) {
            $activeStatus = Status::where('key', 'active')->first();
            $oneTimePermits = EntryPermit::where('truck_id', $visitor->truck_id)
                ->where('yard_id', $visitor->yard_id)
                ->where('one_permission', true)
                ->where('status_id', $activeStatus->id)
                ->get();

            foreach ($oneTimePermits as $oneTimePermit) {
                $oneTimePermit->status_id = $inactiveStatus->id;
                $oneTimePermit->end_date = $exitTime ?? now();
                $oneTimePermit->save();

                // Log::info('DSS: Дополнительное разовое разрешение аннулировано', [
                //     'permit_id' => $oneTimePermit->id,
                //     'truck_id' => $oneTimePermit->truck_id,
                //     'visitor_id' => $visitor->id,
                // ]);
            }
        }
    }
}
