<?php

namespace App\Services;

use App\Models\DssSetings;
use PhpMqtt\Client\ConnectionSettings;
use PhpMqtt\Client\MqttClient;
use RuntimeException;

class DssMqttListenerService
{
    public function __construct(
        private DssMqConfigService $mqConfigService,
        private DssCaptureService $captureService,
        private DssStructuredLogger $structuredLogger,
    ) {
    }

    public function listen(?string $userId = null, ?string $topicOverride = null, ?int $qos = null, ?callable $output = null): void
    {
        $runtime = $this->buildRuntimeConfig($userId, $topicOverride, $qos);

        $mqtt = new MqttClient(
            $runtime['host'],
            $runtime['port'],
            $runtime['client_id'],
            MqttClient::MQTT_3_1_1,
        );

        $output?->__invoke(sprintf('MQTT connect %s:%d topic=%s', $runtime['host'], $runtime['port'], $runtime['topic']));

        $mqtt->connect($runtime['connection_settings'], false);
        $mqtt->subscribe($runtime['topic'], function (string $topic, string $message, bool $retained) use ($output) {
            $result = $this->handleRawMessage($topic, $message);

            if (!empty($result['handled'])) {
                $output?->__invoke(sprintf('MQTT handled topic=%s captures=%d', $topic, (int) ($result['captures_found'] ?? 0)));
                return;
            }

            if (!empty($result['ignored'])) {
                $output?->__invoke(sprintf('MQTT ignored topic=%s reason=%s', $topic, $result['reason'] ?? 'unknown'));
                return;
            }

            if (!empty($result['error'])) {
                $output?->__invoke(sprintf('MQTT error topic=%s error=%s', $topic, $result['error']));
            }
        }, $runtime['qos']);

        if (function_exists('pcntl_async_signals') && function_exists('pcntl_signal')) {
            pcntl_async_signals(true);
            pcntl_signal(SIGINT, static function () use ($mqtt) {
                $mqtt->interrupt();
            });
            pcntl_signal(SIGTERM, static function () use ($mqtt) {
                $mqtt->interrupt();
            });
        }

        try {
            $mqtt->loop(true);
        } finally {
            $mqtt->disconnect();
        }
    }

    public function buildRuntimeConfig(?string $userId = null, ?string $topicOverride = null, ?int $qos = null): array
    {
        $mqConfig = $this->mqConfigService->getMqConfig();
        if (isset($mqConfig['error'])) {
            throw new RuntimeException($mqConfig['error']);
        }

        $config = $mqConfig['data'] ?? [];
        [$host, $port] = $this->parseEndpoint((string) ($config['mqtt'] ?? $config['addr'] ?? ''));

        $resolvedUserId = $this->resolveTopicUserId($userId);
        $resolvedTopic = $topicOverride
            ? trim($topicOverride)
            : $this->buildTopic($resolvedUserId);

        if ($resolvedTopic === '') {
            throw new RuntimeException('MQTT topic is not configured. Provide --user-id, DSS_MQTT_TOPIC_USER_ID or authorize DSS to store userId');
        }

        return [
            'host' => $host,
            'port' => $port,
            'topic' => $resolvedTopic,
            'qos' => $qos ?? (int) config('dss.mqtt.qos', 0),
            'client_id' => $this->buildClientId($resolvedUserId),
            'connection_settings' => $this->buildConnectionSettings($config),
            'mq_config' => $config,
        ];
    }

    public function handleRawMessage(string $topic, string $message): array
    {
        $payload = json_decode($message, true);
        if (!is_array($payload)) {
            $this->structuredLogger->warning('mqtt_message_invalid_json', [
                'topic' => $topic,
            ]);

            return [
                'ignored' => true,
                'reason' => 'invalid_json',
            ];
        }

        $eventName = $this->extractEventName($payload);
        $expectedEvent = (string) config('dss.mqtt.listen_event_name', 'ipms.entrance.notifyVehicleCaptureInfo');
        if ($eventName !== null && $eventName !== $expectedEvent) {
            return [
                'ignored' => true,
                'reason' => 'event_not_supported',
                'event_name' => $eventName,
            ];
        }

        $captureItems = $this->extractCaptureItems($payload);
        if ($captureItems === []) {
            return [
                'ignored' => true,
                'reason' => 'no_capture_items',
                'event_name' => $eventName,
            ];
        }

        $result = $this->captureService->ingestRealtimeCaptureItems($captureItems);

        $this->structuredLogger->info('mqtt_message_processed', [
            'topic' => $topic,
            'event_name' => $eventName,
            'captures_found' => count($captureItems),
            'processed' => $result['processed'] ?? 0,
            'duplicates_skipped' => $result['duplicates_skipped'] ?? 0,
        ]);

        return [
            'handled' => true,
            'event_name' => $eventName,
            'captures_found' => count($captureItems),
            'result' => $result,
        ];
    }

