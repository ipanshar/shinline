<?php

namespace App\Services;

use GuzzleHttp\Exception\RequestException;

class DssAuthService extends DssBaseService
{
    public function firstLogin(string $username): array
    {
        if ($error = $this->ensureSettings(['base_url'])) {
            return $error;
        }

        $dssApi = $this->getApiDefinition('Authorize');
        if (!$dssApi) {
            return ['error' => 'DSS API method Authorize not found'];
        }

        try {
            $response = $this->client->post($this->baseUrl . $dssApi->request_url, [
                'json' => [
                    'userName' => $username,
                    'ipAddress' => '',
                    'clientType' => $this->dssSettings->client_type ?? 'WINPC_V2',
                ],
            ]);

            return json_decode($response->getBody(), true);
        } catch (RequestException $exception) {
            if ($exception->hasResponse()) {
                return json_decode($exception->getResponse()->getBody(), true);
            }

            return ['error' => $exception->getMessage()];
        }
    }

    public function secondLogin(string $username, string $password, string $realm, string $randomKey): array
    {
        if ($error = $this->ensureSettings(['base_url'])) {
            return $error;
        }

        $dssApi = $this->getApiDefinition('Authorize');
        if (!$dssApi) {
            return ['error' => 'DSS API method Authorize not found'];
        }

        $temp1 = md5($password);
        $temp2 = md5($username . $temp1);
        $temp3 = md5($temp2);
        $temp4 = md5($username . ':' . $realm . ':' . $temp3);
        $signature = md5($temp4 . ':' . $randomKey);

        try {
            $response = $this->client->post($this->baseUrl . $dssApi->request_url, [
                'json' => [
                    'userName' => $username,
                    'signature' => $signature,
                    'randomKey' => $randomKey,
                    'encryptType' => 'MD5',
                    'clientType' => $this->dssSettings->client_type ?? 'WINPC_V2',
                ],
            ]);

            return json_decode($response->getBody(), true);
        } catch (RequestException $exception) {
            if ($exception->hasResponse()) {
                return json_decode($exception->getResponse()->getBody(), true);
            }

            return ['error' => $exception->getMessage()];
        }
    }

    public function ensureAuthorized(): array
    {
        if ($error = $this->ensureSettings(['base_url'])) {
            return $error;
        }

        if ($this->dssSettings->token) {
            return ['success' => true, 'token' => $this->dssSettings->token];
        }

        return $this->dssAutorize();
    }

