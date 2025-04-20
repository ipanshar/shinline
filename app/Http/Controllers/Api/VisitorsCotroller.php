<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\Visitor;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\Request;

class VisitorsCotroller extends Controller
{
    public function addVisitor(Request $request)
    {
        $truck = DB::table('trucks')->where('plate_number', '=', $request->plate_number)->first();
        $task = $truck ? DB::table('tasks')->where('truck_id', $truck->id)
            ->where('end_date', '=', null)
            ->where('begin_date', '=', null)
            ->first() : null;
        $status = DB::table('statuses')->where('key', 'on_territory')->first();
        try {
            $Visitor =  Visitor::create([
                'name' => $request->name,
                'plate_number' => $request->plate_number,
                'phone' => $request->phone,
                'viche_color' => $request->viche_color,
                'truck_category_id' => $request->truck_category_id,
                'truck_brand_id' => $request->truck_brand_id,
                'company' => $request->company,
                'entry_date' => now(),
                'user_id' => $request->user_id,
                'status_id' => $status->id,
                'yard_id' => $request->yard_id,
                'truck_id' => $truck ? $truck->id : null,
                'task_id' => $task ? $task->id : null,
            ]);
            $Visitor->save();
            if ($task) {

                Task::where('id', $task->id)->update([
                    'begin_date' => now(),
                    'status_id' => $status->id,
                ]);
            }

            return response()->json([
                'status' => true,
                'message' => 'Visitor Created Successfully',
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Creating Visitor: ' . $e->getMessage(),
            ], 500);
        }
    }
    public function getVisitors(Request $request)
    {
        $status = $request->status_id;

        $query = DB::table('visitors')
            ->join('truck_categories', 'visitors.truck_category_id', '=', 'truck_categories.id')
            ->join('truck_brands', 'visitors.truck_brand_id', '=', 'truck_brands.id')
            ->join('users', 'visitors.user_id', '=', 'users.id')
            ->join('statuses', 'visitors.status_id', '=', 'statuses.id')
            ->join('yards', 'visitors.yard_id', '=', 'yards.id')
            ->join('trucks', 'visitors.truck_id', '=', 'trucks.id')
            ->select('visitors.*', 'truck_categories.name as truck_category_name', 'truck_brands.name as truck_brand_name', 'users.name as user_name', 'statuses.name as status_name', 'yards.name as yard_name', 'trucks.name as truck_name')
            ->orderBy('visitors.id', 'desc');

        if (!empty($status) && is_array($status)) {
            $query->whereIn('statuses.key', $status);
        }

        $visitors = $query->take(1000)->get();

        if ($visitors->isEmpty()) {
            return response()->json([
                'status' => false,
                'message' => 'No Visitors Found',
            ], 404);
        }
        return response()->json([
            'status' => true,
            'message' => 'Visitors Retrieved Successfully',
            'data' => $visitors
        ], 200);
    }

    public function updateVisitor(Request $request)
    {
        $visitor = Visitor::find($request->id);
        if (!$visitor) {
            return response()->json([
                'status' => false,
                'message' => 'Visitor Not Found',
            ], 404);
        }
        $visitor->update($request->all());
        return response()->json([
            'status' => true,
            'message' => 'Visitor Updated Successfully',
        ], 200);
    }

    public function exitVisitor(Request $request)
    {
        try {
            $status = DB::table('statuses')->where('key', 'left_territory')->first();
            $validate = $request->validate([
                'id' => 'required|integer',
            ]);
            $visitor = Visitor::find($request->id);
            if (!$visitor) {
                return response()->json([
                    'status' => false,
                    'message' => 'Visitor Not Found',
                ], 404);
            }
            $visitor->update([
                'exit_date' => now(),
                'status_id' => $status->id,
            ]);
            $task = Task::where('id', $visitor->task_id)->first();
            if ($task) {
                $task->update([
                    'end_date' => now(),
                    'status_id' => $status->id,
                ]);
            }
            return response()->json([
                'status' => true,
                'message' => 'Visitor Exited Successfully',
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Exiting Visitor: ' . $e->getMessage(),
            ], 500);
        }
    }
}
