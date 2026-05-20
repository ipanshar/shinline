<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class FaceIdReferenceImageController extends Controller
{
    public function show(string $path): StreamedResponse
    {
        $normalizedPath = str_replace('\\', '/', trim($path, '/'));

        if ($normalizedPath === '' || str_contains($normalizedPath, '..')) {
            abort(404);
        }

        if (! Storage::disk('faceid_references')->exists($normalizedPath)) {
            abort(404);
        }

        return Storage::disk('faceid_references')->response($normalizedPath);
    }
}