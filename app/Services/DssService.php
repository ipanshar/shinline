<?php

namespace App\Services;

class DssService
{
    public function __construct(
        private DssAuthService $authService,
        private DssCaptureService $captureService,
        private DssMqConfigService $mqConfigService,
        private DssPersonService $personService,
        private DssMediaService $mediaService,
        private DssRetentionService $retentionService,
    ) {
    }

    public function dssAutorize(): array
    {
        return $this->authService->dssAutorize();
    }

    public function dssKeepAlive(): array
    {
        return $this->authService->dssKeepAlive();
    }

    public function dssUpdateToken(): array
    {
        return $this->authService->dssUpdateToken();
    }

    public function dssVehicleCapture(): array
    {
        return $this->captureService->dssVehicleCapture();
    }

    public function dssMqConfig(): array
    {
        return $this->mqConfigService->getMqConfig();
    }

    public function dssAddPerson(array $personData): array
    {
        return $this->personService->dssAddPerson($personData);
    }

    public function dssUnauthorize(): array
    {
        return $this->authService->dssUnauthorize();
    }

    public function deleteOldVehicleCaptures(): array
    {
        return $this->retentionService->archiveOldVehicleCaptures();
    }

    public function archiveDssData(): array
    {
        return $this->retentionService->archiveAll();
    }
}
