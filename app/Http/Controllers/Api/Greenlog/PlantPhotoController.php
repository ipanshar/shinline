<?php

namespace App\Http\Controllers\Api\Greenlog;

use App\Http\Controllers\Controller;
use App\Http\Requests\Greenlog\StorePlantPhotoRequest;
use App\Models\Greenlog\Plant;
use App\Models\Greenlog\PlantPhoto;
use App\Support\Greenlog\ResolvesGreenlogCompany;
use ValueError;
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

        $disk = 'public';
        $file = $request->file('photo');
        $path = "greenlog/plants/{$plant->id}";

        if ($path === '') {
            return response()->json([
                'status' => false,
                'message' => 'Upload path is empty.',
            ], 422);
        }

        Log::info('GreenLog upload', [
            'plant_id' => $plant->id,
            'path' => $path,
            'filename' => $file->getClientOriginalName(),
        ]);

        try {
            $filePath = $file->store($path, $disk);
        } catch (ValueError $exception) {
            if (str_contains($exception->getMessage(), 'Path cannot be empty')) {
                return response()->json([
                    'status' => false,
                    'message' => 'Upload path is empty.',
                ], 422);
            }

            throw $exception;
        }

        $mimeType = $file?->getMimeType();
        $size = $file?->getSize();

        $photo = PlantPhoto::create([
            'company_key' => $this->companyKey($request),
            'created_by_user_id' => $request->user()?->id,
            'plant_id' => $plant->id,
            'disk' => $disk,
            'path' => $filePath,
            'original_name' => $file?->getClientOriginalName(),
            'mime_type' => $mimeType,
            'size' => is_int($size) ? $size : null,
            'type' => $request->validated('type') ?? 'plant',
            'description' => $request->validated('description'),
        ]);

        return response()->json([
            'status' => true,
            'data' => $photo,
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
