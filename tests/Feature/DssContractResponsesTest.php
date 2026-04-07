<?php

namespace Tests\Feature;

use App\Models\VehicleCapture;
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

    public function test_alarm_10708_detail_is_saved_into_vehicle_captures(): void
    {
        Queue::fake();
        $this->registerDefaultDssApis($this->createDssSettings(['token' => 'live-token']));
        $history = [];

        $authService = Mockery::mock(DssAuthService::class);
        $authService->shouldReceive('ensureAuthorized')->once()->andReturn(['success' => true, 'token' => 'live-token']);

        $client = $this->makeHistoryMockClient([
            new \GuzzleHttp\Psr7\Response(200, ['Content-Type' => 'application/json'], json_encode([
                'code' => 1000,
                'desc' => 'Success',
                'data' => [
                    'alarmCode' => '{58e60b7d5d3247d3b3aba6546b2c4b0a}',
                    'alarmType' => '10708',
                    'plateNo' => '906BAR05',
                    'parkingLotName' => 'KPP1',
                    'pointId' => 'ANPR-20-11',
                    'pointName' => 'ANPR-20-11',
                    'channelId' => '1000046$1$0$0',
                    'channelName' => 'ANPR-20-11',
                    'vehiclePicture' => 'http://10.210.0.250/vehicle.jpg',
                    'plateNoPicture' => 'http://10.210.0.250/plate.jpg',
                    'captureTime' => '1775537635237',
                    'carBrand' => '11',
                    'carColor' => '0',
                    'vehicleType' => '5',
                ],
            ], JSON_THROW_ON_ERROR)),
        ], $history);

        $service = new DssCaptureService(
            $authService,
            app(DssDeviceSyncService::class),
            new DssMediaService(),
            new DssStructuredLogger(),
            $client,
        );

        $result = $service->handleAlarmEvent([
            'callbackType' => 1,
            'alarmCode' => '{58e60b7d5d3247d3b3aba6546b2c4b0a}',
            'sourceCode' => '2',
            'sourceName' => 'KPP1',
            'alarmType' => '10708',
            'alarmTime' => '1775537635',
            'alarmPictures' => ['https://10.210.0.250/alarm.jpg'],
        ]);

        $this->assertTrue($result['success']);
        $this->assertSame(1, $result['processed']);
        $this->assertSame('/eams/api/v1.1/alarm/record/entrance/detail', $history[0]['request']->getUri()->getPath());
        $this->assertStringContainsString('alarmCode=%7B58e60b7d5d3247d3b3aba6546b2c4b0a%7D', $history[0]['request']->getUri()->getQuery());

        $capture = VehicleCapture::query()->firstOrFail();
        $this->assertSame('906BAR05', $capture->plateNo);
        $this->assertSame('1775537635', $capture->captureTime);
        $this->assertSame('{58e60b7d5d3247d3b3aba6546b2c4b0a}', $capture->dss_alarm_code);
        $this->assertSame('10708', $capture->dss_alarm_type);
        $this->assertSame('KPP1', $capture->dss_alarm_source_name);
        $this->assertSame('2', $capture->dss_alarm_source_code);
        $this->assertSame('906BAR05', $capture->dss_alarm_detail_payload['plateNo']);
    }

    protected function tearDown(): void
    {
        Mockery::close();

        parent::tearDown();
    }
}