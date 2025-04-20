<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\TruckBrand;
use Illuminate\Support\Facades\Auth;

class TruckBrandCotroller extends Controller
{
    public function getTruckBrands(Request $request)
    {
        $truckBrands = TruckBrand::all();
        return response()->json(
            [
                'status' => true,
                'message' => 'Truck brands retrieved successfully',
                'data' => $truckBrands
            ],
            200
        );
    }

    public function addTruckBrand(Request $request)
    {
        try {
            $truckBrand = TruckBrand::create($request->all());
            return response()->json([
                'status' => true,
                'message' => 'Truck brand added successfully',
                'data' => $truckBrand
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Creating Truck Brand: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function updateTruckBrand(Request $request)
    {
        try {
            $truckBrand = TruckBrand::find($request->id);
            if ($truckBrand) {
                $truckBrand->update($request->all());
                return response()->json([
                    'status' => true,
                    'message' => 'Truck brand updated successfully',
                    'data' => $truckBrand
                ], 200);
            }
            return response()->json([
                'status' => false, 
                'message' => 'Truck brand not found'
            ], 404);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Updating Truck Brand: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function deleteTruckBrand(Request $request)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }
        $userRole = $user->roles->pluck('name');
        if (!$userRole->contains('Администратор')) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        $truckBrand = TruckBrand::find($request->id);
        if ($truckBrand) {
            $truckBrand->delete();
            return response()->json(['status' => true, 'message' => 'Truck brand deleted successfully']);
        }
        return response()->json(['status' => false, 'message' => 'Truck brand not found'], 404);
    }
}
