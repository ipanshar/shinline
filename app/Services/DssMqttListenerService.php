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

    public function listen(
        ?string $userId = null,
        ?string $topicOverride = null,
        ?int $qos = null,
        ?callable $output = null,
        bool $dumpRaw = false,
        bool $includeSlashVariants = false,
        ?int $heartbeatSeconds = null,
    ): void
    {
        $runtime = $this->buildRuntimeConfig($userId, $topicOverride, $qos, $includeSlashVariants);

        if ($runtime['user_group_id'] === '') {
            $output?->__invoke('MQTT notice userGroupId is empty, group topic subscription skipped');
        }

        $mqtt = new MqttClient(
            $runtime['host'],
            $runtime['port'],
            $runtime['client_id'],
            MqttClient::MQTT_3_1_1,
        );

        $output?->__invoke(sprintf(
            'MQTT connect %s:%d userId=%s userGroupId=%s topics=%s',
            $runtime['host'],
            $runtime['port'],
            $runtime['user_id'] !== '' ? $runtime['user_id'] : '-',
            $runtime['user_group_id'] !== '' ? $runtime['user_group_id'] : '-',
            implode(', ', $runtime['topics'])
        ));

        $heartbeatInterval = $heartbeatSeconds ?? (int) config('dss.mqtt.diagnostic_heartbeat_seconds', 0);
        if ($heartbeatInterval > 0) {
            $lastHeartbeatAt = -1;
            $mqtt->registerLoopEventHandler(function (MqttClient $mqttClient, float $elapsedTime) use ($output, $heartbeatInterval, &$lastHeartbeatAt): void {
                $elapsedSeconds = (int) floor($elapsedTime);
                if ($elapsedSeconds <= 0 || $elapsedSeconds === $lastHeartbeatAt || $elapsedSeconds % $heartbeatInterval !== 0) {
                    return;
                }

                $lastHeartbeatAt = $elapsedSeconds;
                $output?->__invoke(sprintf('MQTT heartbeat elapsed=%ds', $elapsedSeconds));
            });
        }

        $mqtt->connect($runtime['connection_settings'], false);
        foreach ($runtime['topics'] as $topic) {
            $mqtt->subscribe($topic, function (string $topic, string $message, bool $retained) use ($output, $dumpRaw) {
                if ($dumpRaw) {
                    $output?->__invoke(sprintf('MQTT raw topic=%s retained=%s payload=%s', $topic, $retained ? '1' : '0', $this->truncateMessage($message)));
                }

                $result = $this->handleRawMessage($topic, $message);

                if (!empty($result['handled'])) {
                    $output?->__invoke(sprintf('MQTT handled topic=%s method=%s captures=%d', $topic, $result['event_name'] ?? 'unknown', (int) ($result['captures_found'] ?? 0)));
                    return;
                }

                if (!empty($result['ignored'])) {
                    $output?->__invoke(sprintf('MQTT ignored topic=%s method=%s reason=%s', $topic, $result['event_name'] ?? 'unknown', $result['reason'] ?? 'unknown'));
                    return;
                }

                if (!empty($result['error'])) {
                    $output?->__invoke(sprintf('MQTT error topic=%s error=%s', $topic, $result['error']));
                }
            }, $runtime['qos']);
        }

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

    public function buildRuntimeConfig(?string $userId = null, ?string $topicOverride = null, ?int $qos = null, bool $includeSlashVariants = false): array
    {
        $mqConfig = $this->mqConfigService->getMqConfig();
        if (isset($mqConfig['error'])) {
            throw new RuntimeException($mqConfig['error']);
        }

        $config = $mqConfig['data'] ?? [];
        [$host, $port] = $this->parseEndpoint((string) ($config['mqtt'] ?? $config['addr'] ?? ''));

        $resolvedUserId = $this->resolveTopicUserId($userId);
        $resolvedUserGroupId = $this->resolveTopicUserGroupId();
        $resolvedTopics = $topicOverride
            ? $this->parseTopicOverride($topicOverride)
            : $this->buildTopics($resolvedUserId, $resolvedUserGroupId, $includeSlashVariants);

        if ($resolvedTopics === []) {
            throw new RuntimeException('MQTT topics are not configured. Provide --topic, --user-id, DSS_MQTT_TOPIC_USER_ID or authorize DSS to store userId/userGroupId');
        }

        return [
            'host' => $host,
            'port' => $port,
            'topic' => $resolvedTopics[0],
            'topics' => $resolvedTopics,
            'user_id' => $resolvedUserId,
            'user_group_id' => $resolvedUserGroupId,
            'include_slash_variants' => $includeSlashVariants,
            'qos' => $qos ?? (int) config('dss.mqtt.qos', 0),
            'client_id' => $this->buildClientId($resolvedUserId, $resolvedUserGroupId),
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
                'event_name' => null,
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

    private function buildTopics(string $userId, string $userGroupId, bool $includeSlashVariants = false): array
    {
        $topics = [];

        if ($userId !== '') {
            $topics[] = sprintf((string) config('dss.mqtt.event_topic_pattern', 'mq.event.msg.topic.%s'), $userId);
            $topics[] = sprintf((string) config('dss.mqtt.alarm_topic_pattern', 'mq.alarm.msg.topic.%s'), $userId);
        }

        if ($userGroupId !== '') {
            $topics[] = sprintf((string) config('dss.mqtt.alarm_group_topic_pattern', 'mq.alarm.msg.group.topic.%s'), $userGroupId);
        }

        $commonTopic = trim((string) config('dss.mqtt.common_topic', 'mq.common.msg.topic'));
        if ($commonTopic !== '') {
            $topics[] = $commonTopic;
        }

        if ($includeSlashVariants || (bool) config('dss.mqtt.include_slash_variants', false)) {
            foreach ($topics as $topic) {
                $slashTopic = $this->toSlashTopic($topic);
                if ($slashTopic !== $topic) {
                    $topics[] = $slashTopic;
                }
            }
        }

        return array_values(array_unique(array_filter(array_map('trim', $topics))));
    }

    private function buildClientId(string $userId, string $userGroupId = ''): string
    {
        $prefix = (string) config('dss.mqtt.client_id_prefix', 'shinline-dss-');
        $suffix = $userId !== '' ? 'u' . $userId . '-' : '';

        if ($suffix === '' && $userGroupId !== '') {
            $suffix = 'g' . $userGroupId . '-';
        }

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

    private function resolveTopicUserGroupId(): string
    {
        $candidates = [
            config('dss.mqtt.topic_user_group_id', ''),
            DssSetings::query()->value('user_group_id'),
        ];

        foreach ($candidates as $candidate) {
            $resolved = trim((string) $candidate);
            if ($resolved !== '') {
                return $resolved;
            }
        }

        return '';
    }

    private function parseTopicOverride(string $topicOverride): array
    {
        $chunks = preg_split('/[,;\r\n]+/', $topicOverride) ?: [];

        return array_values(array_unique(array_filter(array_map(
            static fn (string $topic): string => trim($topic),
            $chunks,
        ))));
    }

    private function truncateMessage(string $message, int $limit = 600): string
    {
        $normalized = preg_replace('/\s+/', ' ', trim($message)) ?? trim($message);

        if (mb_strlen($normalized) <= $limit) {
            return $normalized;
        }

        return mb_substr($normalized, 0, $limit) . '...';
    }

    private function toSlashTopic(string $topic): string
    {
        if (str_contains($topic, '/')) {
            return $topic;
        }

        return str_replace('.', '/', $topic);
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