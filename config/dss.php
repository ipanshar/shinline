<?php

return [
    'polling' => [
        'mode' => env('DSS_POLLING_MODE', 'polling-bridge'),
        'capture_interval_seconds' => (int) env('DSS_CAPTURE_POLLING_INTERVAL_SECONDS', 600),
        'capture_history_window_seconds' => (int) env('DSS_CAPTURE_HISTORY_WINDOW_SECONDS', 900),
    ],

    'health' => [
        'heartbeat_file' => env('DSS_HEARTBEAT_FILE', 'app/dss/daemon-heartbeat.json'),
        'max_age_seconds' => (int) env('DSS_HEARTBEAT_MAX_AGE', 120),
        'max_keepalive_age_seconds' => (int) env('DSS_KEEPALIVE_MAX_AGE', 180),
        'max_capture_age_seconds' => (int) env('DSS_CAPTURE_MAX_AGE', 900),
        'restart_service' => env('DSS_RESTART_SERVICE'),
        'nssm_path' => env('DSS_NSSM_PATH'),
    ],

    'alarms' => [
        'unknown_vehicle_type' => env('DSS_UNKNOWN_VEHICLE_ALARM_TYPE', '10708'),
    ],

    'endpoints' => [
        'alarm_entrance_detail' => env('DSS_ALARM_ENTRANCE_DETAIL_ENDPOINT', '/eams/api/v1.1/alarm/record/entrance/detail'),
    ],

    'cache' => [
        'lookup_ttl_seconds' => (int) env('DSS_LOOKUP_CACHE_TTL', 60),
        'status_ttl_seconds' => (int) env('DSS_STATUS_CACHE_TTL', 300),
        'truck_lookup_ttl_seconds' => (int) env('DSS_TRUCK_LOOKUP_CACHE_TTL', 30),
    ],

    'queues' => [
        'enrichment' => env('DSS_QUEUE_ENRICHMENT', 'dss-enrichment'),
        'media' => env('DSS_QUEUE_MEDIA', 'dss-media'),
        'notifications' => env('DSS_QUEUE_NOTIFICATIONS', 'dss-notifications'),
    ],

    'mqtt' => [
        'topic_pattern' => env('DSS_MQTT_TOPIC_PATTERN', 'mq.event.msg.topic.%s'),
        'event_topic_pattern' => env('DSS_MQTT_EVENT_TOPIC_PATTERN', env('DSS_MQTT_TOPIC_PATTERN', 'mq.event.msg.topic.%s')),
        'alarm_topic_pattern' => env('DSS_MQTT_ALARM_TOPIC_PATTERN', 'mq.alarm.msg.topic.%s'),
        'alarm_group_topic_pattern' => env('DSS_MQTT_ALARM_GROUP_TOPIC_PATTERN', 'mq.alarm.msg.group.topic.%s'),
        'common_topic' => env('DSS_MQTT_COMMON_TOPIC', 'mq.common.msg.topic'),
        'topic_user_id' => env('DSS_MQTT_TOPIC_USER_ID'),
        'topic_user_group_id' => env('DSS_MQTT_TOPIC_USER_GROUP_ID'),
        'client_id' => env('DSS_MQTT_CLIENT_ID'),
        'client_id_mode' => env('DSS_MQTT_CLIENT_ID_MODE', 'user-id'),
        'client_id_prefix' => env('DSS_MQTT_CLIENT_ID_PREFIX', 'shinline-dss-'),
        'qos' => (int) env('DSS_MQTT_QOS', 0),
        'connect_timeout' => (int) env('DSS_MQTT_CONNECT_TIMEOUT', 10),
        'socket_timeout' => (int) env('DSS_MQTT_SOCKET_TIMEOUT', 5),
        'keep_alive_interval' => (int) env('DSS_MQTT_KEEP_ALIVE_INTERVAL', 10),
        'reconnect_automatically' => filter_var(env('DSS_MQTT_RECONNECT_AUTOMATICALLY', true), FILTER_VALIDATE_BOOL),
        'max_reconnect_attempts' => (int) env('DSS_MQTT_MAX_RECONNECT_ATTEMPTS', 10),
        'delay_between_reconnect_attempts_ms' => (int) env('DSS_MQTT_DELAY_BETWEEN_RECONNECT_ATTEMPTS_MS', 1000),
        'tls_verify_peer' => filter_var(env('DSS_MQTT_TLS_VERIFY_PEER', false), FILTER_VALIDATE_BOOL),
        'tls_verify_peer_name' => filter_var(env('DSS_MQTT_TLS_VERIFY_PEER_NAME', false), FILTER_VALIDATE_BOOL),
        'tls_allow_self_signed' => filter_var(env('DSS_MQTT_TLS_ALLOW_SELF_SIGNED', true), FILTER_VALIDATE_BOOL),
        'listen_event_name' => env('DSS_MQTT_LISTEN_EVENT_NAME', 'ipms.entrance.notifyVehicleCaptureInfo'),
        'include_slash_variants' => filter_var(env('DSS_MQTT_INCLUDE_SLASH_VARIANTS', false), FILTER_VALIDATE_BOOL),
        'diagnostic_heartbeat_seconds' => (int) env('DSS_MQTT_DIAGNOSTIC_HEARTBEAT_SECONDS', 0),
    ],

    'retention' => [
        'archive_disk' => env('DSS_ARCHIVE_DISK', 'local'),
        'vehicle_captures_days' => (int) env('DSS_VEHICLE_CAPTURES_RETENTION_DAYS', 90),
        'truck_zone_history_days' => (int) env('DSS_TRUCK_ZONE_HISTORY_RETENTION_DAYS', 180),
        'chunk_size' => (int) env('DSS_ARCHIVE_CHUNK_SIZE', 500),
    ],

    'monitoring' => [
        'pending_visitors_window_minutes' => (int) env('DSS_PENDING_VISITORS_WINDOW_MINUTES', 60),
        'pending_visitors_alert_threshold' => (int) env('DSS_PENDING_VISITORS_ALERT_THRESHOLD', 10),
        'auth_failures_alert_threshold' => (int) env('DSS_AUTH_FAILURES_ALERT_THRESHOLD', 3),
        'alert_cooldown_minutes' => (int) env('DSS_ALERT_COOLDOWN_MINUTES', 15),
        'telegram_min_severity' => env('DSS_TELEGRAM_MIN_SEVERITY', 'critical'),
    ],

    'permit_vehicle_sync' => [
        'enable_survey_group' => env('DSS_PERMIT_ENABLE_SURVEY_GROUP', '0'),
        'enable_entrance_group' => env('DSS_PERMIT_ENABLE_ENTRANCE_GROUP', '1'),
        'org_code' => env('DSS_PERMIT_ORG_CODE', '001001'),
        'org_name' => env('DSS_PERMIT_ORG_NAME', 'Shin-Line'),
        'person_id' => env('DSS_PERMIT_PERSON_ID', '1'),
        'batch_delay_ms' => (int) env('DSS_PERMIT_BATCH_DELAY_MS', 8000),
        'max_batch_size' => (int) env('DSS_PERMIT_MAX_BATCH_SIZE', 28),
        'retry_attempts' => (int) env('DSS_PERMIT_RETRY_ATTEMPTS', 3),
        'retry_delay_ms' => (int) env('DSS_PERMIT_RETRY_DELAY_MS', 1000),
        'person_remark' => env('DSS_PERMIT_PERSON_REMARK', ''),
        'vehicle_color' => env('DSS_PERMIT_VEHICLE_COLOR', '100'),
        'vehicle_brand' => env('DSS_PERMIT_VEHICLE_BRAND', '-1'),
        'lookup_filter_authority_org' => env('DSS_PERMIT_LOOKUP_FILTER_AUTHORITY_ORG', '0'),
        'entrance_long_term' => env('DSS_PERMIT_ENTRANCE_LONG_TERM', '1'),
        'entrance_start_time' => env('DSS_PERMIT_ENTRANCE_START_TIME', '-1'),
        'entrance_end_time' => env('DSS_PERMIT_ENTRANCE_END_TIME', '-1'),
        'entrance_groups' => [
            [
                'parking_lot_id' => env('DSS_PERMIT_PARKING_LOT_ID', '2'),
                'entrance_group_ids' => array_values(array_filter(array_map('trim', explode(',', (string) env('DSS_PERMIT_ENTRANCE_GROUP_IDS', '14'))))),
                'entrance_long_term' => env('DSS_PERMIT_GROUP_ENTRANCE_LONG_TERM', '1'),
                'entrance_start_time' => env('DSS_PERMIT_GROUP_ENTRANCE_START_TIME', '-1'),
                'entrance_end_time' => env('DSS_PERMIT_GROUP_ENTRANCE_END_TIME', '-1'),
            ],
        ],
    ],
];