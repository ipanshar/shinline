<?php

namespace Tests\Unit;

use App\Services\DssAuthService;
use App\Services\DssStructuredLogger;
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
    }
}