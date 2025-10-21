<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\TruckModel;
use Illuminate\Support\Facades\Auth;

class TruckModelCotroller extends Controller
{
    public function addTruckModel(Request $request)
    {
        try {
            $validate = $request->validate([
                'name' => 'string|max:255',
                'truck_brand_id' => 'required|integer',
                'truck_category_id' => 'required|integer',
            ]);
            $truckModel = TruckModel::create($validate);
            $truckModel->save();
            return response()->json([
                'status' => true,
                'message' => 'Truck model created successfully',
                'data' => $validate
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Creating Truck Model: ' . $e->getMessage(),
            ], 500);
        }
    }
    public function getTruckModels(Request $request)
    {
        $truckModels = TruckModel::leftJoin('truck_brands', 'truck_models.truck_brand_id', '=', 'truck_brands.id')
            ->leftJoin('truck_categories', 'truck_models.truck_category_id', '=', 'truck_categories.id')
            ->select('truck_models.*', 'truck_brands.name as truck_brand_name', 'truck_categories.name as truck_category_name')
            ->get();
        
        if ($truckModels->isEmpty()) {
            return response()->json([
                'status' => false,
                'message' => 'No truck models found'
            ], 404);
        }
        
        return response()->json([
            'status' => true,
            'message' => 'Truck models retrieved successfully',
            'data' => $truckModels
        ], 200);
    }
    public function updateTruckModel(Request $request)
    {
        try {
            $validate = $request->validate([
                'id' => 'required|integer',
                'name' => 'string|max:255',
                'truck_brand_id' => 'required|integer',
                'truck_category_id' => 'required|integer',
            ]);
            $truckModel = TruckModel::find($validate['id']);
            if (!$truckModel) {
                return response()->json([
                    'status' => false,
                    'message' => 'Truck model not found'
                ], 404);
            }
            $truckModel->update($validate);
            return response()->json([
                'status' => true,
                'message' => 'Truck model updated successfully',
                'data' => $validate
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Updating Truck Model: ' . $e->getMessage(),
            ], 500);
        }
    }
    public function deleteTruckModel(Request $request)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }
        $userRole = $user->roles->pluck('name');
        if (!$userRole->contains('Администратор')) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        $validate = $request->validate([
            'id' => 'required|integer',
        ]);
        $truckModel = TruckModel::find($validate['id']);
        if (!$truckModel) {
            return response()->json([
                'status' => false,
                'message' => 'Truck model not found'
            ], 404);
        }
        $truckModel->delete();
        return response()->json([
            'status' => true,
            'message' => 'Truck model deleted successfully'
        ], 200);
    }
}
