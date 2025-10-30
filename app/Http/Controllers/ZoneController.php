<?php

namespace App\Http\Controllers;

use App\Models\Zone;
use Illuminate\Http\Request;

class ZoneController extends Controller
{
    public function getZones(Request $request)
    {
        $zones = Zone::leftJoin('yards', 'zones.yard_id', '=', 'yards.id')
            ->select('zones.*', 'yards.name as yard_name')
            ->get();
        
        return response()->json([
            'status' => true,
            'message' => 'Зоны загружены успешно',
            'data' => $zones
        ]);
    }

    public function createOrUpdateZone(Request $request)
    {
        $data = $request->validate([
            'id' => 'nullable|integer',
            'name' => 'required|string|max:255',
            'yard_id' => 'required|integer',
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
