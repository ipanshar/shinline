<?php

namespace Tests\Unit;

use App\Services\DssAuthService;
use App\Services\DssStructuredLogger;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class DssAuthServiceSignatureTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    public function test_second_login_sends_expected_auth_signature(): void
    {
        $this->registerDefaultDssApis();

        $history = [];
        $client = $this->makeHistoryMockClient([
            $this->jsonResponseFromFixture('authorize_second_login_success'),
        ], $history);

        $service = new DssAuthService(new DssStructuredLogger(), $client);

        $response = $service->secondLogin('operator', 'secret', 'dss-realm', 'random-key-1');

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
        $this->assertArrayNotHasKey('secretKey', $payload);
        $this->assertArrayNotHasKey('secretVector', $payload);
    }

    public function test_authorize_persists_generated_session_secrets_when_dss_does_not_return_them(): void
    {
        $settings = $this->registerDefaultDssApis();

        $history = [];
        $client = $this->makeHistoryMockClient([
            $this->jsonResponseFromFixture('authorize_first_login_success'),
            $this->jsonResponseFromFixture('authorize_second_login_success'),
        ], $history);

        $service = new DssAuthService(new DssStructuredLogger(), $client);

        $response = $service->dssAutorize();

        $this->assertTrue($response['success']);

        $settings->refresh();

        $this->assertSame('token-123', $settings->token);
        $this->assertSame('credential-123', $settings->credential);
        $this->assertNotNull($settings->secret_key);
        $this->assertNotNull($settings->secret_vector);
        $this->assertSame(32, strlen($settings->secret_key));
        $this->assertSame(16, strlen($settings->secret_vector));
    }

    public function test_authorize_persists_response_secret_values_when_dss_returns_them(): void
    {
        $settings = $this->registerDefaultDssApis();
        $history = [];

        $client = $this->makeHistoryMockClient([
            $this->jsonResponseFromFixture('authorize_first_login_success'),
            new Response(
                200,
                ['Content-Type' => 'application/json'],
                json_encode([
                    'token' => 'token-999',
                    'credential' => 'credential-999',
                    'secretKey' => '1234567890ABCDEF1234567890ABCDEF',
                    'secretVector' => 'ABCDEF1234567890',
                ], JSON_THROW_ON_ERROR)
            ),
        ], $history);

        $service = new DssAuthService(new DssStructuredLogger(), $client);

        $response = $service->dssAutorize();

        $this->assertTrue($response['success']);

        $settings->refresh();

        $this->assertSame('1234567890ABCDEF1234567890ABCDEF', $settings->secret_key);
        $this->assertSame('ABCDEF1234567890', $settings->secret_vector);
    }
}