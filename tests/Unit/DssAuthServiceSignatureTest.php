<?php

namespace Tests\Unit;

use App\Services\DssAuthService;
use App\Services\DssStructuredLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use phpseclib3\Crypt\PublicKeyLoader;
use phpseclib3\Crypt\RSA;
use phpseclib3\Crypt\RSA\PrivateKey as RsaPrivateKey;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class DssAuthServiceSignatureTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    public function test_second_login_sends_expected_auth_signature(): void
    {
        $this->registerDefaultDssApis();
        $platformKeys = $this->generatePlatformKeyPair();

        $history = [];
        $client = $this->makeHistoryMockClient([
            $this->jsonResponse([
                'token' => 'token-123',
                'credential' => 'credential-123',
            ]),
        ], $history);

        $service = new DssAuthService(new DssStructuredLogger(), $client);

        $response = $service->secondLogin('operator', 'secret', 'dss-realm', 'random-key-1', $platformKeys['public_key']);

        $this->assertSame('token-123', $response['token']);
        $this->assertCount(1, $history);

        $payload = json_decode((string) $history[0]['request']->getBody(), true, 512, JSON_THROW_ON_ERROR);
        $expectedSignature = md5(
            md5('operator:dss-realm:' . md5(md5('operator' . md5('secret'))))
            . ':random-key-1'
        );

        $this->assertSame($expectedSignature, $payload['signature']);
        $this->assertSame('operator', $payload['userName']);
        $this->assertSame('MD5', $payload['encryptType']);
        $this->assertSame('0', $payload['userType']);
        $this->assertNotEmpty($payload['publicKey']);
        $this->assertNotEmpty($payload['secretKey']);
        $this->assertNotEmpty($payload['secretVector']);

        $decryptedSecretKey = $this->decryptPayloadValue($payload['secretKey'], $platformKeys['private_key']);
        $decryptedSecretVector = $this->decryptPayloadValue($payload['secretVector'], $platformKeys['private_key']);

        $this->assertSame($response['_generated_secret_key'], $decryptedSecretKey);
        $this->assertSame($response['_generated_secret_vector'], $decryptedSecretVector);
        $this->assertSame(32, strlen($decryptedSecretKey));
        $this->assertSame(16, strlen($decryptedSecretVector));
    }

    public function test_authorize_persists_generated_session_secrets_when_dss_does_not_return_them(): void
    {
        $settings = $this->registerDefaultDssApis();
        $platformKeys = $this->generatePlatformKeyPair();

        $history = [];
        $client = $this->makeHistoryMockClient([
            $this->jsonResponse([
                'realm' => 'dss-realm',
                'randomKey' => 'random-key-1',
                'publickey' => $platformKeys['public_key'],
            ]),
            $this->jsonResponse([
                'token' => 'token-123',
                'credential' => 'credential-123',
            ]),
        ], $history);

        $service = new DssAuthService(new DssStructuredLogger(), $client);

        $response = $service->dssAutorize();

        $this->assertTrue($response['success']);

        $settings->refresh();

        $this->assertSame('token-123', $settings->token);
        $this->assertSame('credential-123', $settings->credential);
        $this->assertNotNull($settings->secret_key);
        $this->assertNotNull($settings->secret_vector);
        $this->assertNotNull($settings->terminal_public_key);
        $this->assertNotNull($settings->terminal_private_key);
        $this->assertNotNull($settings->platform_public_key);
        $this->assertSame(32, strlen($settings->secret_key));
        $this->assertSame(16, strlen($settings->secret_vector));
    }

    public function test_authorize_persists_response_secret_values_when_dss_returns_them(): void
    {
        $settings = $this->registerDefaultDssApis();
        $platformKeys = $this->generatePlatformKeyPair();
        $history = [];

        $client = $this->makeHistoryMockClient([
            $this->jsonResponse([
                'realm' => 'dss-realm',
                'randomKey' => 'random-key-1',
                'publickey' => $platformKeys['public_key'],
            ]),
            $this->jsonResponse([
                'token' => 'token-999',
                'credential' => 'credential-999',
            ]),
        ], $history);

        $service = new DssAuthService(new DssStructuredLogger(), $client);

        $response = $service->dssAutorize();

        $this->assertTrue($response['success']);

        $settings->refresh();

        $payload = json_decode((string) $history[1]['request']->getBody(), true, 512, JSON_THROW_ON_ERROR);

        $this->assertSame(
            $this->decryptPayloadValue($payload['secretKey'], $platformKeys['private_key']),
            $settings->secret_key,
        );
        $this->assertSame(
            $this->decryptPayloadValue($payload['secretVector'], $platformKeys['private_key']),
            $settings->secret_vector,
        );
    }

    private function jsonResponse(array $payload): \GuzzleHttp\Psr7\Response
    {
        return new \GuzzleHttp\Psr7\Response(
            200,
            ['Content-Type' => 'application/json'],
            json_encode($payload, JSON_THROW_ON_ERROR)
        );
    }

    private function generatePlatformKeyPair(): array
    {
        $privateKeyObject = RSA::createKey(2048);

        return [
            'private_key' => $privateKeyObject->toString('PKCS8'),
            'public_key' => $privateKeyObject->getPublicKey()->toString('PKCS8'),
        ];
    }

    private function decryptPayloadValue(string $ciphertext, string $privateKey): string
    {
        $decoded = base64_decode($ciphertext, true);
        $this->assertNotFalse($decoded);

        $loadedKey = PublicKeyLoader::load($privateKey);
        $this->assertInstanceOf(RsaPrivateKey::class, $loadedKey);
        /** @var RsaPrivateKey $loadedKey */

        $loadedKey = $loadedKey->withPadding(RSA::ENCRYPTION_PKCS1);

        return $loadedKey->decrypt($decoded);
    }
}