<?php

namespace App\Services;

use App\Jobs\DownloadVehicleCaptureImageJob;
use App\Models\VehicleCapture;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

class DssMediaService extends DssBaseService
{
    public function ensureVehicleCaptureImage(VehicleCapture $vehicleCapture): void
    {
        $this->refreshContext();

        if ($vehicleCapture->imageDownload != 0 || blank($vehicleCapture->capturePicture) || blank($this->credential)) {
            return;
        }

        DownloadVehicleCaptureImageJob::dispatch($vehicleCapture->id);
    }

    public function downloadVehicleCaptureImageById(int $vehicleCaptureId): void
    {
        $vehicleCapture = VehicleCapture::find($vehicleCaptureId);
        if (!$vehicleCapture) {
            return;
        }

        $this->downloadVehicleCaptureImage($vehicleCapture);
    }

    public function downloadVehicleCaptureImage(VehicleCapture $vehicleCapture): void
    {
        $this->refreshContext();

        if ($vehicleCapture->imageDownload != 0 || blank($vehicleCapture->capturePicture) || blank($this->credential)) {
            return;
        }

        $capturePictureUrl = $vehicleCapture->capturePicture . '?token=' . $this->credential;
        $response = Http::withoutVerifying()->get($capturePictureUrl);

        if (!$response->successful()) {
            return;
        }

        $fileName = $vehicleCapture->id . '.jpg';
        Storage::disk('public')->put("images/vehicle/capture/{$fileName}", $response->body());

        $vehicleCapture->local_capturePicture = "images/vehicle/capture/{$fileName}";
        $vehicleCapture->imageDownload = 1;
        $vehicleCapture->save();
    }
}