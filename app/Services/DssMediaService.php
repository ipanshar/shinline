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

        if (blank($this->credential)) {
            return;
        }

        $needsCapturePicture = $vehicleCapture->imageDownload == 0 && filled($vehicleCapture->capturePicture);
        $needsPlatePicture = blank($vehicleCapture->local_plateNoPicture) && filled($vehicleCapture->plateNoPicture);

        if (!$needsCapturePicture && !$needsPlatePicture) {
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

        if (blank($this->credential)) {
            return;
        }

        $updated = false;

        if ($vehicleCapture->imageDownload == 0 && filled($vehicleCapture->capturePicture)) {
            $capturePictureUrl = $vehicleCapture->capturePicture . '?token=' . $this->credential;
            $response = Http::withoutVerifying()->get($capturePictureUrl);

            if ($response->successful()) {
                $fileName = $vehicleCapture->id . '.jpg';
                Storage::disk('public')->put("images/vehicle/capture/{$fileName}", $response->body());

                $vehicleCapture->local_capturePicture = "images/vehicle/capture/{$fileName}";
                $vehicleCapture->imageDownload = 1;
                $updated = true;
            }
        }

        if (blank($vehicleCapture->local_plateNoPicture) && filled($vehicleCapture->plateNoPicture)) {
            $platePictureUrl = $vehicleCapture->plateNoPicture . '?token=' . $this->credential;
            $plateResponse = Http::withoutVerifying()->get($platePictureUrl);

            if ($plateResponse->successful()) {
                $plateFileName = $vehicleCapture->id . '.jpg';
                Storage::disk('public')->put("images/vehicle/plate/{$plateFileName}", $plateResponse->body());

                $vehicleCapture->local_plateNoPicture = "images/vehicle/plate/{$plateFileName}";
                $updated = true;
            }
        }

        if ($updated) {
            $vehicleCapture->save();
        }
    }
}