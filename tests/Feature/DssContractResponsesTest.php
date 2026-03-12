<?php

namespace Tests\Feature;

use App\Services\DssAuthService;
use App\Services\DssCaptureService;
use App\Services\DssDeviceSyncService;
use App\Services\DssMediaService;
use App\Services\DssStructuredLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Mockery;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class DssContractResponsesTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    public function test_first_login_contract_preserves_realm_and_random_key_shape(): void
    {
        $this->registerDefaultDssApis();

        $history = [];
        $client = $this->makeHistoryMockClient([
            $this->jsonResponseFromFixture('authorize_first_login_success'),
        ], $history);

        $service = new DssAuthService(new DssStructuredLogger(), $client);
        $response = $service->firstLogin('operator');

        $this->assertSame($this->fixtureArray('authorize_first_login_success'), $response);
        $this->assertSame('/authorize', $history[0]['request']->getUri()->getPath());
    }

    public function test_keepalive_contract_resets_token_on_expired_session_payload(): void
    {
        $settings = $this->registerDefaultDssApis($this->createDssSettings(['token' => 'expired-token']));
        $history = [];

        $client = $this->makeHistoryMockClient([
            $this->jsonResponseFromFixture('keepalive_expired_token'),
        ], $history);

        $service = new DssAuthService(new DssStructuredLogger(), $client);
        $response = $service->dssKeepAlive();

        $this->assertArrayHasKey('error', $response);
        $this->assertNull($settings->fresh()->token);
    }

    public function test_vehicle_capture_contract_creates_capture_records_from_mock_payload(): void
    {
        Queue::fake();
        $settings = $this->registerDefaultDssApis($this->createDssSettings(['token' => 'live-token']));
        $history = [];

        $authService = Mockery::mock(DssAuthService::class);
        $authService->shouldReceive('ensureAuthorized')->once()->andReturn(['success' => true, 'token' => 'live-token']);

        $client = $this->makeHistoryMockClient([
            $this->jsonResponseFromFixture('vehicle_capture_success'),
        ], $history);

        $service = new DssCaptureService(
            $authService,
            app(DssDeviceSyncService::class),
            new DssMediaService(),
            new DssStructuredLogger(),
            $client,
        );

        $result = $service->dssVehicleCapture();

        $this->assertTrue($result['success']);
        $this->assertSame(1, $result['processed']);
        $this->assertDatabaseHas('vehicle_captures', [
            'plateNo' => 'A123BC',
            'captureTime' => '1710000000',
        ]);
        $this->assertSame('/captures', $history[0]['request']->getUri()->getPath());
        $this->assertSame('live-token', $settings->fresh()->token);
    }

    protected function tearDown(): void
    {
        Mockery::close();

        parent::tearDown();
    }
}