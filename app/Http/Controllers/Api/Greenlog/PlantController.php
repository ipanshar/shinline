<?php

namespace App\Http\Controllers\Api\Greenlog;

use App\Http\Controllers\Controller;
use App\Http\Requests\Greenlog\ListPlantsRequest;
use App\Http\Requests\Greenlog\StorePlantRequest;
use App\Http\Requests\Greenlog\UpdatePlantRequest;
use App\Models\Greenlog\Location;
use App\Models\Greenlog\Plant;
use App\Models\Greenlog\PlantSpecies;
use App\Support\Greenlog\ResolvesGreenlogCompany;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PlantController extends Controller
{
    use ResolvesGreenlogCompany;

    public function index(ListPlantsRequest $request): JsonResponse
    {
        $query = Plant::query()
            ->where('company_key', $this->companyKey($request));

        if ($request->filled('category')) {
            $query->where('category', $request->string('category')->toString());
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status')->toString());
        }

        if ($request->filled('location_id')) {
            $query->where('location_id', (int) $request->input('location_id'));
        }

        if ($request->filled('search')) {
            $search = $request->string('search')->toString();
            $query->where(function ($builder) use ($search) {
                $builder->where('name', 'like', "%{$search}%")
                    ->orWhere('inventory_number', 'like', "%{$search}%")
                    ->orWhere('biological_name', 'like', "%{$search}%")
                    ->orWhereHas('species', function ($speciesQuery) use ($search) {
                        $speciesQuery->where('name', 'like', "%{$search}%");
                    });
            });
        }

        $plants = $query
            ->with([
                'location:id,building,floor,room,factory_zone',
                'species:id,name,category,description,is_active',
            ])
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'status' => true,
            'data' => $plants,
        ]);
    }

    public function show(Request $request, Plant $plant): JsonResponse
    {
        $this->abortIfOutsideCompany($request, $plant);

        return response()->json([
            'status' => true,
            'data' => $plant->load(['location', 'species', 'photos', 'expenses', 'careTasks']),
        ]);
    }

    public function store(StorePlantRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $companyKey = $this->companyKey($request);

        if (! empty($validated['location_id'])) {
            $location = Location::query()
                ->whereKey($validated['location_id'])
                ->where('company_key', $companyKey)
                ->first();

            if (! $location) {
                return response()->json([
                    'status' => false,
                    'message' => 'Локация не найдена в рамках компании.',
                ], 422);
            }
        }

        if (! empty($validated['species_id'])) {
            $species = PlantSpecies::query()->find($validated['species_id']);

            if (! $species) {
                return response()->json([
                    'status' => false,
                    'message' => 'Вид растения не найден.',
                ], 422);
            }
        }

        $plant = Plant::create([
            'company_key' => $companyKey,
            'created_by_user_id' => $request->user()?->id,
            'inventory_number' => $validated['inventory_number'],
            'name' => $validated['name'],
            'biological_name' => $validated['biological_name'] ?? null,
            'category' => $validated['category'],
            'status' => $validated['status'] ?? 'alive',
            'location_id' => $validated['location_id'] ?? null,
            'species_id' => $validated['species_id'] ?? null,
            'quantity' => $validated['quantity'] ?? 1,
            'watering_frequency_days' => $validated['watering_frequency_days'] ?? null,
            'fertilizing_frequency_days' => $validated['fertilizing_frequency_days'] ?? null,
            'notes' => $validated['notes'] ?? null,
        ]);

        return response()->json([
            'status' => true,
            'data' => $plant,
        ], 201);
    }

    public function update(UpdatePlantRequest $request, Plant $plant): JsonResponse
    {
        $this->abortIfOutsideCompany($request, $plant);

        $validated = $request->validated();
        $companyKey = $this->companyKey($request);

        if (array_key_exists('location_id', $validated) && $validated['location_id'] !== null) {
            $location = Location::query()
                ->whereKey($validated['location_id'])
                ->where('company_key', $companyKey)
                ->first();

            if (! $location) {
                return response()->json([
                    'status' => false,
                    'message' => 'Локация не найдена в рамках компании.',
                ], 422);
            }
        }

        if (array_key_exists('species_id', $validated) && $validated['species_id'] !== null) {
            $species = PlantSpecies::query()->find($validated['species_id']);

            if (! $species) {
                return response()->json([
                    'status' => false,
                    'message' => 'Вид растения не найден.',
                ], 422);
            }
        }

        $plant->update($validated);

        return response()->json([
            'status' => true,
            'data' => $plant->fresh()->load(['location', 'species']),
        ]);
    }

    public function destroy(Request $request, Plant $plant): JsonResponse
    {
        $this->abortIfOutsideCompany($request, $plant);

        foreach ($plant->photos as $photo) {
            Storage::disk($photo->disk ?: 'public')->delete($photo->path);
        }

        $plant->delete();

        return response()->json([
            'status' => true,
            'data' => null,
        ]);
    }
    private function abortIfOutsideCompany(Request $request, Plant $plant): void
    {
        abort_unless($plant->company_key === $this->companyKey($request), 404);
    }
}
