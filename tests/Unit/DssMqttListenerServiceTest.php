<?php

namespace Tests\Unit;

use Illuminate\Foundation\Testing\RefreshDatabase;
use App\Services\DssCaptureService;
use App\Services\DssMqConfigService;
use App\Services\DssMqttListenerService;
use App\Services\DssStructuredLogger;
use Mockery;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class DssMqttListenerServiceTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    public function test_handle_raw_message_processes_notify_vehicle_capture_info_event(): void
    {
        config()->set('dss.mqtt.listen_event_name', 'ipms.entrance.notifyVehicleCaptureInfo');

        $mqConfigService = Mockery::mock(DssMqConfigService::class);
        $captureService = Mockery::mock(DssCaptureService::class);
        $structuredLogger = Mockery::mock(DssStructuredLogger::class);

        $captureService->shouldReceive('ingestRealtimeCaptureItems')
            ->once()
            ->with(Mockery::on(function (array $items) {
                return count($items) === 1
                    && $items[0]['channelId'] === 'channel-1'
                    && $items[0]['plateNo'] === 'A123BC777';
            }))
            ->andReturn([
                'success' => true,
                'processed' => 1,
                'duplicates_skipped' => 0,
            ]);

        $structuredLogger->shouldReceive('info')
            ->once()
            ->with('mqtt_message_processed', Mockery::type('array'));

        $service = new DssMqttListenerService($mqConfigService, $captureService, $structuredLogger);

        $result = $service->handleRawMessage('mq.event.msg.topic.100', json_encode([
            'method' => 'ipms.entrance.notifyVehicleCaptureInfo',
            'data' => [
                'captureInfo' => [
                    'channelId' => 'channel-1',
                    'channelName' => 'Camera 1',
                    'plateNo' => 'A123BC777',
                    'captureTime' => 1710000000,
                ],
            ],
        ], JSON_THROW_ON_ERROR));

        $this->assertTrue($result['handled']);
        $this->assertSame(1, $result['captures_found']);
    }

    public function test_build_runtime_config_uses_topic_pattern_and_decrypted_password(): void
    {
        config()->set('dss.mqtt.topic_pattern', 'mq.event.msg.topic.%s');
        config()->set('dss.mqtt.client_id_prefix', 'test-dss-');
        config()->set('dss.mqtt.qos', 1);
        config()->set('dss.mqtt.reconnect_automatically', true);

        $mqConfigService = Mockery::mock(DssMqConfigService::class);
        $captureService = Mockery::mock(DssCaptureService::class);
        $structuredLogger = Mockery::mock(DssStructuredLogger::class);

        $mqConfigService->shouldReceive('getMqConfig')
            ->once()
            ->andReturn([
                'success' => true,
                'data' => [
                    'mqtt' => '10.210.0.250:1883',
                    'userName' => 'consumer',
                    'password_plain' => 'mq-password',
                    'enableTls' => '1',
                ],
            ]);

        $service = new DssMqttListenerService($mqConfigService, $captureService, $structuredLogger);

        $runtime = $service->buildRuntimeConfig('42');

        $this->assertSame('10.210.0.250', $runtime['host']);
        $this->assertSame(1883, $runtime['port']);
        $this->assertSame('mq.event.msg.topic.42', $runtime['topic']);
        $this->assertSame(1, $runtime['qos']);
        $this->assertStringStartsWith('test-dss-42-', $runtime['client_id']);
        $this->assertSame('consumer', $runtime['connection_settings']->getUsername());
        $this->assertSame('mq-password', $runtime['connection_settings']->getPassword());
        $this->assertTrue($runtime['connection_settings']->shouldUseTls());
    }

    public function test_build_runtime_config_falls_back_to_saved_dss_user_id(): void
    {
        $this->createDssSettings([
            'user_id' => '88',
        ]);

        config()->set('dss.mqtt.topic_pattern', 'mq.event.msg.topic.%s');
        config()->set('dss.mqtt.topic_user_id', null);

        $mqConfigService = Mockery::mock(DssMqConfigService::class);
        $captureService = Mockery::mock(DssCaptureService::class);
        $structuredLogger = Mockery::mock(DssStructuredLogger::class);

        $mqConfigService->shouldReceive('getMqConfig')
            ->once()
            ->andReturn([
                'success' => true,
                'data' => [
                    'mqtt' => '10.210.0.250:1883',
                    'userName' => 'consumer',
                    'password_plain' => 'mq-password',
                    'enableTls' => '0',
                ],
            ]);

        $service = new DssMqttListenerService($mqConfigService, $captureService, $structuredLogger);

        $runtime = $service->buildRuntimeConfig();

        $this->assertSame('mq.event.msg.topic.88', $runtime['topic']);
        $this->assertStringStartsWith('shinline-dss-88-', $runtime['client_id']);
    }

    protected function tearDown(): void
    {
        Mockery::close();

        parent::tearDown();
    }
}