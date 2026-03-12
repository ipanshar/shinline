<?php

namespace App\Services;

use App\Models\DssApi;
use App\Models\DssSetings;
use GuzzleHttp\Client;

class DssBaseService
{
    protected Client $client;
    protected ?DssSetings $dssSettings = null;
    protected ?string $baseUrl = null;
    protected ?string $token = null;
    protected ?string $credential = null;
    protected ?int $subhour = null;

    public function __construct(?Client $client = null)
    {
        $this->client = $client ?? new Client();
        $this->refreshContext();
    }

    protected function refreshContext(): void
    {
        $this->dssSettings = DssSetings::first();
        $this->baseUrl = $this->dssSettings?->base_url;
        $this->token = $this->dssSettings?->token;
        $this->credential = $this->dssSettings?->credential;
        $this->subhour = $this->dssSettings?->subhour;
    }

    protected function ensureSettings(array $requiredFields = []): ?array
    {
        $this->refreshContext();

        if (!$this->dssSettings) {
            return ['error' => 'DSS settings not found'];
        }

        foreach ($requiredFields as $field) {
            if (blank($this->dssSettings->{$field})) {
                return ['error' => "DSS setting '{$field}' is not configured"];
            }
        }

        return null;
    }

    protected function getApiDefinition(string $apiName): ?DssApi
    {
        $this->refreshContext();

        if (!$this->dssSettings) {
            return null;
        }

        return DssApi::where('api_name', $apiName)
            ->where('dss_setings_id', $this->dssSettings->id)
            ->first();
    }

    protected function getJsonHeaders(?string $token = null): array
    {
        return [
            'X-Subject-Token' => $token ?? $this->token,
            'Content-Type' => 'application/json',
            'Charset' => 'utf-8',
        ];
    }
}