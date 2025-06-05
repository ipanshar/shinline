<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WarehouseGates;
use Illuminate\Support\Facades\Auth;
use Illuminate\Http\Request;

class WarehouseGateCotroller extends Controller
{
    public function addGate(Request $request)
    {try{
        $validate = $request->validate([
            'warehouse_id' => 'required|integer',
            'name' => 'required|string|max:255',
            'address' => 'string|max:255',
            'phone' => 'string|max:255',
            'email' => 'string|max:255',
            'coordinates' => 'string|max:255',
            'coordinates_svg' => 'string|max:255',
        ]);
         
        $warehouseGate = WarehouseGates::create($validate);
        $warehouseGate->code = 1000+$warehouseGate->id;
        $warehouseGate->save();

        return response()->json([
            'status' => true,
            'message' => 'Warehouse gate created successfully',
            'data' => $validate
        ], 200);}
        catch(\Exception $e){
            return response()->json([
                'status' => false,
                'message' => 'Error Creating Warehouse Gate: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function getGates(Request $request)
    {
        $warehouseGates = WarehouseGates::query();
        $warehouseGates->leftJoin('warehouses', 'warehouse_gates.warehouse_id', '=', 'warehouses.id')
            ->select('warehouse_gates.*', 'warehouses.name as warehouse_name');
        if ($request->has('warehouse_id')) {
            $warehouseGates->where('warehouse_gates.warehouse_id', $request->input('warehouse_id'));
        }
        $warehouseGates = $warehouseGates->get();
        return response()->json([
            'status' => true,
            'message' => 'Warehouse gates retrieved successfully',
            'data' => $warehouseGates,
        ], 200);
    }
    public function updateGate(Request $request)
    {
        try {
            $validate = $request->validate([
                'id' => 'required|integer',
                'warehouse_id' => 'required|integer',
                'name' => 'required|string|max:255',
                'address' => 'string|max:255',
                'phone' => 'string|max:255',
                'email' => 'string|max:255',
                'coordinates' => 'string|max:255',
                'coordinates_svg' => 'string|max:255',
            ]);
            $warehouseGate = WarehouseGates::find($validate['id']);
            if (!$warehouseGate) {
                return response()->json([
                    'status' => false,
                    'message' => 'Warehouse gate not found'
                ], 404);
            }
            $warehouseGate->update($validate);
            return response()->json([
                'status' => true,
                'message' => 'Warehouse gate updated successfully',
                'data' => $validate
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Updating Warehouse Gate: ' . $e->getMessage(),
            ], 500);
        }
    }
    public function deleteGate(Request $request)
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
        $warehouseGate = WarehouseGates::find($validate['id']);
        if (!$warehouseGate) {
            return response()->json([
                'status' => false,
                'message' => 'Warehouse gate not found'
            ], 404);
        }
        $warehouseGate->delete();
        return response()->json([
            'status' => true,
            'message' => 'Warehouse gate deleted successfully'
        ], 200);
    }
}
