<?php

namespace App\Services;

use App\Jobs\DownloadVehicleCaptureImageJob;
use App\Models\VehicleCapture;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

class DssMediaService extends DssBaseService
{
    private const MAX_IMAGE_WIDTH = 1920;
    private const MAX_IMAGE_HEIGHT = 1080;
    private const JPEG_QUALITY = 75;

    public function ensureVehicleCaptureImage(VehicleCapture $vehicleCapture): void
    {
        $this->refreshContext();

        if (blank($this->credential)) {
            return;
        }

        $needsCapturePicture = filled($vehicleCapture->capturePicture)
            && (!$this->hasPublicFile($vehicleCapture->local_capturePicture) || (int) $vehicleCapture->imageDownload === 0);
        $needsPlatePicture = filled($vehicleCapture->plateNoPicture)
            && !$this->hasPublicFile($vehicleCapture->local_plateNoPicture);

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

        if (filled($vehicleCapture->capturePicture)
            && (!$this->hasPublicFile($vehicleCapture->local_capturePicture) || (int) $vehicleCapture->imageDownload === 0)) {
            $capturePictureUrl = $vehicleCapture->capturePicture . '?token=' . $this->credential;
            $response = Http::withoutVerifying()->get($capturePictureUrl);

            if ($response->successful()) {
                $fileName = $vehicleCapture->id . '.jpg';
                Storage::disk('public')->put("images/vehicle/capture/{$fileName}", $this->optimizeImageForStorage($response->body()));

                $vehicleCapture->local_capturePicture = "images/vehicle/capture/{$fileName}";
                $vehicleCapture->imageDownload = 1;
                $updated = true;
            }
        }

        if (filled($vehicleCapture->plateNoPicture) && !$this->hasPublicFile($vehicleCapture->local_plateNoPicture)) {
            $platePictureUrl = $vehicleCapture->plateNoPicture . '?token=' . $this->credential;
            $plateResponse = Http::withoutVerifying()->get($platePictureUrl);

            if ($plateResponse->successful()) {
                $plateFileName = $vehicleCapture->id . '.jpg';
                Storage::disk('public')->put("images/vehicle/plate/{$plateFileName}", $this->optimizeImageForStorage($plateResponse->body()));

                $vehicleCapture->local_plateNoPicture = "images/vehicle/plate/{$plateFileName}";
                $updated = true;
            }
        }

        if ($updated) {
            $vehicleCapture->save();
        }
    }

    private function hasPublicFile(?string $path): bool
    {
        if (blank($path)) {
            return false;
        }

        return Storage::disk('public')->exists(ltrim((string) $path, '/'));
    }

    private function optimizeImageForStorage(string $imageBytes): string
    {
        if ($imageBytes === '' || !function_exists('imagecreatefromstring') || !function_exists('imagejpeg')) {
            return $imageBytes;
        }

        $sourceImage = @imagecreatefromstring($imageBytes);

        if ($sourceImage === false) {
            return $imageBytes;
        }

        $sourceWidth = imagesx($sourceImage);
        $sourceHeight = imagesy($sourceImage);

        if ($sourceWidth <= 0 || $sourceHeight <= 0) {
            imagedestroy($sourceImage);
            return $imageBytes;
        }

        $scale = min(
            self::MAX_IMAGE_WIDTH / $sourceWidth,
            self::MAX_IMAGE_HEIGHT / $sourceHeight,
            1,
        );

        $targetWidth = max(1, (int) round($sourceWidth * $scale));
        $targetHeight = max(1, (int) round($sourceHeight * $scale));
        $targetImage = $sourceImage;

        if ($scale < 1) {
            $targetImage = imagecreatetruecolor($targetWidth, $targetHeight);

            if ($targetImage === false) {
                imagedestroy($sourceImage);
                return $imageBytes;
            }

            $background = imagecolorallocate($targetImage, 255, 255, 255);
            imagefill($targetImage, 0, 0, $background);
            imagecopyresampled($targetImage, $sourceImage, 0, 0, 0, 0, $targetWidth, $targetHeight, $sourceWidth, $sourceHeight);
        }

        ob_start();
        imagejpeg($targetImage, null, self::JPEG_QUALITY);
        $optimizedImage = ob_get_clean();

        if ($targetImage !== $sourceImage) {
            imagedestroy($targetImage);
        }

        imagedestroy($sourceImage);

        if (!is_string($optimizedImage) || $optimizedImage === '') {
            return $imageBytes;
        }

        if ($scale >= 1 && strlen($optimizedImage) >= strlen($imageBytes)) {
            return $imageBytes;
        }

        return $optimizedImage;
    }
}