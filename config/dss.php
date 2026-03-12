<?php

return [
    'polling' => [
        'mode' => env('DSS_POLLING_MODE', 'polling-bridge'),
    ],

    'health' => [
        'heartbeat_file' => env('DSS_HEARTBEAT_FILE', 'app/dss/daemon-heartbeat.json'),
        'max_age_seconds' => (int) env('DSS_HEARTBEAT_MAX_AGE', 120),
        'max_keepalive_age_seconds' => (int) env('DSS_KEEPALIVE_MAX_AGE', 180),
        'max_capture_age_seconds' => (int) env('DSS_CAPTURE_MAX_AGE', 180),
        'restart_service' => env('DSS_RESTART_SERVICE'),
        'nssm_path' => env('DSS_NSSM_PATH'),
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
    ],
];