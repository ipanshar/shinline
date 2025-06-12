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

use App\Models\DssApi;
use App\Models\DssSetings;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Illuminate\Support\Facades\Hash;

class DssService
{
    protected $client;
    protected $dssSettings;
    protected $baseUrl;
    protected $token;
    protected $dssApi;
    public function __construct()
    {
        $this->dssSettings = DssSetings::first();
        $this->baseUrl = $this->dssSettings->base_url;
        $this->token = $this->dssSettings->token;
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
            $this->dssSettings->begin_session = now(); // Устанавливаем время начала сессии
            $this->dssSettings->update_token = null; // Сбрасываем время обновления токена
            $this->dssSettings->update_token_count = 0; // Сбрасываем счетчик обновлений токена  
            $this->dssSettings->save();
            $this->token = $secondLogin['token']; // Обновляем токен в сервисе
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
