<?php

namespace App\Console\Commands;

use App\Models\Truck;
use App\Models\TruckCategory;
use App\Services\WikimediaEquipmentImageService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class SyncSpectechImagesFromWikimedia extends Command
{
    protected $signature = 'spectech:sync-images {--limit=20} {--force} {--dry-run}';

    protected $description = 'Fetch high-quality special equipment images from Wikimedia Commons';

    public function handle(WikimediaEquipmentImageService $service): int
    {
        $limit = max((int) $this->option('limit'), 1);
        $force = (bool) $this->option('force');
        $dryRun = (bool) $this->option('dry-run');

        $categoryId = TruckCategory::query()->where('name', 'Спец техника')->value('id');

        $query = Truck::query()->orderBy('id');
        if ($categoryId !== null) {
            $query->where('truck_category_id', $categoryId);
        }

        if (!$force) {
            $query->where(function ($q) {
                $q->whereNull('image_url')->orWhere('image_url', '');
            });
        }

        $trucks = $query->limit($limit)->get();
        if ($trucks->isEmpty()) {
            $this->info('No trucks to update.');
            return self::SUCCESS;
        }

        $updated = 0;

        foreach ($trucks as $truck) {
            $search = $this->buildSearchQuery($truck);
            $this->line("[#{$truck->id}] {$truck->name} -> {$search}");

            $best = $service->findBestImage($search);
            if ($best === null) {
                $best = $service->findBestImage($this->buildFallbackSearchQuery($truck));
            }
            if ($best === null) {
                $this->warn('  no suitable image found');
                continue;
            }

            $filename = $this->buildFilename($truck, $best['mime']);
            $relativePath = 'equipment/' . $filename;
            $publicUrl = Storage::disk('public')->url($relativePath);

            if ($dryRun) {
                $this->line('  [dry-run] ' . $publicUrl);
                continue;
            }

            $imageBody = $this->downloadBinary($best['url']);
            if ($imageBody === null) {
                $this->warn('  download failed');
                continue;
            }

            Storage::disk('public')->put($relativePath, $imageBody);
            $truck->image_url = $publicUrl;
            $truck->save();

            $updated++;
            $this->info('  saved: ' . $publicUrl);
        }

        $this->info("Updated: {$updated}");

        return self::SUCCESS;
    }

    private function buildSearchQuery(Truck $truck): string
    {
        $name = trim((string) $truck->name);
        $plate = trim((string) $truck->plate_number);

        return trim($name . ' construction equipment ' . $plate);
    }

    private function buildFallbackSearchQuery(Truck $truck): string
    {
        $name = mb_strtolower(trim((string) $truck->name));

        $map = [
            'автокран' => 'truck crane',
            'кран-манипулятор' => 'knuckle boom crane truck',
            'манипулятор' => 'knuckle boom crane truck',
            'бобкат' => 'bobcat skid steer loader',
            'погрузчик' => 'construction loader',
            'самосвал' => 'dump truck construction',
            'экскаватор' => 'excavator construction',
        ];

        foreach ($map as $needle => $replacement) {
            if (Str::contains($name, $needle)) {
                return $replacement;
            }
        }

        return trim((string) $truck->name . ' heavy equipment');
    }

    private function downloadBinary(string $url): ?string
    {
        try {
            $context = stream_context_create([
                'http' => [
                    'method' => 'GET',
                    'timeout' => 30,
                    'ignore_errors' => true,
                    'header' => "User-Agent: shinline/1.0\r\n",
                ],
            ]);

            $body = @file_get_contents($url, false, $context);
            if ($body === false || $body === '') {
                return null;
            }

            return $body;
        } catch (\Throwable) {
            return null;
        }
    }

    private function buildFilename(Truck $truck, string $mime): string
    {
        $ext = match ($mime) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => 'jpg',
        };

        $base = Str::slug($truck->name ?: 'equipment-' . $truck->id);
        if ($base === '') {
            $base = 'equipment-' . $truck->id;
        }

        return $base . '-' . $truck->id . '.' . $ext;
    }
}



