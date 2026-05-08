<?php

namespace Tests\Feature;

use App\Services\DssMediaService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\BuildsDssDomain;
use Tests\TestCase;

class DssMediaServiceTest extends TestCase
{
    use BuildsDssDomain;
    use RefreshDatabase;

    public function test_download_vehicle_capture_image_downscales_images_to_full_hd(): void
    {
        if (!function_exists('imagecreatetruecolor') || !function_exists('imagejpeg')) {
            $this->markTestSkipped('GD extension is required for this test.');
        }

        Storage::fake('public');
        $this->createDssSettings([
            'credential' => 'live-credential',
        ]);

        $device = $this->createDevice();
        $vehicleCapture = $this->createVehicleCapture($device, [
            'imageDownload' => 0,
            'local_capturePicture' => null,
            'local_plateNoPicture' => null,
            'capturePicture' => 'https://example.test/capture.jpg',
            'plateNoPicture' => 'https://example.test/plate.jpg',
        ]);

        $largeJpeg = $this->makeJpegImage(2688, 1584);

        Http::fake([
            'https://example.test/*' => Http::response($largeJpeg, 200, ['Content-Type' => 'image/jpeg']),
        ]);

        app(DssMediaService::class)->downloadVehicleCaptureImage($vehicleCapture);

        $vehicleCapture->refresh();

        $this->assertSame(1, (int) $vehicleCapture->imageDownload);
        $this->assertSame('images/vehicle/capture/' . $vehicleCapture->id . '.jpg', $vehicleCapture->local_capturePicture);
        $this->assertTrue(Storage::disk('public')->exists($vehicleCapture->local_capturePicture));

        $storedCapture = Storage::disk('public')->get($vehicleCapture->local_capturePicture);
        $storedCaptureInfo = getimagesizefromstring($storedCapture);

        $this->assertIsArray($storedCaptureInfo);
        $this->assertLessThanOrEqual(1920, $storedCaptureInfo[0]);
        $this->assertLessThanOrEqual(1080, $storedCaptureInfo[1]);
        $this->assertLessThan(strlen($largeJpeg), strlen($storedCapture));

        $this->assertSame('images/vehicle/plate/' . $vehicleCapture->id . '.jpg', $vehicleCapture->local_plateNoPicture);
        $this->assertTrue(Storage::disk('public')->exists($vehicleCapture->local_plateNoPicture));
    }

    private function makeJpegImage(int $width, int $height): string
    {
        $image = imagecreatetruecolor($width, $height);

        if ($image === false) {
            $this->fail('Не удалось создать тестовое изображение через GD.');
        }

        $background = imagecolorallocate($image, 24, 27, 41);
        $truckBody = imagecolorallocate($image, 232, 235, 241);
        $accent = imagecolorallocate($image, 245, 158, 11);

        imagefill($image, 0, 0, $background);
        imagefilledrectangle($image, 220, 260, $width - 160, $height - 240, $truckBody);
        imagefilledrectangle($image, 120, (int) ($height * 0.72), $width - 80, $height - 80, $accent);
        imagefilledellipse($image, 520, $height - 180, 240, 240, $background);
        imagefilledellipse($image, $width - 420, $height - 180, 240, 240, $background);

        ob_start();
        imagejpeg($image, null, 96);
        $jpeg = (string) ob_get_clean();
        imagedestroy($image);

        return $jpeg;
    }
}