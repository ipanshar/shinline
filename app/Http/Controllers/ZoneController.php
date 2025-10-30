<?php

namespace App\Http\Controllers;

use App\Models\Zone;
use Illuminate\Http\Request;

class ZoneController extends Controller
{
    public function getZones(Request $request)
    {
        $zones = Zone::all();
        return response()->json($zones);
    }

    public function createOrUpdateZone(Request $request)
    {
        $data = $request->validate([
            'id' => 'nullable|integer',
            'name' => 'required|string|max:255|unique:zones,name,' . $request->id,
            'description' => 'nullable|string',
            'yard_id' => 'required|integer|unique:zones,yard_id,' . $request->id,
        ]);

        if (!empty($data['id'])) {
            $zone = Zone::find($data['id']);
            if (!$zone) {
                return response()->json([
                    'status' => false,
                    'message' => 'Зона не найдена'
                ], 404);
            }
            $zone->update($data);
        } else {
            $zone = Zone::create($data);
        }

        return response()->json([
            'status' => true,
            'message' => 'Зона успешно ' . (isset($data['id']) ? 'обновлена' : 'создана'),
            'data' => $zone
        ], 200);
    }
}
