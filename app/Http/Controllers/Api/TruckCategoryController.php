<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TruckCategory;
use Illuminate\Http\Request;

class TruckCategoryController extends Controller
{
    public function getCategories()
    {
        $categories = TruckCategory::orderBy('name')->get();

        return response()->json([
            'status' => true,
            'message' => 'Категории грузовиков загружены',
            'data' => $categories,
        ], 200);
    }

    public function addCategory(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255|unique:truck_categories,name',
        ]);

        $category = TruckCategory::create([
            'name' => $request->input('name'),
        ]);

        return response()->json([
            'status' => true,
            'message' => 'Категория успешно добавлена',
            'data' => $category,
        ], 201);
    }

    public function updateCategory(Request $request)
    {
        $request->validate([
            'id' => 'required|exists:truck_categories,id',
            'name' => 'required|string|max:255|unique:truck_categories,name,' . $request->input('id'),
        ]);

        $category = TruckCategory::find($request->input('id'));
        if ($category) {
            $category->name = $request->input('name');
            $category->save();

            return response()->json([
                'status' => true,
                'message' => 'Категория успешно обновлена',
                'data' => $category,
            ], 200);
        }

        return response()->json(['status' => false, 'message' => 'Категория не найдена'], 404);
    }

    public function deleteCategory(Request $request)
    {
        $request->validate([
            'id' => 'required|exists:truck_categories,id',
        ]);

        $category = TruckCategory::find($request->input('id'));
        if ($category) {
            $category->delete();
            return response()->json([
                'status' => true,
                'message' => 'Категория успешно удалена',
            ], 200);
        }

        return response()->json(['status' => false, 'message' => 'Категория не найдена'], 404);
    }
}
