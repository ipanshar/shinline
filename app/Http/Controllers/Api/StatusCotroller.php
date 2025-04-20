<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class StatusCotroller extends Controller
{
    public function getStatuses(Request $request)
    {
        $statuses = \App\Models\Status::all();
        return response()->json([
            'status' => true,
            'message' => 'Statuses retrieved successfully',
            'data' => $statuses
        ], 200);
      
    }
    public function addStatus(Request $request)
    {
        $status = new \App\Models\Status();
        $status->name = $request->name;
        $status->key = $request->key;
        $status->save();

        return response()->json([
            'status' => true,
            'message' => 'Status created successfully',
            'data' => $status
        ], 200);
    }
    public function updateStatus(Request $request)
    {
        $status = \App\Models\Status::find($request->id);
        if ($status) {
            $status->name = $request->name;
            $status->key = $request->key;
            $status->save();

            return response()->json([
                'status' => true,
                'message' => 'Status updated successfully',
                'data' => $status
            ]);
        } else {
            return response()->json([
                'status' => false,
                'message' => 'Status not found'], 404);
        }
    }
}
