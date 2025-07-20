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

use App\Models\Devaice;
use App\Models\DssApi;
use App\Models\DssSetings;
use App\Models\Truck;
use App\Models\TruckBrand;
use App\Models\TruckCategory;
use App\Models\TruckModel;
use App\Models\VehicleCapture;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

class DssService
{
    protected $client;
    protected $dssSettings;
    protected $baseUrl;
    protected $token;
    protected $dssApi;
    protected $credential;
    public function __construct()
    {
        $this->dssSettings = DssSetings::first();
        $this->baseUrl = $this->dssSettings->base_url;
        $this->token = $this->dssSettings->token;
        $this->credential = $this->dssSettings->credential; // Добавляем учетные данные
        $this->client = new Client();
    }
    // Первый этап авторизации
    // Получаем realm и randomKey
    public function firstLogin($username)
    {
        $this->dssApi = DssApi::where('api_name', 'Authorize')->where('dss_setings_id', $this->dssSettings->id)->first();
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
                return  ['error' => $e['error']];
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
                return  ['error' => $m['error'], 'data' => $m];
            }
        }
    }

    // Авторизация в DSS
    public function dssAutorize()
    {
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
        if (!$this->dssSettings->token) {
            $this->dssAutorize(); // Если токен не установлен, выполняем авторизацию
        }
        // Получаем API-метод из базы данных
        $dssApi = DssApi::where('api_name', 'KeepAlive')->where('dss_setings_id', $this->dssSettings->id)->first();

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
            $this->dssAutorize();

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
        if (!$this->dssSettings->token || !$this->dssSettings->update_token_count > 4) {
            $this->dssAutorize(); // Если токен не установлен или превышено количество обновлений, выполняем авторизацию
        } else {
            // Получаем API-метод из базы данных
            $dssApi = DssApi::where('api_name', 'UpdateToken')->where('dss_setings_id', $this->dssSettings->id)->first();

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

    public function dssVehicleCapture() {
     
        if (!$this->dssSettings->token) {
            return ['error' => 'Токен не установлен!'];
        }
        // Получаем API-метод из базы данных
        $dssApi = DssApi::where('api_name', 'VehicleCapture')->where('dss_setings_id', $this->dssSettings->id)->first();
        $currentTimestamp = time();
        // Отправка запроса
        $response = $this->client->post($this->baseUrl . $dssApi->request_url, [
            'headers' => [
                'X-Subject-Token' =>  $this->token,
                'Content-Type' => 'application/json',
                'Charset' => 'utf-8'
            ],
            'json' => [
                'plateNoMatchMode' => 0, // 1 - точное совпадение, 0 - частичное совпадение
                'startTime' => $currentTimestamp - 60*60, // 1 час назад
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
                    $truk = Truck::where('plate_number', $item['plateNo'])->first();
                    if (!$truk) {
                        // Если грузовик не найден, создаем новый
                        Truck::create([
                            'plate_number' => $item['plateNo'],
                            'color' => $item['vehicleBrandName'] ?? null,
                            'truck_brand_id' => $truck_brand_id,
                            'truck_model_id' => $truck_model->id ?? null,
                            'truck_category_id' => $truck_category->id ?? null,
                        ]);
                    } else {
                        // Если грузовик найден, обновляем его данные
                        $truk->plate_number = $item['plateNo'];
                        $truk->color = $item['vehicleBrandName'] ?? null;
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
                    if($Vehicle->imageDownload === false ){
                       $capturePicture = $Vehicle->capturePicture.'?token='.$this->credential;
                       $ResponseCapturePicture = Http::withoutVerifying()->get($capturePicture);
                       if($ResponseCapturePicture->successful()){
                        $imageData = $ResponseCapturePicture->body();
                        $fileName = $Vehicle->id.'.jpg';
                        Storage::disk('public')->put("images/vehicle/capture/{$fileName}", $imageData);
                       }
                       $plateNoPicture = $Vehicle->plateNoPicture.'?token='.$this->credential;
                       $ResponseplateNoPicture = Http::withoutVerifying()->get($plateNoPicture);
                       if($ResponseplateNoPicture->successful()){
                        $imageData = $ResponseplateNoPicture->body();
                        $fileName = $Vehicle->id.'.jpg';
                        Storage::disk('public')->put("images/vehicle/plateno/{$fileName}", $imageData);
                       }
                    }
                }
                return ['success' => true];
            } else {
                return ['error' => 'Неверный код ответа: ' . $responseData['code'], 'data' => $responseData];
            }
        } else {
            return ['error' => 'Ошибка запроса: ' . $response->getStatusCode()];
        }

    }

    // Выход из системы DSS
    public function dssUnauthorize()
    {
        if (!$this->dssSettings->token) {
            return ['error' => 'Токен не установлен!'];
        }
        // Получаем API-метод из базы данных
        $dssApi = DssApi::where('api_name', 'Unauthorize')->where('dss_setings_id', $this->dssSettings->id)->first();

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
}
