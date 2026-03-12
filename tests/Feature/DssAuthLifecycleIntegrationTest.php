<?php

namespace Tests\Feature;

use App\Services\DssAuthService;
use App\Services\DssStructuredLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class DssAuthLifecycleIntegrationTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    public function test_logout_and_reauthorize_cycle_updates_token_state(): void
    {
        $settings = $this->registerDefaultDssApis($this->createDssSettings());

        $history = [];
        $client = $this->makeHistoryMockClient([
            $this->jsonResponseFromFixture('authorize_first_login_success'),
            $this->jsonResponseFromFixture('authorize_second_login_success'),
            $this->jsonResponseFromFixture('logout_success'),
            $this->jsonResponseFromFixture('authorize_first_login_success'),
            $this->jsonResponseFromFixture('authorize_second_login_reauth_success'),
        ], $history);

        $service = new DssAuthService(new DssStructuredLogger(), $client);

        $firstAuth = $service->dssAutorize();
        $this->assertTrue($firstAuth['success']);
        $this->assertSame('token-123', $settings->fresh()->token);

        $logout = $service->dssUnauthorize();
        $this->assertTrue($logout['success']);
        $this->assertNull($settings->fresh()->token);

        $secondAuth = $service->dssAutorize();
        $this->assertTrue($secondAuth['success']);
        $this->assertSame('token-456', $settings->fresh()->token);
        $this->assertCount(5, $history);
    }
}