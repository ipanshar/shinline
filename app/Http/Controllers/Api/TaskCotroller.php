<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Status;
use App\Models\Task;
use App\Models\TaskLoading;
use App\Models\TaskLoadingStatus;
use App\Models\TaskWeighing;
use App\Models\TrailerModel;
use App\Models\TrailerType;
use App\Models\Truck;
use App\Models\TruckCategory;
use App\Models\TruckModel;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WarehouseGates;
use App\Models\Yard;
use Illuminate\Http\Request;
use PHPUnit\Framework\Constraint\Count;
use App\Events\MessageSent;

class TaskCotroller extends Controller
{
    public function getTasks(Request $request)
    {
        try {
            $tasks = Task::query();
           
            if ($request->has('status_id')) {
                $tasks->where('tasks.status_id', $request->status_id);
            }
            if ($request->has('yard_id')) {
                $tasks->where('tasks.yard_id', $request->yard_id);
            }
            if ($request->has('user_id')) {
                $tasks->where('tasks.user_id', $request->user_id);
            }
            if ($request->has('truck_id')) {
                $tasks->where('truck_id', $request->truck_id);
            }
            if ($request->has('avtor')) {
                $tasks->where('tasks.avtor', $request->avtor);
            }
            if ($request->has('address')) {
                $tasks->where('tasks.address', 'like', '%' . $request->address . '%');
            }
            if ($request->has('phone')) {
                $tasks->where('tasks.phone', 'like', '%' . $request->phone . '%');
            }
            if ($request->has('plan_date')) {
                $tasks->where('tasks.plan_date', '>=', $request->plan_date);
            }
            if ($request->has('begin_date')) {
                $tasks->where('tasks.begin_date', '>=', $request->begin_date);
            }
            if ($request->has('end_date')) {
                $tasks->where('tasks.end_date', '<=', $request->end_date);
            }
            if ($request->has('search')) {
                $tasks->where(function ($query) use ($request) {
                    $query->where('tasks.name', 'like', '%' . $request->search . '%')
                        ->orWhere('tasks.description', 'like', '%' . $request->search . '%');
                });
            }
           
            $tasks->leftJoin('statuses', 'tasks.status_id', '=', 'statuses.id')
                ->leftJoin('users', 'tasks.user_id', '=', 'users.id')
                ->leftJoin('trucks', 'tasks.truck_id', '=', 'trucks.id')
                ->leftJoin('trailer_models', 'trucks.trailer_model_id', '=', 'trailer_models.id')
                ->leftJoin('trailer_types', 'trailer_models.trailer_type_id', '=', 'trailer_types.id')
                ->leftJoin('truck_models', 'trucks.truck_model_id', '=', 'truck_models.id')
                ->leftJoin('truck_categories', 'truck_models.truck_category_id', '=', 'truck_categories.id')
                ->leftJoin('yards', 'tasks.yard_id', '=', 'yards.id')
                ->select('tasks.*', 'statuses.name as status_name','users.login as user_login', 'users.name as user_name', 'users.phone as user_phone',
                 'trucks.plate_number as truck_plate_number', 'yards.name as yard_name',
                    'trailer_models.name as trailer_model_name', 'trailer_types.name as trailer_type_name',
                    'truck_models.name as truck_model_name', 'truck_categories.name as truck_category_name')
                ->orderBy('tasks.created_at', 'desc');

                $cur_page = 0;
                $last_page = 0;
            if ($request->has('page')) {
                $tasks =  $tasks->paginate(50);
                $cur_page = $tasks->currentPage();
                $last_page = $tasks->lastPage();
                $tasks = $tasks->items();
            } else {
                $tasks->limit(150);
                $tasks =  $tasks->get();
            }
            if (!$tasks) {
                return response()->json([
                    'status' => false,
                    'message' => 'No tasks found',
                    'data' => $tasks
                ], 404);
            }
            $data = [];
            foreach ($tasks as $task) {
                $taskLoading = TaskLoading::query()
                    ->where('task_id', $task->id)
                    ->leftJoin('warehouses', 'task_loadings.warehouse_id', '=', 'warehouses.id')
                    ->leftJoin('warehouse_gates', 'task_loadings.warehouse_gate_plan_id', '=', 'warehouse_gates.id')
                    ->leftJoin('warehouse_gates as a', 'task_loadings.warehouse_gate_fact_id', '=', 'a.id')
                    ->select('task_loadings.*', 'warehouses.name as warehouse_name', 'warehouse_gates.name as warehouse_gate_plan_name'
                        , 'a.name as warehouse_gate_fact_name')
                    ->get();
                $taskWeighing = TaskWeighing::query()
                    ->where('task_id', $task->id)
                    ->leftJoin('statuse_weighings', 'task_weighings.statuse_weighing_id', '=', 'statuse_weighings.id')
                    ->select('task_weighings.*', 'statuse_weighings.name as statuse_weighing_name')
                    ->get();

                array_push($data, [
                    'id' => $task->id,
                    'name' => $task->name,
                    'user_id' => $task->user_id,
                    'user_name' => $task->user_name,
                    'user_phone' => $task->user_phone,
                    'user_login' => $task->user_login,
                    'user_phone' => $task->user_phone,
                    'trailer_plate_number' => $task->trailer_number,
                    'status_name' => $task->status_name,
                    'status_id' => $task->status_id,
                    'truck_id' => $task->truck_id,
                    'truck_model' => $task->truck_model,
                    'truck_category' => $task->truck_category,
                    'trailer_type' => $task->trailer_type,
                    'avtor' => $task->avtor,
                    'description' => $task->description,
                    'address' => $task->address,
                    'phone' => $task->phone,
                    'plan_date' => $task->plan_date,
                    'begin_date' => $task->begin_date,
                    'end_date' => $task->end_date,
                    'yard_id' => $task->yard_id,
                    'status_name' => $task->status_name,
                    'truck_plate_number' => $task->truck_plate_number,
                    'trailer_model_name' => $task->trailer_model_name,
                    'trailer_type_name' => $task->trailer_type_name,
                    'truck_model_name' => $task->truck_model_name,
                    'truck_category_name' => $task->truck_category_name,
                    'yard_name' => $task->yard_name,
                    'created_at' => $task->created_at,
                    'task_loadings' => $taskLoading,
                    'task_weighings' => $taskWeighing,

                ]);
            }
            return response()->json([
                'status' => true,
                'message' => 'Tasks retrieved successfully',
                'data' => $data,
                'current_page' => $cur_page,
                'last_page' => $last_page,
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Retrieving Tasks: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function addTask(Request $request)
    {
        try {
            $validate = $request->validate([
                'name' => 'required|string|max:255',
                'description' => 'string|max:255',
                'address' => 'string|max:255',
                'phone' => 'string|max:255',
                'plan_date' => 'date',
                'begin_date' => 'date',
                'end_date' => 'date',
                'yard_id' => 'required|integer',
                'user_id' => 'required|integer',
                'truck_id' => 'required|integer',
                'status_id' => 'required|integer',
            ]);
            $task = Task::create($validate);

            $task->save();
            $taskLoading = TaskLoading::create([
                'task_id' => $task->id,
                'warehouse_id' => $request->warehouse_id,
                'warehouse_gate_plan_id' => $request->warehouse_gate_plan_id,
                'warehouse_gate_fact_id' => $request->warehouse_gate_fact_id,
            ]);
            $taskLoading->save();
            $taskWeighing = TaskWeighing::create([
                'task_id' => $task->id,
                'statuse_weighing_id' => $request->statuse_weighing_id,
            ]);
            return response()->json([
                'status' => true,
                'message' => 'Task created successfully',
                'data' => $validate
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Creating Task: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function addApiTask(Request $request)
    {
        try {
            $validate = $request->validate([
                'name' => 'required|string|max:255',
                'user_name' => 'string|max:255',
                'user_phone' => 'string|max:255',
                'company' => 'string|max:255',
                'plate_number' => 'string|max:50',
                'trailer_plate_number' => "string|max:50",
                'truck_model' => 'string|max:255',
                'truck_category' => 'string|max:255',
                'trailer_type' => 'string|max:255',
                'trailer_model' => 'string|max:255',
                'color' => 'string|max:100',
                'vin' => 'string|max:100',
                'avtor' => 'required|string|max:255',
                'phone' => 'string|max:50',
                'Yard' => 'required|string|max:255',
                'description' => 'nullable|string|max:500',
                'plan_date' => 'date_format:Y-m-d H:i:s',
                'weighing' => 'required|boolean',
                'warehouse' => 'required|array',
                'warehouse.*.name' => 'required|string|max:255',
                'warehouse.*.sorting_order' => 'required|integer|min:1',
                'warehouse.*.gates' => 'array',
                'warehouse.*.gates.*' => 'string',
                'warehouse.*.plan_gate' => 'nullable|string',
                'warehouse.*.description' => 'nullable|string|max:500',
            ]);
            $truck = Truck::where('plate_number', $validate['plate_number'])->first();
            if (!$truck && $validate['plate_number']) {
                $truckCategory = TruckCategory::where('name', 'like', '%' . $validate['truck_category'] . '%')->first();
                if (!$truckCategory && $validate['truck_category']) {
                    $truckCategory = TruckCategory::create([
                        'name' => $validate['truck_category'],
                        'ru_name' => $validate['truck_category'],
                    ]);
                    $truckCategory->save();
                }
                $truckModel = TruckModel::where('name', 'like', '%' . $validate['truck_model'] . '%')->first();
                if (!$truckModel && $validate['truck_model']) {
                    $truckModel = TruckModel::create([
                        'name' => $validate['truck_model'],
                        'truck_category_id' => $truckCategory->id,
                    ]);
                    $truckModel->save();
                }
                $trailerModel = TrailerModel::where('name', 'like', '%' . $validate['trailer_model'] . '%')->first();
                if (!$trailerModel && $validate['trailer_model']) {
                    $trailerModel = TrailerModel::create([
                        'name' => $validate['trailer_model'],
                        'trailer_type_id' => $truckCategory->id,
                    ]);
                    $trailerModel->save();
                }
                $trailerType = TrailerType::where('name', 'like', '%' . $validate['trailer_type'] . '%')->first();
                if (!$trailerType && $validate['trailer_type']) {
                    $trailerType = TrailerType::create([
                        'name' => $validate['trailer_type'],
                    ]);
                    $trailerType->save();
                }
                $truck = Truck::create([
                    'user_id' => 1,
                    'vin' => $validate['vin'],
                    'plate_number' => $validate['plate_number'],
                    'trailer_plate_number' => $validate['trailer_plate_number'],
                    'truck_model_id' => $truckModel ? $truckModel->id : null,
                    'trailer_model_id' => $trailerModel ? $trailerModel->id : null,
                    'trailer_type_id' => $trailerType ? $trailerType->id : null,
                    'truck_category_id' => $truckCategory ? $truckCategory->id : null,
                    'trailer_model_id' => $trailerModel ? $trailerModel->id : null,
                    'trailer_type_id' => $trailerType ? $trailerType->id : null,
                    'color' => $validate['color'],
                ]);
                $truck->save();
            }
            $user = User::where('phone', '=', $validate['user_phone'] )
                ->orWhere('login', '=',  $validate['user_phone'] )
                ->first();
            if (!$user && $validate['user_name'] && $validate['user_phone']) {
                $user = User::create([
                    'name' => $validate['user_name'],
                    'login' => $validate['user_phone'],
                    'password' => bcrypt($validate['user_phone']),
                    'company' => $validate['company'],
                    'phone' => $validate['user_phone'],
                ]);
                $user->save();
                $user->trucks()->syncWithoutDetaching([$truck->id]);
            }
            $yard = Yard::where('name', 'like', '%' . $validate['Yard'] . '%')->first();
            if (!$yard) {
                $yard = Yard::create([
                    'name' => $validate['Yard'],
                ]);
            }
            $status = Status::where('key', 'new')->first();
            $task = Task::create([
                'name' => $validate['name'],
                'user_id' => $user ? $user->id : null,
                'truck_id' => $truck ? $truck->id : null,
                'avtor' => $validate['avtor'],
                'phone' => $validate['phone'],
                'description' => $validate['description'],
                'plan_date' => $validate['plan_date'],
                'yard_id' => $yard ? $yard->id : null,
                'status_id' => $status ? $status->id : null,
            ]);
            $task->save();
            $weighing = 0;
            if( $validate['weighing']){
                $weighing = 1;
               TaskWeighing::create([
                    'task_id' => $task->id,
                    'sort_order' =>  1,
                    'statuse_weighing_id' => 1,
                    'yard_id' => $yard ? $yard->id : 1,
                ]);
                TaskWeighing::create([
                    'task_id' => $task->id,
                    'sorting_order' => Count($validate['warehouse']) + 1,
                    'statuse_weighing_id' => 2,
                    'yard_id' => $yard ? $yard->id : 1,
                ]);
            }
            foreach ($validate['warehouse'] as $warehouse_d) {
                $weighing++;
                $warehouse = Warehouse::where('name', $warehouse_d['name'])->first();
                if (!$warehouse) {
                    $warehouse = Warehouse::create([
                        'name' => $warehouse_d['name'],
                        'yard_id' => $yard ? $yard->id : null,
                    ]);
                }
                $warehouse->save();
                foreach ($warehouse_d['gates'] as $gate_name) {
                    $gate = WarehouseGates::where('name', $gate_name)
                    ->where('warehouse_id', $warehouse->id)
                    ->first();
                    if (!$gate) {
                         WarehouseGates::create([
                            'warehouse_id' => $warehouse->id,
                            'name' => $gate_name,
                        ]);
                    }  
                }
                $plan_gate = WarehouseGates::where('name', $warehouse_d['plan_gate'])
                ->where('warehouse_id', $warehouse->id)
                ->first();
                $taskLoading = TaskLoading::create([
                    'task_id' => $task->id,
                    'warehouse_id' => $warehouse ? $warehouse->id : null,
                    'sorting_order' => $weighing,
                    'warehouse_gate_plan_id' => $plan_gate ? $plan_gate->id : null,
                    'description' => $warehouse_d['description'],
                ]);
                $taskLoading->save();
                
            }
            return response()->json([
                'status' => true,
                'message' => 'Task created successfully',
                'data' => $task,
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Creating Task: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function qrProccesing(Request $request)
    {
        $qr = explode("\n", $request->qr); 
        $yard_name = $qr[0].' '.$qr[1];
        $warehouse_exp = explode(',', $qr[2]);
        $warehouse_name = $warehouse_exp[0];
        $warehouse_gate_name = $warehouse_exp[1];
        $yard = Yard::where('name', 'like', '%' . $yard_name . '%')->first();
        if (!$yard) {
            $yard = Yard::create([
                'name' => $yard_name,
            ]);
        }
        $warehouse = Warehouse::where('name', 'like', '%' . $warehouse_name . '%')->first();
        if (!$warehouse) {
            $warehouse = Warehouse::create([
                'name' => $warehouse_name,
                'yard_id' => $yard->id,
            ]);
        }
        $warehouse_gate = WarehouseGates::where('name', 'like', '%' . $warehouse_gate_name . '%')
            ->where('warehouse_id', $warehouse->id)
            ->first();
        if (!$warehouse_gate) { 
            $warehouse_gate = WarehouseGates::create([
                'name' => $warehouse_gate_name,
                'warehouse_id' => $warehouse->id,
            ]);
        }
        // $status = Status::whereIn('key', ['new', 'waiting_loading'])->get()->keyBy('key');
        $status = Status::whereIn('key', ['new', 'waiting_loading', 'on_territory'])->get()->keyBy('key');
        $waiting_loading = $status['waiting_loading'];
        $new_status = $status['on_territory'];
        


        try {
            $task = Task::query()
            ->where('tasks.id', $request->task_id)
            ->where('tasks.user_id', $request->user_id)
            ->where('tasks.status_id', $new_status->id)
            ->first();
            
            if (!$task ) {
                MessageSent::dispatch('Сканирование: '.$warehouse_exp[0].' '.$warehouse_exp[1].', рейс не найден');
                return response()->json([
                    'status' => false,
                    'message' => 'Task not found',
                ], 404);
            }
            MessageSent::dispatch('Сканирование: '.$warehouse_exp[0].' '.$warehouse_exp[1].', для выполнения рейса '.$task->name);
            $task_loading = TaskLoading::where('task_id', $task->id)
            ->where('warehouse_id', $warehouse->id)
            ->first();
            if ($task_loading) {
                $task_loading->update(['warehouse_gate_fact_id' => $warehouse_gate->id]);
            
                TaskLoadingStatus::create([
                    'task_loading_id' => $task_loading->id,
                    'staus_id' => $waiting_loading->id,
                ]);
            }else{
                MessageSent::dispatch('Сканирование: '.$warehouse_exp[0].' '.$warehouse_exp[1].', в задании нет этого склада');
                return response()->json([
                    'status' => false,
                    'message' => 'Task loading warehouse not found',
                    'data' => $waiting_loading,


                ], 404);
            }
            return response()->json([
                'status' => true,
                'message' => 'Task updated successfully'
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Updating Task: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function getTaskWeihings(Request $request)
    {
       
        try {
        $status = Status::where('key', 'on_territory')->first();
        $task_weighings = Task::query()
        ->leftJoin('statuses', 'tasks.status_id', '=', 'statuses.id')
        ->leftJoin('trucks', 'tasks.truck_id', '=', 'trucks.id')
        ->leftJoin('task_weighings', 'tasks.id', '=', 'task_weighings.task_id')
        ->leftJoin('statuse_weighings', 'task_weighings.statuse_weighing_id', '=', 'statuse_weighings.id')
        ->where('tasks.status_id', $status->id)
        ->where('tasks.yard_id', $request->yard_id)
        ->select('task_weighings.*', 'statuses.name as status_name', 'trucks.plate_number as truck_plate_number', 'statuse_weighings.name as statuse_weighing_name')
        ->get();
            return response()->json([
                'status' => true,
                'message' => 'Task Weighings retrieved successfully',
                'data' => $task_weighings,
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Retrieving Task Weighings: ' . $e->getMessage(),
            ], 500);
        }

    }

    public function updateTaskWeighing(Request $request)
    {
        try {
            $task_weighing = TaskWeighing::where('id', $request->id)->first();
            if (!$task_weighing) {
                return response()->json([
                    'status' => false,
                    'message' => 'Task Weighing not found',
                ], 404);
            }
            $task_weighing->update([
                'weight' => $request->weight,
                'description' => $request->description,
            ]);
            return response()->json([
                'status' => true,
                'message' => 'Task Weighing updated successfully',
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error Updating Task Weighing: ' . $e->getMessage(),
            ], 500);
        }
    }
}
