<?php

namespace App\Http\Controllers\Api\Greenlog;

use App\Http\Controllers\Controller;
use App\Http\Requests\Greenlog\StorePlantPhotoRequest;
use App\Models\Greenlog\Plant;
use App\Models\Greenlog\PlantPhoto;
use App\Support\Greenlog\ResolvesGreenlogCompany;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class PlantPhotoController extends Controller
{
    use ResolvesGreenlogCompany;

    public function index(Request $request, Plant $plant): JsonResponse
    {
        $this->abortIfPlantOutsideCompany($request, $plant);

        $photos = PlantPhoto::query()
            ->where('company_key', $this->companyKey($request))
            ->where('plant_id', $plant->id)
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'status' => true,
            'data' => $photos,
        ]);
    }

    public function store(StorePlantPhotoRequest $request, Plant $plant): JsonResponse
    {
        $this->abortIfPlantOutsideCompany($request, $plant);

        $file = $request->file('photo');
        $extension = strtolower($file->getClientOriginalExtension() ?: 'jpg');
        $filename = uniqid('plant_', true) . '.' . $extension;
        $directory = 'greenlog/plants/' . $plant->id;
        $storedPath = $directory . '/' . $filename;
        $realPath = $file->getRealPath();

        Log::info('GreenLog photo upload debug', [
            'has_file' => $request->hasFile('photo'),
            'original_name' => $file?->getClientOriginalName(),
            'mime' => $file?->getMimeType(),
            'size' => $file?->getSize(),
            'directory' => $directory,
            'real_path' => $realPath,
            'stored_path' => $storedPath,
        ]);

        $contents = file_get_contents($realPath);

        if ($contents === false) {
            return response()->json([
                'status' => false,
                'message' => 'Не удалось прочитать временный файл.',
            ], 500);
        }

        Log::info('GreenLog photo upload path', [
            'plant_id' => $plant->id,
            'directory' => $directory,
            'stored_path' => $storedPath,
            'real_path' => $realPath,
            'contents_size' => strlen($contents),
        ]);

        $saved = Storage::disk('public')->put($storedPath, $contents);

        if (! $saved) {
            return response()->json([
                'status' => false,
                'message' => 'Не удалось сохранить фото.',
            ], 500);
        }

        $mimeType = $file?->getMimeType();
        $size = $file?->getSize();

        $photo = PlantPhoto::create([
            'company_key' => $this->companyKey($request),
            'created_by_user_id' => $request->user()?->id,
            'plant_id' => $plant->id,
            'disk' => 'public',
            'path' => $storedPath,
            'original_name' => $file?->getClientOriginalName(),
            'mime_type' => $mimeType,
            'size' => is_int($size) ? $size : null,
            'type' => $request->validated('type') ?? 'plant',
            'description' => $request->validated('description'),
        ]);

        return response()->json([
            'status' => true,
            'data' => [
                ...$photo->toArray(),
                'url' => Storage::disk('public')->url($storedPath),
            ],
        ], 201);
    }

    public function destroy(Request $request, PlantPhoto $photo): JsonResponse
    {
        $this->abortIfPhotoOutsideCompany($request, $photo);

        Storage::disk($photo->disk ?: 'public')->delete($photo->path);
        $photo->delete();

        return response()->json([
            'status' => true,
            'data' => null,
        ]);
    }

    private function abortIfPlantOutsideCompany(Request $request, Plant $plant): void
    {
        abort_unless($plant->company_key === $this->companyKey($request), 404);
    }

    private function abortIfPhotoOutsideCompany(Request $request, PlantPhoto $photo): void
    {
        abort_unless($photo->company_key === $this->companyKey($request), 404);
    }
}
