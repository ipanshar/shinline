<?php

namespace App\Services;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;

class DssMqConfigService extends DssBaseService
{
    private const DEFAULT_MQ_CONFIG_PATH = '/brms/api/v1.0/BRM/Config/GetMqConfig';

    public function __construct(
        private DssAuthService $authService,
        ?Client $client = null,
    ) {
        parent::__construct($client);
    }

    public function getMqConfig(): array
    {
        if ($error = $this->ensureSettings(['base_url', 'secret_key', 'secret_vector'])) {
            return $error;
        }

        $authResult = $this->authService->ensureAuthorized();
        if (isset($authResult['error'])) {
            return $authResult;
        }

        try {
            $response = $this->client->post($this->resolveMqConfigUrl(), [
                'headers' => $this->getJsonHeaders($this->dssSettings->token),
                'json' => (object) [],
            ]);
        } catch (RequestException $exception) {
            if ($exception->hasResponse()) {
                return [
                    'error' => $exception->getMessage(),
                    'data' => json_decode($exception->getResponse()->getBody(), true),
                ];
            }

            return ['error' => $exception->getMessage()];
        }

        if ($response->getStatusCode() !== 200 || !$response->getBody()) {
            return ['error' => 'Ошибка запроса: ' . $response->getStatusCode()];
        }

        $responseData = json_decode($response->getBody(), true);
        if ((int) ($responseData['code'] ?? 0) !== 1000) {
            return [
                'error' => 'Неверный код ответа: ' . ($responseData['code'] ?? 'unknown'),
                'data' => $responseData,
            ];
        }

        $config = $responseData['data'] ?? [];
        $encryptedPassword = $config['password'] ?? null;
        if (!is_string($encryptedPassword) || $encryptedPassword === '') {
            return ['error' => 'DSS MQ config did not return password'];
        }

        $decryptedPassword = $this->decryptMqPassword($encryptedPassword);
        if ($decryptedPassword === null) {
            return ['error' => 'Не удалось расшифровать пароль MQ'];
        }

        $config['password_plain'] = $decryptedPassword;

        return [
            'success' => true,
            'data' => $config,
        ];
    }

    private function resolveMqConfigUrl(): string
    {
        $dssApi = $this->getApiDefinition('GetMqConfig');

        return $this->baseUrl . ($dssApi?->request_url ?? self::DEFAULT_MQ_CONFIG_PATH);
    }

    private function decryptMqPassword(string $encryptedHexPassword): ?string
    {
        $cipherBinary = hex2bin($encryptedHexPassword);
        if ($cipherBinary === false) {
            return null;
        }

        $decrypted = openssl_decrypt(
            $cipherBinary,
            'AES-256-CBC',
            (string) $this->dssSettings->secret_key,
            OPENSSL_RAW_DATA,
            (string) $this->dssSettings->secret_vector,
        );

        return $decrypted === false ? null : $decrypted;
    }
}