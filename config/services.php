<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'faceid' => [
        'base_url' => env('FACEID_API_URL', 'http://127.0.0.1:8008'),
        'timeout' => env('FACEID_API_TIMEOUT', 12),
        'connect_timeout' => env('FACEID_API_CONNECT_TIMEOUT', 5),
        'rebuild_wait_timeout_ms' => env('FACEID_REBUILD_WAIT_TIMEOUT_MS', 60000),
        'rebuild_wait_poll_interval_ms' => env('FACEID_REBUILD_WAIT_POLL_INTERVAL_MS', 250),
        'sigur_sync_source' => env('FACEID_SIGUR_SYNC_SOURCE', 'dump'),
        'sigur_connection' => env('FACEID_SIGUR_DB_CONNECTION', 'sigur'),
        'sigur_removal_grace_days' => env('FACEID_SIGUR_REMOVAL_GRACE_DAYS', 7),
        'python_executable' => env('FACEID_PYTHON_EXECUTABLE', base_path('testFaceID/.venv/Scripts/python.exe')),
        'reference_manifest_path' => env('FACEID_REFERENCE_MANIFEST_PATH', storage_path('app/private/faceid/reference-manifest.json')),
        'import_manifest_path' => env('FACEID_IMPORT_MANIFEST_PATH', storage_path('app/private/faceid/import-manifest.json')),
        'cache_dir' => env('FACEID_CACHE_DIR', base_path('testFaceID/backend/cache')),
        'auto_sync_after_migrate' => env('FACEID_AUTO_SYNC_AFTER_MIGRATE', true),
        'auto_restart_service_after_sync' => env('FACEID_AUTO_RESTART_SERVICE_AFTER_SYNC', false),
        'restart_service' => env('FACEID_RESTART_SERVICE'),
        'nssm_path' => env('FACEID_NSSM_PATH', 'nssm'),
    ],

];
