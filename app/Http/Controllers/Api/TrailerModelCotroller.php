<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class TrailerModelCotroller extends Controller
{
    public function getTrailerModels(Request $request)
    {
        $trailerModels = \App\Models\TrailerModel::leftJoin('trailer_types', 'trailer_models.trailer_type_id', '=', 'trailer_types.id')
            ->select('trailer_models.*', 'trailer_types.name as trailer_type_name')
            ->get();
        
        if ($trailerModels->isEmpty()) {
            return response()->json([
                'status' => false,
                'message' => 'No trailer models found',
            ], 404);
        }
        
        return response()->json([
            'status' => true,
            'message' => 'Trailer models retrieved successfully',
            'data' => $trailerModels,
        ], 200);
    }

    public function addTrailerModel(Request $request)
    {
        try {
            $trailerModel = new \App\Models\TrailerModel();
            $trailerModel->name = $request->name;
            $trailerModel->trailer_type_id = $request->trailer_type_id;
            $trailerModel->save();
            return response()->json([
                'status' => true,
                'message' => 'Trailer model added successfully',
                'data' => $trailerModel,
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Creating Trailer Model: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function updateTrailerModel(Request $request)
    {
        try {
            $trailerModel = \App\Models\TrailerModel::find($request->id);
            if (!$trailerModel) {
                return response()->json([
                    'status' => false,
                    'message' => 'Trailer model not found',
                ], 404);
            }
            $trailerModel->name = $request->name;
            $trailerModel->trailer_type_id = $request->trailer_type_id;
            $trailerModel->save();
            return response()->json([
                'status' => true,
                'message' => 'Trailer model updated successfully',
                'data' => $trailerModel,
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Updating Trailer Model: ' . $e->getMessage(),
            ], 500);
        }
    }
    public function deleteTrailerModel(Request $request)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }
        $userRole = $user->roles->pluck('name');
        if (!$userRole->contains('Администратор')) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        $trailerModel = \App\Models\TrailerModel::find($request->id);
        if (!$trailerModel) {
            return response()->json([
                'status' => false,
                'message' => 'Trailer model not found',
            ], 404);
        }
        $trailerModel->delete();
        return response()->json([
            'status' => true,
            'message' => 'Trailer model deleted successfully',
        ], 200);
    }
}
