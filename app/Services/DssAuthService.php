<?php

namespace App\Services;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use phpseclib3\Crypt\PublicKeyLoader;
use phpseclib3\Crypt\RSA;
use phpseclib3\Crypt\RSA\PublicKey as RsaPublicKey;
use RuntimeException;

class DssAuthService extends DssBaseService
{
    public function __construct(
        private DssStructuredLogger $structuredLogger,
        ?Client $client = null,
    ) {
        parent::__construct($client);
    }

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

    public function secondLogin(string $username, string $password, string $realm, string $randomKey, ?string $platformPublicKey = null): array
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
            $encryptedSession = $this->prepareEncryptedSessionSecrets($platformPublicKey);
        } catch (RuntimeException $exception) {
            return ['error' => $exception->getMessage()];
        }

        $payload = [
            'userName' => $username,
            'signature' => $signature,
            'randomKey' => $randomKey,
            'encryptType' => 'MD5',
            'clientType' => $this->dssSettings->client_type ?? 'WINPC_V2',
            'publicKey' => $encryptedSession['terminal_public_key'],
            'secretKey' => $encryptedSession['encrypted_secret_key'],
            'secretVector' => $encryptedSession['encrypted_secret_vector'],
            'userType' => '0',
        ];

        try {
            $response = $this->client->post($this->baseUrl . $dssApi->request_url, [
                'json' => $payload,
            ]);

            $responsePayload = json_decode($response->getBody(), true);

            return array_merge($responsePayload, [
                '_generated_secret_key' => $encryptedSession['secret_key'],
                '_generated_secret_vector' => $encryptedSession['secret_vector'],
                '_terminal_public_key' => $encryptedSession['terminal_public_key'],
                '_platform_public_key' => $encryptedSession['platform_public_key'],
            ]);
        } catch (RequestException $exception) {
            if ($exception->hasResponse()) {
                $responsePayload = json_decode($exception->getResponse()->getBody(), true);

                return array_merge($responsePayload, [
                    '_generated_secret_key' => $encryptedSession['secret_key'],
                    '_generated_secret_vector' => $encryptedSession['secret_vector'],
                    '_terminal_public_key' => $encryptedSession['terminal_public_key'],
                    '_platform_public_key' => $encryptedSession['platform_public_key'],
                ]);
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
            $this->structuredLogger->error('auth_fail', [
                'stage' => 'first_login',
                'message' => $firstLogin['error'],
                'username' => $this->dssSettings->user_name,
            ]);

            return ['error' => $firstLogin['error']];
        }

        $secondLogin = $this->secondLogin(
            $this->dssSettings->user_name,
            $this->dssSettings->password,
            $firstLogin['realm'] ?? '',
            $firstLogin['randomKey'] ?? '',
            $this->extractFirstAvailableResponseValue($firstLogin, ['publickey', 'publicKey'])
        );

        $token = $this->extractResponseValue($secondLogin, 'token');
        if (!isset($secondLogin['error']) && filled($token)) {
            $sessionSecrets = $this->resolveSessionSecrets($secondLogin);

            $this->dssSettings->token = $token;
            $this->dssSettings->credential = $this->extractResponseValue($secondLogin, 'credential');
            $this->dssSettings->user_id = $this->extractFirstAvailableResponseValue($secondLogin, ['userId', 'user_id'])
                ?? $this->dssSettings->user_id;
            $this->dssSettings->user_group_id = $this->extractFirstAvailableResponseValue($secondLogin, ['userGroupId', 'user_group_id'])
                ?? $this->dssSettings->user_group_id;
            $this->dssSettings->secret_key = $sessionSecrets['secret_key'];
            $this->dssSettings->secret_vector = $sessionSecrets['secret_vector'];
            $this->dssSettings->terminal_public_key = $this->extractFirstAvailableResponseValue($secondLogin, ['_terminal_public_key'])
                ?? $this->dssSettings->terminal_public_key;
            $this->dssSettings->platform_public_key = $this->extractFirstAvailableResponseValue($secondLogin, ['_platform_public_key'])
                ?? $this->extractFirstAvailableResponseValue($firstLogin, ['publickey', 'publicKey'])
                ?? $this->dssSettings->platform_public_key;
            $this->dssSettings->begin_session = now();
            $this->dssSettings->update_token = null;
            $this->dssSettings->update_token_count = 0;
            $this->dssSettings->save();
            $this->refreshContext();

            $this->structuredLogger->info('auth_success', [
                'stage' => 'authorize',
                'username' => $this->dssSettings->user_name,
            ]);

            return [
                'success' => true,
                'token' => $this->token,
                'credential' => $this->credential,
                'user_id' => $this->dssSettings->user_id,
                'user_group_id' => $this->dssSettings->user_group_id,
                'secret_key' => $this->dssSettings->secret_key,
                'secret_vector' => $this->dssSettings->secret_vector,
            ];
        }

        $this->structuredLogger->error('auth_fail', [
            'stage' => 'second_login',
            'message' => $secondLogin['error'] ?? 'Токен не установлен',
            'username' => $this->dssSettings->user_name,
        ]);

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

            $this->structuredLogger->info('auth_success', [
                'stage' => 'keepalive',
                'username' => $this->dssSettings->user_name,
            ]);

            return [
                'success' => true,
                'live_token' => $responseData['data']['token'] ?? $this->dssSettings->token,
            ];
        }

        if ((int) ($responseData['code'] ?? 0) === 7000) {
            $this->clearSessionState();
        }

        $this->structuredLogger->error('auth_fail', [
            'stage' => 'keepalive',
            'message' => 'Неверный код ответа: ' . ($responseData['code'] ?? 'unknown'),
            'username' => $this->dssSettings->user_name,
        ]);

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
                $this->structuredLogger->error('auth_fail', [
                    'stage' => 'update_token',
                    'message' => 'Токен отсутствует в ответе',
                    'username' => $this->dssSettings->user_name,
                ]);

                return ['error' => 'Токен отсутствует в ответе!'];
            }

            $this->dssSettings->token = $newToken;
            $this->dssSettings->credential = $responseData['data']['credential'] ?? $this->dssSettings->credential;
            $this->dssSettings->user_id = $this->extractFirstAvailableResponseValue($responseData, ['userId', 'user_id'])
                ?? $this->dssSettings->user_id;
            $this->dssSettings->user_group_id = $this->extractFirstAvailableResponseValue($responseData, ['userGroupId', 'user_group_id'])
                ?? $this->dssSettings->user_group_id;
            $this->dssSettings->secret_key = $this->extractFirstAvailableResponseValue($responseData, ['secretKey', 'secret_key'])
                ?? $this->dssSettings->secret_key;
            $this->dssSettings->secret_vector = $this->extractFirstAvailableResponseValue($responseData, ['secretVector', 'secret_vector'])
                ?? $this->dssSettings->secret_vector;
            $this->dssSettings->update_token = now();
            $this->dssSettings->update_token_count += 1;
            $this->dssSettings->save();
            $this->refreshContext();

            $this->structuredLogger->info('auth_success', [
                'stage' => 'update_token',
                'username' => $this->dssSettings->user_name,
            ]);

            return ['success' => true, 'new_token' => $newToken];
        }

        $this->clearSessionState();

        $this->structuredLogger->error('auth_fail', [
            'stage' => 'update_token',
            'message' => 'Неверный код ответа: ' . ($responseData['code'] ?? 'unknown'),
            'username' => $this->dssSettings->user_name,
        ]);

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

        $this->clearSessionState(true);

        $this->structuredLogger->info('auth_success', [
            'stage' => 'logout',
            'username' => $this->dssSettings->user_name,
        ]);

        return ['success' => true];
    }

    private function clearSessionState(bool $clearKeepalive = false): void
    {
        $this->dssSettings->token = null;
        $this->dssSettings->credential = null;
        $this->dssSettings->secret_key = null;
        $this->dssSettings->secret_vector = null;
        $this->dssSettings->begin_session = null;
        $this->dssSettings->update_token = null;
        $this->dssSettings->update_token_count = 0;

        if ($clearKeepalive) {
            $this->dssSettings->keepalive = null;
        }

        $this->dssSettings->save();
        $this->refreshContext();
    }

    private function resolveSessionSecrets(array $payload): array
    {
        $secretKey = $this->extractFirstAvailableResponseValue($payload, ['_generated_secret_key'])
            ?? $this->extractFirstAvailableResponseValue($payload, ['secretKey', 'secret_key'])
            ?? $this->dssSettings?->secret_key;
        $secretVector = $this->extractFirstAvailableResponseValue($payload, ['_generated_secret_vector'])
            ?? $this->extractFirstAvailableResponseValue($payload, ['secretVector', 'secret_vector'])
            ?? $this->dssSettings?->secret_vector;

        if (blank($secretKey)) {
            $secretKey = bin2hex(random_bytes(16));
        }

        if (blank($secretVector)) {
            $secretVector = bin2hex(random_bytes(8));
        }

        return [
            'secret_key' => $secretKey,
            'secret_vector' => $secretVector,
        ];
    }

    private function prepareEncryptedSessionSecrets(?string $platformPublicKey): array
    {
        $normalizedPlatformPublicKey = $this->normalizePublicKey($platformPublicKey ?? $this->dssSettings?->platform_public_key);
        if ($normalizedPlatformPublicKey === null) {
            throw new RuntimeException('DSS first login did not return platform public key');
        }

        $terminalKeys = $this->ensureTerminalKeyPair();
        $secretKey = bin2hex(random_bytes(16));
        $secretVector = bin2hex(random_bytes(8));

        return [
            'secret_key' => $secretKey,
            'secret_vector' => $secretVector,
            'encrypted_secret_key' => $this->encryptWithPublicKey($secretKey, $normalizedPlatformPublicKey),
            'encrypted_secret_vector' => $this->encryptWithPublicKey($secretVector, $normalizedPlatformPublicKey),
            'terminal_public_key' => $terminalKeys['public_key'],
            'platform_public_key' => $normalizedPlatformPublicKey,
        ];
    }

    private function ensureTerminalKeyPair(): array
    {
        $publicKey = $this->normalizePublicKey($this->dssSettings?->terminal_public_key);
        $privateKey = $this->dssSettings?->terminal_private_key;

        if (filled($publicKey) && filled($privateKey)) {
            return [
                'public_key' => $publicKey,
                'private_key' => $privateKey,
            ];
        }

        $privateKeyObject = RSA::createKey(2048);
        $privateKeyOutput = $privateKeyObject->toString('PKCS8');
        $generatedPublicKey = $privateKeyObject->getPublicKey()->toString('PKCS8');
        if (blank($generatedPublicKey)) {
            throw new RuntimeException('Unable to extract terminal public key');
        }

        $this->dssSettings->terminal_public_key = $generatedPublicKey;
        $this->dssSettings->terminal_private_key = $privateKeyOutput;
        $this->dssSettings->save();
        $this->refreshContext();

        return [
            'public_key' => $generatedPublicKey,
            'private_key' => $privateKeyOutput,
        ];
    }

    private function normalizePublicKey(?string $publicKey): ?string
    {
        if (blank($publicKey)) {
            return null;
        }

        $trimmed = trim($publicKey);
        if (str_contains($trimmed, 'BEGIN PUBLIC KEY')) {
            return $trimmed;
        }

        $normalizedBody = preg_replace('/\s+/', '', $trimmed);
        if (blank($normalizedBody)) {
            return null;
        }

        return "-----BEGIN PUBLIC KEY-----\n"
            . trim(chunk_split($normalizedBody, 64, "\n"))
            . "\n-----END PUBLIC KEY-----";
    }

    private function encryptWithPublicKey(string $plaintext, string $publicKey): string
    {
        try {
            $loadedKey = PublicKeyLoader::load($publicKey);
            if (!$loadedKey instanceof RsaPublicKey) {
                throw new RuntimeException('Unable to read DSS platform public key');
            }

            $loadedKey = $loadedKey->withPadding(RSA::ENCRYPTION_PKCS1);
        } catch (\Throwable $exception) {
            throw new RuntimeException('Unable to read DSS platform public key');
        }

        $encrypted = $loadedKey->encrypt($plaintext);
        if ($encrypted === false || $encrypted === '') {
            throw new RuntimeException('Unable to encrypt DSS session secrets');
        }

        return base64_encode($encrypted);
    }

    private function extractFirstAvailableResponseValue(array $payload, array $keys): ?string
    {
        foreach ($keys as $key) {
            $value = $this->extractResponseValue($payload, $key);
            if (filled($value)) {
                return (string) $value;
            }
        }

        return null;
    }

    private function extractResponseValue(array $payload, string $key): mixed
    {
        if (array_key_exists($key, $payload)) {
            return $payload[$key];
        }

        $data = $payload['data'] ?? null;

        if (is_array($data) && array_key_exists($key, $data)) {
            return $data[$key];
        }

        return null;
    }
}