    public function dssAutorize(): array
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
            $firstLogin['realm'] ?? '',
            $firstLogin['randomKey'] ?? ''
        );

        if (!isset($secondLogin['error']) && isset($secondLogin['token'])) {
            $this->dssSettings->token = $secondLogin['token'];
            $this->dssSettings->credential = $secondLogin['credential'] ?? null;
            $this->dssSettings->begin_session = now();
            $this->dssSettings->update_token = null;
            $this->dssSettings->update_token_count = 0;
            $this->dssSettings->save();
            $this->refreshContext();

            return ['success' => true, 'token' => $this->token];
        }

        return [
            'error' => 'Ошибка: токен не установлен',
            'firstLogin' => $firstLogin,
            'secondLogin' => $secondLogin,
        ];
    }

    public function dssKeepAlive(): array
    {
        if ($error = $this->ensureSettings(['base_url'])) {
            return $error;
        }

        $authResult = $this->ensureAuthorized();
        if (isset($authResult['error'])) {
            return $authResult;
        }

        $dssApi = $this->getApiDefinition('KeepAlive');
        if (!$dssApi) {
            return ['error' => 'DSS API method KeepAlive not found'];
        }

        try {
            $response = $this->client->put($this->baseUrl . $dssApi->request_url, [
                'headers' => $this->getJsonHeaders($this->dssSettings->token),
                'json' => [
                    'token' => $this->dssSettings->token,
                ],
            ]);
        } catch (RequestException $exception) {
            $authResult = $this->dssAutorize();
            if (isset($authResult['error'])) {
                return $authResult;
            }

            $response = $this->client->put($this->baseUrl . $dssApi->request_url, [
                'headers' => $this->getJsonHeaders($this->dssSettings->token),
                'json' => [
                    'token' => $this->dssSettings->token,
                ],
            ]);
        }

        if ($response->getStatusCode() !== 200 || !$response->getBody()) {
            return ['error' => 'Ошибка запроса: ' . $response->getStatusCode()];
        }

        $responseData = json_decode($response->getBody(), true);
        if ((int) ($responseData['code'] ?? 0) === 1000) {
            $this->dssSettings->keepalive = now();
            $this->dssSettings->save();

            return [
                'success' => true,
                'live_token' => $responseData['data']['token'] ?? $this->dssSettings->token,
            ];
        }

        if ((int) ($responseData['code'] ?? 0) === 7000) {
            $this->dssSettings->token = null;
            $this->dssSettings->begin_session = null;
            $this->dssSettings->save();
        }

        return [
            'error' => 'Неверный код ответа: ' . ($responseData['code'] ?? 'unknown'),
            'data' => $responseData,
        ];
    }

    public function dssUpdateToken(): array
    {
        if ($error = $this->ensureSettings(['base_url'])) {
            return $error;
        }

        if (!$this->dssSettings->token || $this->dssSettings->update_token_count > 4) {
            return $this->dssAutorize();
        }

        $dssApi = $this->getApiDefinition('UpdateToken');
        if (!$dssApi) {
            return ['error' => 'DSS API method UpdateToken not found'];
        }

        try {
            $response = $this->client->post($this->baseUrl . $dssApi->request_url, [
                'headers' => $this->getJsonHeaders($this->dssSettings->token),
                'json' => [
                    'token' => $this->dssSettings->token,
                ],
            ]);
        } catch (RequestException $exception) {
            if ($exception->hasResponse()) {
                return ['error' => $exception->getMessage(), 'data' => json_decode($exception->getResponse()->getBody(), true)];
            }

            return ['error' => $exception->getMessage()];
        }

        if ($response->getStatusCode() !== 200 || !$response->getBody()) {
            return ['error' => 'Ошибка запроса: ' . $response->getStatusCode()];
        }

        $responseData = json_decode($response->getBody(), true);
        if ((int) ($responseData['code'] ?? 0) === 1000) {
            $newToken = $responseData['data']['token'] ?? null;
            if (!$newToken) {
                return ['error' => 'Токен отсутствует в ответе!'];
            }

            $this->dssSettings->token = $newToken;
            $this->dssSettings->credential = $responseData['data']['credential'] ?? $this->dssSettings->credential;
            $this->dssSettings->update_token = now();
            $this->dssSettings->update_token_count += 1;
            $this->dssSettings->save();
            $this->refreshContext();

            return ['success' => true, 'new_token' => $newToken];
        }

        $this->dssSettings->token = null;
        $this->dssSettings->begin_session = null;
        $this->dssSettings->update_token = null;
        $this->dssSettings->update_token_count = 0;
        $this->dssSettings->save();

        return ['error' => 'Неверный код ответа: ' . ($responseData['code'] ?? 'unknown')];
    }

    public function dssUnauthorize(): array
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

        try {
            $response = $this->client->post($this->baseUrl . $dssApi->request_url, [
                'headers' => $this->getJsonHeaders($this->dssSettings->token),
                'json' => [
                    'token' => $this->dssSettings->token,
                ],
            ]);
        } catch (RequestException $exception) {
            if ($exception->hasResponse()) {
                return ['error' => $exception->getMessage(), 'data' => json_decode($exception->getResponse()->getBody(), true)];
            }

            return ['error' => $exception->getMessage()];
        }

        if ($response->getStatusCode() !== 200 || !$response->getBody()) {
            return ['error' => 'Ошибка запроса: ' . $response->getStatusCode()];
        }

        $responseData = json_decode($response->getBody(), true);
        if ((int) ($responseData['code'] ?? 0) !== 1000) {
            return ['error' => 'Неверный код ответа: ' . ($responseData['code'] ?? 'unknown')];
        }

        $this->dssSettings->token = null;
        $this->dssSettings->begin_session = null;
        $this->dssSettings->update_token = null;
        $this->dssSettings->update_token_count = 0;
        $this->dssSettings->keepalive = null;
        $this->dssSettings->save();
        $this->refreshContext();

        return ['success' => true];
    }
}