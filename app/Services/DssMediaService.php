<?php

namespace App\Services;

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

    public function deleteOldVehicleCaptures(int $days = 90): array
    {
        $threshold = now()->subDays($days);
        $oldCaptures = VehicleCapture::where('captureTime', '<', $threshold->timestamp)->get();

        foreach ($oldCaptures as $capture) {
            if ($capture->local_capturePicture && Storage::disk('public')->exists($capture->local_capturePicture)) {
                Storage::disk('public')->delete($capture->local_capturePicture);
            }

            $capture->delete();
        }

        return ['success' => true, 'deleted_count' => $oldCaptures->count()];
    }
}