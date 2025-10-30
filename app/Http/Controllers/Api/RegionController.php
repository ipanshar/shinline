<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Regions;
use Illuminate\Http\Request;

class RegionController extends Controller
{
    /**
     * Получить список всех регионов
     */
    public function getRegions()
    {
        try {
            $regions = Regions::orderBy('name')->get();

            return response()->json([
                'status' => true,
                'message' => 'Регионы успешно загружены',
                'data' => $regions
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Ошибка при загрузке регионов: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Создать или обновить регион
     */
    public function createUpdateRegion(Request $request)
    {
        try {
            $validate = $request->validate([
                'id' => 'nullable|integer',
                'name' => 'required|string|max:255',
            ]);

            if (!empty($validate['id'])) {
                $region = Regions::find($validate['id']);
                if (!$region) {
                    return response()->json([
                        'status' => false,
                        'message' => 'Регион не найден'
                    ], 404);
                }
                $region->update($validate);
            } else {
                $region = Regions::create($validate);
            }

            return response()->json([
                'status' => true,
                'message' => 'Регион успешно ' . (isset($validate['id']) ? 'обновлен' : 'создан'),
                'data' => $region
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Ошибка при ' . (isset($validate['id']) ? 'обновлении' : 'создании') . ' региона: ' . $e->getMessage(),
            ], 500);
        }
    }
}