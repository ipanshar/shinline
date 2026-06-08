<?php

namespace App\Http\Controllers\Api\Greenlog;

use App\Http\Controllers\Controller;
use App\Http\Requests\Greenlog\StoreLocationRequest;
use App\Http\Requests\Greenlog\UpdateLocationRequest;
use App\Models\Greenlog\Location;
use App\Models\Greenlog\Plant;
use App\Support\Greenlog\ResolvesGreenlogCompany;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LocationController extends Controller
{
    use ResolvesGreenlogCompany;

    public function index(Request $request): JsonResponse
    {
        $locations = Location::query()
            ->withCount('plants')
            ->where('company_key', $this->companyKey($request))
            ->orderBy('building')
            ->orderBy('floor')
            ->orderBy('room')
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'status' => true,
            'data' => $locations,
        ]);
    }

    public function show(Request $request, Location $location): JsonResponse
    {
        $this->abortIfOutsideCompany($request, $location);

        return response()->json([
            'status' => true,
            'data' => $location->loadCount('plants'),
        ]);
    }

    public function plants(Request $request, Location $location): JsonResponse
    {
        $this->abortIfOutsideCompany($request, $location);

        $plants = Plant::query()
            ->where('company_key', $this->companyKey($request))
            ->where('location_id', $location->id)
            ->with('species:id,name,category,description,is_active')
            ->orderBy('name')
            ->get();

        return response()->json([
            'status' => true,
            'data' => $plants,
        ]);
    }

    public function store(StoreLocationRequest $request): JsonResponse
    {
        $validated = $this->normalizeCoordinates($request->validated());
        $companyKey = $this->companyKey($request);

        if (! empty($validated['parent_id'])) {
            $parent = Location::query()
                ->whereKey($validated['parent_id'])
                ->where('company_key', $companyKey)
                ->first();

            if (! $parent) {
                return response()->json([
                    'status' => false,
                    'message' => 'Родительская локация не найдена в рамках компании.',
                ], 422);
            }
        }

        $location = Location::create([
            'company_key' => $companyKey,
            'created_by_user_id' => $request->user()?->id,
            'building' => $validated['building'] ?? null,
            'floor' => $validated['floor'] ?? null,
            'room' => $validated['room'] ?? null,
            'factory_zone' => $validated['factory_zone'] ?? null,
            'sector' => $validated['sector'] ?? null,
            'description' => $validated['description'] ?? null,
            'position_x' => $validated['position_x'] ?? null,
            'position_y' => $validated['position_y'] ?? null,
            'type' => $validated['type'] ?? null,
            'map_image_path' => $validated['map_image_path'] ?? null,
            'marker_size' => $validated['marker_size'] ?? null,
            'parent_id' => $validated['parent_id'] ?? null,
        ]);

        return response()->json([
            'status' => true,
            'data' => $location,
        ], 201);
    }

    public function update(UpdateLocationRequest $request, Location $location): JsonResponse
    {
        $this->abortIfOutsideCompany($request, $location);

        $validated = $this->normalizeCoordinates($request->validated());
        $companyKey = $this->companyKey($request);

        if (array_key_exists('parent_id', $validated)) {
            if ((int) $validated['parent_id'] === (int) $location->id) {
                return response()->json([
                    'status' => false,
                    'message' => 'Локация не может быть родительской сама для себя.',
                ], 422);
            }

            if ($validated['parent_id'] !== null) {
                $parent = Location::query()
                    ->whereKey($validated['parent_id'])
                    ->where('company_key', $companyKey)
                    ->first();

                if (! $parent) {
                    return response()->json([
                        'status' => false,
                        'message' => 'Родительская локация не найдена в рамках компании.',
                    ], 422);
                }
            }
        }

        $location->update($validated);

        return response()->json([
            'status' => true,
            'data' => $location->fresh()->loadCount('plants'),
        ]);
    }

    public function destroy(Request $request, Location $location): JsonResponse
    {
        $this->abortIfOutsideCompany($request, $location);

        $hasChildren = Location::query()
            ->where('parent_id', $location->id)
            ->where('company_key', $this->companyKey($request))
            ->exists();

        if ($hasChildren) {
            return response()->json([
                'status' => false,
                'message' => 'Нельзя удалить локацию, у которой есть дочерние локации.',
            ], 409);
        }

        $location->delete();

        return response()->json([
            'status' => true,
            'data' => null,
        ]);
    }
    private function abortIfOutsideCompany(Request $request, Location $location): void
    {
        abort_unless($location->company_key === $this->companyKey($request), 404);
    }

    private function normalizeCoordinates(array $validated): array
    {
        if (array_key_exists('map_x', $validated)) {
            $validated['position_x'] = $validated['map_x'];
            unset($validated['map_x']);
        }

        if (array_key_exists('map_y', $validated)) {
            $validated['position_y'] = $validated['map_y'];
            unset($validated['map_y']);
        }

        return $validated;
    }
}
