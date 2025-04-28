<?php

namespace App\Http\Controllers\Api;

use App\Events\MessageSent;
use App\Http\Controllers\Controller;
use App\Models\Task;
use App\Models\Truck;
use App\Models\TruckModel;
use App\Models\Visitor;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\Request;

class VisitorsCotroller extends Controller
{
    public function addVisitor(Request $request)
    {
        try {
            $truck = Truck::where('plate_number', '=', $request->plate_number)->first();
            if (!$truck && $request->truck_model_name) {

                $truck_model = TruckModel::where('name', $request->truck_model_name)->first();
                if (!$truck_model) {
                    $truck_model = TruckModel::create([
                        'name' => $request->truck_model_name,
                    ]);
                }
                
                if ($truck_model) {
                    $truck = Truck::create([
                        'plate_number' => $request->plate_number,
                        'truck_model_id' => $truck_model->id,
                        'truck_brand_id' => $request->truck_brand_id ?? null,
                        'truck_category_id' => $request->truck_category_id ?? null,
                    ]);
                }
                if (!$truck_model) {
                    logger()->error('Ошибка создания truck_model!');
                }
                if (!$truck) {
                    logger()->error('Ошибка создания truck!');
                }
                
                
            }
            $task = $truck ? DB::table('tasks')->where('truck_id', $truck->id)
                ->where('end_date', '=', null)
                ->where('begin_date', '=', null)
                ->first() : null;

            $status = DB::table('statuses')->where('key', 'on_territory')->first();
            if ($request->truck_model_name) {
                $truck_model = DB::table('truck_models')->where('name', $request->truck_model_name)->first();
                if (!$truck_model) {
                }
            }


            $Visitor =  Visitor::create([
                'name' => $request->name ? $request->name : null,
                'plate_number' => $request->plate_number,
                'phone' => $request->phone ? $request->phone : null,
                'viche_color' => $request->viche_color ? $request->viche_color : null,
                'truck_category_id' => $truck ? $truck->truck_category_id : null,
                'truck_brand_id' => $truck ? $truck->truck_brand_id : null,
                'company' => $request->company ? $request->company : null,
                'entry_date' => now(),
                'user_id' => $request->user_id ? $request->user_id : null,
                'status_id' => $status->id,
                'yard_id' => $request->yard_id ? $request->yard_id : null,
                'truck_id' => $truck ? $truck->id : null,
                'task_id' => $task ? $task->id : null,
            ]);
            $Visitor->save();
            if ($task) {

                Task::where('id', $task->id)->update([
                    'begin_date' => now(),
                    'status_id' => $status->id,
                ]);
                MessageSent::dispatch('На територию вьехало транспортное средство '.$request->plate_number.', для рейса '.$task->name);
            }

            return response()->json([
                'status' => true,
                'message' => 'Visitor Created Successfully',
                'data' => $Visitor,
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
        


        $query = DB::table('visitors')
            ->leftJoin('truck_categories', 'visitors.truck_category_id', '=', 'truck_categories.id')
            ->leftJoin('truck_brands', 'visitors.truck_brand_id', '=', 'truck_brands.id')
            ->leftJoin('users', 'visitors.user_id', '=', 'users.id')
            ->leftJoin('statuses', 'visitors.status_id', '=', 'statuses.id')
            ->leftJoin('yards', 'visitors.yard_id', '=', 'yards.id')
            ->leftJoin('trucks', 'visitors.truck_id', '=', 'trucks.id')
            ->leftJoin('truck_models', 'trucks.truck_model_id', '=', 'truck_models.id')
            ->select(
                'visitors.*',
                'truck_categories.name as truck_category_name',
                'truck_brands.name as truck_brand_name',
                'users.name as user_name',
                'statuses.name as status_name',
                'yards.name as yard_name',
                'trucks.name as truck_name',
                'truck_models.name as truck_model_name'
            )
            ->orderBy('visitors.id', 'desc');

        if ($request->has('status') && is_array($request->status)) {
            $query->whereIn('statuses.key', $request->status);
        }
        if ($request->has('yard_id')) {
            $query->where('visitors.yard_id', '=', $request->yard_id);
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

    public function searchTruck(Request $request)
    {
        $query = Truck::query();
        $query->leftJoin('truck_models', 'trucks.truck_model_id', '=', 'truck_models.id')
            ->leftJoin('truck_brands', 'trucks.truck_brand_id', '=', 'truck_brands.id')
            ->leftJoin('truck_categories', 'trucks.truck_category_id', '=', 'truck_categories.id')
            ->select(
                'trucks.*',
                'truck_models.name as truck_model_name',
                'truck_brands.name as truck_brand_name',
                'truck_categories.name as truck_category_name'
            );
        if ($request->has('plate_number')) {
            $query->where('trucks.plate_number', 'like', '%' . $request->input('plate_number') . '%');
        }
        if ($request->has('truck_model_name')) {
            $query->where('truck_models.name', 'like', '%' . $request->input('truck_model_name') . '%');
        }
        if ($request->has('truck_brand_name')) {
            $query->where('truck_brands.name', 'like', '%' . $request->input('truck_brand_name') . '%');
        }
        if ($request->has('truck_category_name')) {
            $query->where('truck_categories.name', 'like', '%' . $request->input('truck_category_name') . '%');
        }
        return response()->json([
            'status' => true,
            'message' => 'Trucks Retrieved Successfully',
            'data' => $query->get(),
        ], 200);

    }
   
    public function ChatTest(Request $request)
{
    MessageSent::dispatch($request->text);
    return response()->json(['status' => 'Message dispatched']);
}


}
