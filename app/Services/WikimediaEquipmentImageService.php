<?php

namespace App\Services;

use Illuminate\Support\Str;

class WikimediaEquipmentImageService
{
    /**
     * Поиск лучшего изображения техники на Wikimedia Commons.
     *
     * @return array{url:string,mime:string,width:int,height:int,title:string,license:?string}|null
     */
    public function findBestImage(string $query): ?array
    {
        $url = 'https://commons.wikimedia.org/w/api.php?' . http_build_query([
            'action' => 'query',
            'format' => 'json',
            'generator' => 'search',
            'gsrnamespace' => 6,
            'gsrsearch' => $query,
            'gsrlimit' => 12,
            'prop' => 'imageinfo',
            'iiprop' => 'url|size|mime|extmetadata',
            'iiurlwidth' => 1600,
        ]);

        $json = $this->safeGetJson($url);
        if ($json === null) {
            return null;
        }

        $pages = array_values((array) data_get($json, 'query.pages', []));
        if (empty($pages)) {
            return null;
        }

        $candidates = [];

        foreach ($pages as $page) {
            $imageInfo = data_get($page, 'imageinfo.0');
            if (!is_array($imageInfo)) {
                continue;
            }

            $url = (string) ($imageInfo['thumburl'] ?? $imageInfo['url'] ?? '');
            $mime = (string) ($imageInfo['mime'] ?? '');
            $width = (int) ($imageInfo['thumbwidth'] ?? $imageInfo['width'] ?? 0);
            $height = (int) ($imageInfo['thumbheight'] ?? $imageInfo['height'] ?? 0);
            $title = (string) ($page['title'] ?? '');

            if ($url === '' || !Str::startsWith($mime, 'image/')) {
                continue;
            }

            if ($width < 900 || $height < 600) {
                continue;
            }

            $rawLicense = data_get($imageInfo, 'extmetadata.LicenseShortName.value');
            $license = is_string($rawLicense) ? trim(strip_tags($rawLicense)) : null;

            if (!$this->isAllowedLicense($license)) {
                continue;
            }

            $score = ($width * $height) + ($mime === 'image/jpeg' ? 50000 : 0);

            $candidates[] = [
                'url' => $url,
                'mime' => $mime,
                'width' => $width,
                'height' => $height,
                'title' => $title,
                'license' => $license,
                'score' => $score,
            ];
        }

        if (empty($candidates)) {
            return null;
        }

        usort($candidates, fn(array $a, array $b) => $b['score'] <=> $a['score']);

        $best = $candidates[0];

        return [
            'url' => $best['url'],
            'mime' => $best['mime'],
            'width' => $best['width'],
            'height' => $best['height'],
            'title' => $best['title'],
            'license' => $best['license'],
        ];
    }

    private function safeGetJson(string $url): ?array
    {
        try {
            $context = stream_context_create([
                'http' => [
                    'method' => 'GET',
                    'timeout' => 20,
                    'ignore_errors' => true,
                    'header' => "Accept: application/json\r\nUser-Agent: shinline/1.0\r\n",
                ],
            ]);

            $body = @file_get_contents($url, false, $context);
            if ($body === false || $body === '') {
                return null;
            }

            $decoded = json_decode($body, true);
            return is_array($decoded) ? $decoded : null;
        } catch (\Throwable) {
            return null;
        }
    }

    private function isAllowedLicense(?string $license): bool
    {
        if ($license === null || $license === '') {
            return false;
        }

        $normalized = mb_strtolower($license);

        return Str::contains($normalized, [
            'cc by',
            'cc-by',
            'cc by-sa',
            'cc-by-sa',
            'public domain',
        ]);
    }
}


