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
use Carbon\Carbon;

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
                        , 'a.name as warehouse_gate_fact_name', 'warehouses.coordinates as warehouse_coordinates')
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
                    'coordinates' => optional($taskLoading->first())->warehouse_coordinates

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

  public function getActualTasks(Request $request)
        {
            try {
                $today = Carbon::today();

                $tasks = Task::whereDate('plan_date', '>=', $today)
                    ->leftJoin('statuses', 'tasks.status_id', '=', 'statuses.id')
                    ->leftJoin('users', 'tasks.user_id', '=', 'users.id')
                    ->leftJoin('trucks', 'tasks.truck_id', '=', 'trucks.id')
                    ->leftJoin('yards', 'tasks.yard_id', '=', 'yards.id')
                    ->select(
                        'tasks.plan_date',
                        'statuses.name as status_name',
                        'users.name as user_name',
                        'users.phone as user_phone',
                        'trucks.plate_number as truck_plate_number',
                        'trucks.truck_model_id', // если нужно модель, надо подключить таблицу моделей
                        'yards.name as yard_name'
                    )
                    ->orderBy('plan_date', 'asc')
                    ->get();

                // Подгрузка моделей грузовиков (если надо выводить имя модели)
                // Можно сделать через join с таблицей моделей, например truck_models
                // Пример (если в таблице trucks есть поле truck_model_id):
                $truckModelIds = $tasks->pluck('truck_model_id')->unique()->filter()->values();

                $truckModels = [];
                if ($truckModelIds->isNotEmpty()) {
                    $truckModels = \DB::table('truck_models')
                        ->whereIn('id', $truckModelIds)
                        ->pluck('name', 'id');
                }

                // Формируем нужный массив с нужными полями
                $data = $tasks->map(function ($task) use ($truckModels) {
                    return [
                        'truck_plate_number' => $task->truck_plate_number,
                        'truck_model_name' => $truckModels[$task->truck_model_id] ?? 'Неизвестно',
                        'user_name' => $task->user_name,
                        'user_phone' => $task->user_phone,
                        'status_name' => $task->status_name,
                        'plan_date' => $task->plan_date,
                        'yard_name' => $task->yard_name,
                    ];
                });

                return response()->json([
                    'status' => true,
                    'message' => 'Актуальные задачи загружены',
                    'data' => $data,
                ], 200);
            } catch (\Exception $e) {
                return response()->json([
                    'status' => false,
                    'message' => 'Ошибка при загрузке актуальных задач: ' . $e->getMessage(),
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
                'task_id'=> 'nullable|integer',
                'name' => 'nullable|string|max:255',
                'user_name' => 'string|max:255',
                'login' => 'required|string|max:255',
                'user_phone' => 'nullable|string|max:255',
                'company' => 'nullable|string|max:255',
                'plate_number' => 'string|max:50',
                'trailer_plate_number' => "string|max:50",
                'truck_model' => 'string|max:255',
                'truck_category' => 'string|max:255',
                'trailer_type' => 'nullable|string|max:255',
                'trailer_model' => 'nullable|string|max:255',
                'color' => 'nullable|string|max:100',
                'vin' => 'nullable|string|max:100',
                'avtor' => 'required|string|max:255',
                'phone' => 'nullable|string|max:50',
                'Yard' => 'required|string|max:255',
                'description' => 'nullable|string|max:500',
                'plan_date' => 'date_format:Y-m-d H:i:s',
                'weighing' => 'required|boolean',
                'warehouse' => 'required|array',
                'warehouse.*.name' => 'required|string|max:255',
                'warehouse.*.sorting_order' => 'integer',
                'warehouse.*.gates' => 'array',
                'warehouse.*.gates.*' => 'string',
                'warehouse.*.plan_gate' => 'nullable|string',
                'warehouse.*.description' => 'nullable|string|max:500',
                'warehouse.*.barcode' => 'nullable|string|max:100',
                'warehouse.*.yard' => 'nullable|string|max:150',
                'warehouse.*.document' => 'nullable|string|max:150',
            ]);

            //Добавление или обновление грузовика и его модели
            $truck = Truck::where('plate_number', $validate['plate_number'])->first();
            if (!$truck && $validate['plate_number']) {
                $truckCategory = TruckCategory::where('name', 'like', '%' . $validate['truck_category'] . '%')->first();
                if (!$truckCategory && $validate['truck_category']) {
                    $truckCategory = TruckCategory::create([
                        'name' => $validate['truck_category'],
                        'ru_name' => $validate['truck_category'],
                    ]);
                }
                //Добавление или обновление модели грузовика и прицепа
                $truckModel = TruckModel::where('name', 'like', '%' . $validate['truck_model'] . '%')->first();
                if (!$truckModel && $validate['truck_model']) {
                    $truckModel = TruckModel::create([
                        'name' => $validate['truck_model'],
                        'truck_category_id' => $truckCategory->id,
                    ]);
                }
                $trailerModel = TrailerModel::where('name', 'like', '%' . $validate['trailer_model'] . '%')->first();
                if (!$trailerModel && $validate['trailer_model']) {
                    $trailerModel = TrailerModel::create([
                        'name' => $validate['trailer_model'],
                        'trailer_type_id' => $truckCategory->id,
                    ]);
                }
                $trailerType = TrailerType::where('name', 'like', '%' . $validate['trailer_type'] . '%')->first();
                if (!$trailerType && $validate['trailer_type']) {
                    $trailerType = TrailerType::create([
                        'name' => $validate['trailer_type'],
                    ]);
                }
                //добавляем грузовик
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
            }
            //--

            // Добавление или обновление пользователя
            $user = $this->getUserByLogin($validate['login'], $validate['user_name'], $validate['user_phone'], $validate['company']);
            $user->trucks()->syncWithoutDetaching([$truck->id]);
            //--

            // Добавление или обновление двора
            $yardController = new YardCotroller();
            $yard = $yardController->getYardById($validate['Yard']);
            
            // Создание задачи
            $status = Status::where('key', 'new')->first();
            
            $task = $this->getTaskById($validate['task_id'], $validate['name'], $user ? $user->id : null, $truck ? $truck->id : null, $validate['avtor'], 
            $validate['phone'], $validate['description'], $validate['plan_date'], $yard ? $yard->id : null, $status ? $status->id : null);
    
           //--


            //Задача взвешивание
            $weighing = 0;
           $weighing = $this->createUpdateTaskWeighing($task->id, $validate['weighing'], $yard ? $yard->id : 1, Count($validate['warehouse']));
            //--

            //Задачи для погрузки
            $warehouseActive=[];
           foreach ($validate['warehouse'] as $warehouse_d) {
               
            $weighing++;


                if (!$warehouse_d['yard']) continue; // Пропускаем, если нет двора
                // Проверяем или создаем двор
                $yardId = $yardController->getYardById( $warehouse_d['yard']);

                // Проверяем или создаем склад
                $WareHauseController = new WarehouseCotroller;
                $warehouse = $WareHauseController->getWarehouseById($warehouse_d['name'], $yardId, $warehouse_d['barcode']);
                
                //Если склад найден добавим в активные склады
                if($warehouse){
                    array_push($warehouseActive, $warehouse->id);
                }

                
                // foreach ($warehouse_d['gates'] as $gate_name) {
                //     $gate = WarehouseGates::where('name', $gate_name)
                //     ->where('warehouse_id',$warehouse ? $warehouse->id:null)
                //     ->first();
                //     if (!$gate) {
                //          WarehouseGates::create([
                //             'warehouse_id' => $warehouse ? $warehouse->id:null,
                //             'name' => $gate_name,
                //         ]);
                //     }  
                // }
                // $plan_gate = WarehouseGates::where('name', $warehouse_d['plan_gate'])
                // ->where('warehouse_id', $warehouse ? $warehouse->id:null)
                // ->first();

                $this->createUpdateTaskLoading( 
                    $task->id,
                    $warehouse ? $warehouse->id : null,
                    $warehouse_d['description'], 
                    $weighing, 
                    // $plan_gate ? $plan_gate->id : null, 
                    $warehouse_d['barcode'], 
                    $warehouse_d['document']
                );
                
            }
            // Удаляем неактивные склады
            TaskLoading::where('task_id', $task->id)->whereNotIn('warehouse_id', $warehouseActive)->delete();
            //--

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

    public function processShortCode(Request $request)
    {
        $code = $request->input('code'); // например 020506
        $taskId = $request->input('task_id');
        $userId = $request->input('user_id');

        if (!preg_match('/^\d{6}$/', $code)) {
            return response()->json(['status' => false, 'message' => 'Неверный формат кода'], 400);
        }

        $yardId = intval(substr($code, 0, 2));
        $warehouseId = intval(substr($code, 2, 2));
        $gateId = intval(substr($code, 4, 2));

        $yard = Yard::find($yardId);
        $warehouse = Warehouse::where('id', $warehouseId)->where('yard_id', $yardId)->first();
        $gate = WarehouseGates::where('id', $gateId)->where('warehouse_id', $warehouseId)->first();

        if (!$yard || !$warehouse || !$gate) {
            return response()->json(['status' => false, 'message' => 'Объекты не найдены'], 404);
        }

        // как в qrProccesing:
        $status = Status::whereIn('key', ['new', 'waiting_loading', 'on_territory'])->get()->keyBy('key');
        $waiting_loading = $status['waiting_loading'];
        $new_status = $status['on_territory'];

        $task = Task::where('id', $taskId)
            ->where('user_id', $userId)
            ->where('status_id', $new_status->id)
            ->first();

        if (!$task) {
            return response()->json(['status' => false, 'message' => 'Задание не найдено'], 404);
        }

        $task_loading = TaskLoading::where('task_id', $task->id)
            ->where('warehouse_id', $warehouseId)
            ->first();

        if ($task_loading) {
            $task_loading->update(['warehouse_gate_fact_id' => $gate->id]);

            TaskLoadingStatus::create([
                'task_loading_id' => $task_loading->id,
                'staus_id' => $waiting_loading->id,
            ]);

            return response()->json(['status' => true, 'message' => 'Код успешно обработан']);
        }

        return response()->json(['status' => false, 'message' => 'Задание не содержит указанный склад'], 404);
    }

    public function getGateCodes()
        {
            $data = [];

            $yards = Yard::all();
            foreach ($yards as $yard) {
                $warehouses = Warehouse::where('yard_id', $yard->id)->get();
                foreach ($warehouses as $warehouse) {
                    $gates = WarehouseGates::where('warehouse_id', $warehouse->id)->get();
                    foreach ($gates as $gate) {
                        $code = str_pad($yard->id, 2, '0', STR_PAD_LEFT)
                            . str_pad($warehouse->id, 2, '0', STR_PAD_LEFT)
                            . str_pad($gate->id, 2, '0', STR_PAD_LEFT);

                        $data[] = [
                            'yard_id' => $yard->id,
                            'yard_name' => $yard->name,
                            'warehouse_id' => $warehouse->id,
                            'warehouse_name' => $warehouse->name,
                            'gate_id' => $gate->id,
                            'gate_name' => $gate->name,
                            'code' => $code,
                        ];
                    }
                }
            }

            return response()->json([
                'status' => true,
                'data' => $data
            ]);
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

    private function createUpdateTaskLoading($task_id, $warehouse_id, $description = null, $sorting_order = null,  $barcode = null, 
    $document = null, $comment = null, $warehouse_gate_plan_id = 0, $warehouse_gate_fact_id = 0)
    {
        
        if (!$task_id || !$warehouse_id) {
            return null; // Invalid parameters
        }
        $data = [];

        if ($sorting_order) {
           $data['sorting_order'] = $sorting_order;
        }
        if ($warehouse_gate_plan_id <> 0) {
            $data['warehouse_gate_plan_id'] = $warehouse_gate_plan_id;
        }
        if ($warehouse_gate_fact_id <> 0) {
            $data['warehouse_gate_fact_id'] = $warehouse_gate_fact_id;
        }
        if ($description) {
            $data['description'] = $description;
        }
        if ($barcode) {
            $data['barcode'] = $barcode;
        }
        if ($document) {
            $data['document'] = $document;
        }
        if ($comment) {
            $data['comment'] = $comment;
        }

        $taskLoading = TaskLoading::where('task_id', $task_id)
            ->where('warehouse_id', $warehouse_id)
            ->first();
        if ($taskLoading) {
            $taskLoading->update($data);
            return $taskLoading; // Return updated TaskLoading
        } else {
            $data['task_id'] = $task_id;
            $data['warehouse_id'] = $warehouse_id;
            return TaskLoading::create($data); // Create new TaskLoading
        
        }
        
    }

    private function getUserByLogin($login, $user_name=null, $user_phone = null,$company=null )
    {
        $user = User::where('login', '=',  $login )->first();
            if (!$user && $user_name) {
                $user = User::create([
                    'name' => $user_name,
                    'login' => $login,
                    'password' => bcrypt('Aa1234'),
                    'company' => $company,
                    'phone' => $user_phone,
                ]); // Добавить аккаунт водителю если его нет
            }
        return $user;
    }

    private function createUpdateTaskWeighing($task_id, $weighing=null, $yard_id=1, $warehouseCount = 1){
        if (!$task_id) {
            return 0; 
        }
        $taskWeighing = TaskWeighing::where('task_id', $task_id)->where('yard_id',$yard_id)->first();
        if ($taskWeighing && $weighing) {
            return 1; // Проверяем наличие задачи
        } 
        else if ($taskWeighing && $weighing==null) {
            TaskWeighing::where('task_id', $task_id)->where('yard_id',$yard_id)->delete();
            return 0; // Удаляем задачу на взвешивания
        }
        else if ($taskWeighing == null && $weighing) {
            TaskWeighing::create([
                'task_id' => $task_id,
                'sort_order' =>  1,
                'statuse_weighing_id' => 1,
                'yard_id' => $yard_id,
            ]);
            TaskWeighing::create([
                'task_id' => $task_id,
                'sorting_order' => $warehouseCount + 1,
                'statuse_weighing_id' => 2,
                'yard_id' => $yard_id,
            ]);
            return 1; // Создаем задание на взвешивания
        }
    }

    private function getTaskById($task_id, $name = null, $user_id = null, $truck_id = null, $avtor = null, $phone = null, $description = null, $plan_date = null, $yard_id = null, $status_id = 1)
    {
        $task= Task::where('id', $task_id)->first();
        if (!$task) {
            $task = Task::create([
                'name' => $name,
                'user_id' => $user_id,
                'truck_id' => $truck_id,
                'avtor' => $avtor,
                'phone' => $phone,
                'description' => $description,
                'plan_date' => $plan_date,
                'yard_id' => $yard_id,
                'status_id' => $status_id 
            ]);
        }
        return $task;
    }
}