    private function buildConnectionSettings(array $config): ConnectionSettings
    {
        $settings = (new ConnectionSettings())
            ->setUsername((string) ($config['userName'] ?? ''))
            ->setPassword((string) ($config['password_plain'] ?? ''))
            ->setConnectTimeout((int) config('dss.mqtt.connect_timeout', 10))
            ->setSocketTimeout((int) config('dss.mqtt.socket_timeout', 5))
            ->setKeepAliveInterval((int) config('dss.mqtt.keep_alive_interval', 10))
            ->setReconnectAutomatically((bool) config('dss.mqtt.reconnect_automatically', true))
            ->setMaxReconnectAttempts((int) config('dss.mqtt.max_reconnect_attempts', 10))
            ->setDelayBetweenReconnectAttempts((int) config('dss.mqtt.delay_between_reconnect_attempts_ms', 1000));

        if ((string) ($config['enableTls'] ?? '0') === '1') {
            $settings = $settings
                ->setUseTls(true)
                ->setTlsVerifyPeer((bool) config('dss.mqtt.tls_verify_peer', false))
                ->setTlsVerifyPeerName((bool) config('dss.mqtt.tls_verify_peer_name', false))
                ->setTlsSelfSignedAllowed((bool) config('dss.mqtt.tls_allow_self_signed', true));
        }

        return $settings;
    }

    private function buildTopic(string $userId): string
    {
        if ($userId === '') {
            return '';
        }

        return sprintf((string) config('dss.mqtt.topic_pattern', 'mq.event.msg.topic.%s'), $userId);
    }

    private function buildClientId(string $userId): string
    {
        $prefix = (string) config('dss.mqtt.client_id_prefix', 'shinline-dss-');
        $suffix = $userId !== '' ? $userId . '-' : '';

        return $prefix . $suffix . substr(bin2hex(random_bytes(6)), 0, 12);
    }

    private function resolveTopicUserId(?string $userId = null): string
    {
        $candidates = [
            $userId,
            config('dss.mqtt.topic_user_id', ''),
            DssSetings::query()->value('user_id'),
        ];

        foreach ($candidates as $candidate) {
            $resolved = trim((string) $candidate);
            if ($resolved !== '') {
                return $resolved;
            }
        }

        return '';
    }

    private function parseEndpoint(string $endpoint): array
    {
        $trimmed = trim($endpoint);
        if ($trimmed === '') {
            throw new RuntimeException('DSS MQ config did not return mqtt endpoint');
        }

        if (!str_contains($trimmed, '://')) {
            $trimmed = 'tcp://' . $trimmed;
        }

        $parts = parse_url($trimmed);
        $host = $parts['host'] ?? null;
        $port = isset($parts['port']) ? (int) $parts['port'] : 1883;

        if (!is_string($host) || $host === '') {
            throw new RuntimeException('Unable to parse MQTT endpoint from DSS config');
        }

        return [$host, $port];
    }

    private function extractEventName(array $payload): ?string
    {
        return $this->extractStringRecursive($payload, ['method', 'eventType', 'event', 'eventName', 'name']);
    }

    private function extractCaptureItems(array $payload): array
    {
        $results = [];
        $this->collectCaptureItems($payload, $results);

        $unique = [];
        foreach ($results as $item) {
            $signature = implode('|', [
                (string) ($item['channelId'] ?? ''),
                (string) ($item['plateNo'] ?? ''),
                (string) ($item['captureTime'] ?? ''),
            ]);

            if ($signature === '||') {
                continue;
            }

            $unique[$signature] = $item;
        }

        return array_values($unique);
    }

    private function collectCaptureItems(mixed $value, array &$results): void
    {
        if (!is_array($value)) {
            return;
        }

        if ($this->looksLikeCaptureItem($value)) {
            $results[] = $value;
            return;
        }

        foreach ($value as $nested) {
            $this->collectCaptureItems($nested, $results);
        }
    }

    private function looksLikeCaptureItem(array $value): bool
    {
        return isset($value['channelId'], $value['plateNo'], $value['captureTime']);
    }

    private function extractStringRecursive(array $payload, array $keys): ?string
    {
        foreach ($keys as $key) {
            if (isset($payload[$key]) && is_string($payload[$key]) && trim($payload[$key]) !== '') {
                return trim($payload[$key]);
            }
        }

        foreach ($payload as $nested) {
            if (is_array($nested)) {
                $value = $this->extractStringRecursive($nested, $keys);
                if ($value !== null) {
                    return $value;
                }
            }
        }

        return null;
    }
}