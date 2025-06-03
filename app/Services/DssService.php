<?php

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
        $dssApi = DssApi::where('api_name', 'Authorize')->where('dss_setings_id', $this->dssSettings->id)->first();
    try{
        $response = $this->client->post($this->baseUrl.$dssApi->request_url, [
            'json' => [
                'userName' => $username,
                'ipAddress' => '',
                'clientType' => 'WINPC_V2'
            ]
        ]);

        return json_decode($response->getBody(), true);
    }catch(RequestException $e){
        if($e->hasResponse()){
            return  json_decode($e->getResponse()->getBody(),true);
        }else{
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
try{
        $response = $this->client->post($this->baseUrl, [
            'json' => [
                'userName' => $username,
                'signature' => $signature,
                'randomKey' => $randomKey,
                'encryptType' => 'MD5',
                'clientType' => 'WINPC_V2'
            ]
        ]);
    }catch(RequestException $e){
        $response = $e->getResponse();
    }

        $responseData = json_decode($response->getBody(), true);

        if (!isset($responseData['token'])) {
            return ['error' => $responseData];
        }

        // Сохраняем токен в настройках DSS
        $this->dssSettings->token = $responseData['token'];
        $this->dssSettings->begin_session = now(); // Устанавливаем время начала сессии
        $this->dssSettings->save();

        return ['success' => true, 'token' => $responseData['token']];
    }

    // Авторизация в DSS
    public function dssAutorize(){
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

        if (isset($secondLogin['error'])) {
            return ['error' => $secondLogin['error'], 'data'=>$secondLogin];
        }
        return $secondLogin; 
    }
    // Обновление сессии
    // Поддержание сессии активной
    public function dssKeepAlive()
    {
        if (!$this->dssSettings->token) {
           return $this->dssAutorize(); // Если токен не установлен, выполняем авторизацию
        }
        // Получаем API-метод из базы данных
        $dssApi = DssApi::where('api_name', 'KeepAlive')->where('dss_setings_id', $this->dssSettings->id)->first();

        // Отправка запроса
        $response = $this->client->put($this->baseUrl . $dssApi->request_url, [
            'headers' => [
                'Authorization' => 'Bearer ' . $this->token,
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
                    $this->dssSettings->save();
                    return ['success' => true, 'new_token' => $newToken];
                } else {
                    return ['error' => 'Токен отсутствует в ответе!'];
                }
            } else {
                return ['error' => 'Неверный код ответа: ' . $responseData['code']];
            }
        } else {
            return ['error' => 'Ошибка запроса: ' . $response->getStatusCode()];
        }
    }

    // Обновление токена
    public function dssUpdateToken()
    {
        if (!$this->dssSettings->token) {
            return ['error' => 'Токен не установлен!'];
        }
        // Получаем API-метод из базы данных
        $dssApi = DssApi::where('api_name', 'UpdateToken')->where('dss_setings_id', $this->dssSettings->id)->first();

        // Отправка запроса
        $response = $this->client->post($this->baseUrl . $dssApi->request_url, [
            'headers' => [
                'Authorization' => 'Bearer ' . $this->token,
                'Content-Type' => 'application/json',
                'Charset' => 'utf-8'
            ],'json' => [
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
                    $this->dssSettings->save();
                    return ['success' => true, 'new_token' => $newToken];
                } else {
                    return ['error' => 'Токен отсутствует в ответе!'];
                }
            } else {
                    $this->dssSettings->token = null; // Сбрасываем токен в настройках DSS
                    $this->dssSettings->begin_session = null; // Сбрасываем время начала сессии
                    $this->dssSettings->save();
                return ['error' => 'Неверный код ответа: ' . $responseData['code']];
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
                'Authorization' => 'Bearer ' . $this->token,
                'Content-Type' => 'application/json',
                'Charset' => 'utf-8'
            ],'json' => [
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
