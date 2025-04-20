<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Models\TrailerType;
use Illuminate\Support\Facades\Auth;

class TrailerTypeCotroller extends Controller
{
    public function getTrailerTypes(Request $request)
    {
        $trailerTypes = TrailerType::all();
        return response()->json(
            [
                'status' => true,
                'message' => 'Trailer types retrieved successfully',
                'data' => $trailerTypes
            ],
            200
        );
    }
    public function addTrailerType(Request $request)
    {
        try {
            $trailerType = TrailerType::create($request->all());
            return response()->json(
                [
                    'status' => true,
                    'message' => 'Trailer type added successfully',
                    'data' => $trailerType
                ],
                200
            );
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Creating Trailer Type: ' . $e->getMessage(),
            ], 500);
        }
    }
    public function updateTrailerType(Request $request)
    {
        try {
            $trailerType = TrailerType::find($request->id);
            if ($trailerType) {
                $trailerType->update($request->all());
                return response()->json(
                    [
                        'status' => true,
                        'message' => 'Trailer type updated successfully',
                        'data' => $trailerType
                    ],
                    200
                );
            }
            return response()->json(
                [
                    'status' => false,
                    'message' => 'Trailer type not found'
                ],
                404
            );
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Updating Trailer Type: ' . $e->getMessage(),
            ], 500);
        }
    }
    public function deleteTrailerType(Request $request)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }
        $userRole = $user->roles->pluck('name');
        if (!$userRole->contains('Администратор')) {
            return response()->json(['message' => 'Forbidden'], 403);
        }
        $trailerType = TrailerType::find($request->id);
        if ($trailerType) {
            $trailerType->delete();
            return response()->json(
                [
                    'status' => true,
                    'message' => 'Trailer type deleted successfully'
                ],
                200
            );
        }
        return response()->json(
            [
                'status' => false,
                'message' => 'Trailer type not found'
            ],
            404
        );
    }
}
