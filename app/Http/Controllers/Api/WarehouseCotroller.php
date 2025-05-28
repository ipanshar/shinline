<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Warehouse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Http\Request;

class WarehouseCotroller extends Controller
{
    public function getWarehouses(Request $request)
    {
        $warehouses = Warehouse::query();
        if ($request->has('yard_id')) {
            $warehouses->where('yard_id', $request->input('yard_id'));
            
        }
        $warehouses=$warehouses->Leftjoin('yards', 'warehouses.yard_id', '=', 'yards.id')->select('warehouses.*', 'yards.name as yard_name')
        ->get(); 
        
        return response()->json([
            'status' => true,
            'message' => 'Warehouses retrieved successfully',
            'data' => $warehouses,
        ], 200);
    }
    public function addWarehouse(Request $request)
    {
        try {
            $validate = $request->validate([
                'name' => 'required|string|max:255',
                'address' => 'string|max:255',
                'phone' => 'string|max:255',
                'email' => 'string|max:255',
                'coordinates' => 'string|max:255',
                'yard_id' => 'required|integer',
            ]);
            $warehouse = Warehouse::create($validate);

            return response()->json([
                'status' => true,
                'message' => 'Warehouse created successfully',
                'data' => $validate
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Creating Warehouse: ' . $e->getMessage(),
            ], 500);
        }
    }
    public function updateWarehouse(Request $request)
    {
        try {
            $validate = $request->validate([
                'id' => 'required|integer',
                'name' => 'string|max:255',
                'address' => 'string|max:255',
                'phone' => 'string|max:255',
                'email' => 'string|max:255',
                'coordinates' => 'string|max:255',
                'yard_id' => 'required|integer',
            ]);
            $warehouse = Warehouse::find($validate['id']);
            if (!$warehouse) {
                return response()->json([
                    'status' => false,
                    'message' => 'Warehouse not found'
                ], 404);
            }
            $warehouse->update($validate);
            return response()->json([
                'status' => true,
                'message' => 'Warehouse updated successfully',
                'data' => $validate
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Updating Warehouse: ' . $e->getMessage(),
            ], 500);
        }
    }
    public function deleteWarehouse(Request $request)
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
        $warehouse = Warehouse::find($validate['id']);
        if (!$warehouse) {
            return response()->json([
                'status' => false,
                'message' => 'Warehouse not found'
            ], 404);
        }
        $warehouse->delete();
        return response()->json([
            'status' => true,
            'message' => 'Warehouse deleted successfully',
        ], 200);
    }

    public function getWarehouseById($WarehouseName,$yardId,$barcode)
    {
        $warehouse = Warehouse::where('name', $WarehouseName)->first();
                if (!$warehouse) {
                    $warehouse = Warehouse::create([
                        'name' => $WarehouseName,
                        'yard_id' => $yardId ? $yardId->id : null,
                        'barcode' => $barcode,
                    ]);
                }

                return $warehouse;

    }

}
 