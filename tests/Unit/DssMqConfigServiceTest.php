<?php

namespace Tests\Unit;

use App\Services\DssAuthService;
use App\Services\DssMqConfigService;
use App\Services\DssStructuredLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class DssMqConfigServiceTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    public function test_get_mq_config_returns_decrypted_password(): void
    {
        $settings = $this->registerDefaultDssApis($this->createDssSettings([
            'token' => 'token-123',
            'secret_key' => '1234567890ABCDEF1234567890ABCDEF',
            'secret_vector' => 'ABCDEF1234567890',
        ]));

        $plainPassword = 'mq-password-plain';
        $encryptedPassword = bin2hex(openssl_encrypt(
            $plainPassword,
            'AES-256-CBC',
            $settings->secret_key,
            OPENSSL_RAW_DATA,
            $settings->secret_vector,
        ));

        $history = [];
        $client = $this->makeHistoryMockClient([
            $this->jsonResponse([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'addr' => '10.210.0.250:61616',
                    'mqtt' => '10.210.0.250:1883',
                    'amqp' => '10.210.0.250:5672',
                    'stomp' => '10.210.0.250:61613',
                    'wss' => '10.210.0.250:61615',
                    'userName' => 'consumer',
                    'password' => $encryptedPassword,
                    'enableTls' => '1',
                ],
            ]),
        ], $history);

        $authHistory = [];
        $authService = new DssAuthService(new DssStructuredLogger(), $this->makeHistoryMockClient([], $authHistory));
        $service = new DssMqConfigService($authService, $client);

        $response = $service->getMqConfig();

        $this->assertTrue($response['success']);
        $this->assertSame($plainPassword, $response['data']['password_plain']);
        $this->assertSame('consumer', $response['data']['userName']);
        $this->assertCount(1, $history);

        $requestPayload = json_decode((string) $history[0]['request']->getBody(), true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame([], $requestPayload);
        $this->assertSame('token-123', $history[0]['request']->getHeaderLine('X-Subject-Token'));
    }

    private function jsonResponse(array $payload): \GuzzleHttp\Psr7\Response
    {
        return new \GuzzleHttp\Psr7\Response(
            200,
            ['Content-Type' => 'application/json'],
            json_encode($payload, JSON_THROW_ON_ERROR)
        );
    }
}