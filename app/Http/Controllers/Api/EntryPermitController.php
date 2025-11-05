<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Checkpoint;
use Illuminate\Http\Request;

class EntryPermitController extends Controller
{
    public function addCheckpoint(Request $request)
    {
       Checkpoint::create([
            'name' => $request->input('name'),
            'yard_id' => $request->input('yard_id'),
        ]);

         return response()->json([
                'status' => true,
                'message' => 'КПП успешно добавлен',
            ], 200);
    }

    public function getCheckpoint(Request $request)
    {
        $checkpoints = Checkpoint::leftJoin('yards', 'checkpoints.yard_id', '=', 'yards.id')->where('checkpoints.yard_id', $request->input('yard_id'))
            ->orderBy('checkpoints.name')
            ->select('checkpoints.*', 'yards.name as yard_name')
            ->get();
         return response()->json([
                'status' => true,
                'message' => 'Актуальные КПП загружены',
                'data' => $checkpoints,
            ], 200);
    }

    public function updateCheckpoint(Request $request)
    {
        $checkpoint = Checkpoint::find($request->input('id'));
        if ($checkpoint) {
            $checkpoint->name = $request->input('name');
            $checkpoint->yard_id = $request->input('yard_id');
            $checkpoint->save();

             return response()->json([
                'status' => true,
                'message' => ' КПП обновлен',
                'data' => $checkpoint,
            ], 200);
        }

        return response()->json(['status' => false, 'message' => 'КПП не найден'], 404);
    }

    public function deleteCheckpoint(Request $request)
    {
        $checkpoint = Checkpoint::find($request->input('id'));
        if ($checkpoint) {
            $checkpoint->delete();
            return response()->json([
                'status' => true,
                'message' => 'КПП удален',
            ], 200);
        }

        return response()->json(['status' => false, 'message' => 'КПП не найден'], 404);
    }

    public function getAllCheckpoints(Request $request)
    {
        $checkpoints = Checkpoint::leftJoin('yards', 'checkpoints.yard_id', '=', 'yards.id')
            ->orderBy('checkpoints.name')
            ->select('checkpoints.*', 'yards.name as yard_name')
            ->get();
         return response()->json([
                'status' => true,
                'message' => 'Все КПП загружены',
                'data' => $checkpoints,
            ], 200);
    }
}
