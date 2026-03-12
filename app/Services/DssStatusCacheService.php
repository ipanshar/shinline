<?php

namespace App\Services;

use App\Models\Status;

class DssStatusCacheService
{
    private array $modelCache = [];
    private array $idCache = [];

    public function get(string $key): ?Status
    {
        return $this->remember($this->modelCache, $key, function () use ($key) {
            return Status::where('key', $key)->first();
        });
    }

    public function getId(string $key): ?int
    {
        return $this->remember($this->idCache, $key, function () use ($key) {
            return Status::where('key', $key)->value('id');
        });
    }

    private function remember(array &$cache, string $key, callable $resolver)
    {
        $now = time();
        $ttl = max(1, (int) config('dss.cache.status_ttl_seconds', 300));

        if (isset($cache[$key]) && $cache[$key]['expires_at'] > $now) {
            return $cache[$key]['value'];
        }

        $value = $resolver();
        $cache[$key] = [
            'value' => $value,
            'expires_at' => $now + $ttl,
        ];

        return $value;
    }
}