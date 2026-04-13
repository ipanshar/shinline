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
use App\Models\EntryPermit;
use App\Models\Visitor;
use App\Models\Weighing;
use App\Models\WeighingRequirement;
use App\Services\DssPermitVehicleService;
use App\Services\DssTelegramEventRegistry;
use App\Services\DssTelegramNotificationManager;
use App\Services\EntryPermitReplacementService;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class TaskCotroller extends Controller
{
    public function __construct(
        private DssPermitVehicleService $permitVehicleService,
        private EntryPermitReplacementService $permitReplacementService,
        private DssTelegramNotificationManager $telegramNotifications,
    ) {
    }

    public function getTasks(Request $request)
    {
        try {
            // === Если передан task_id — вернуть одну задачу ===
            if ($request->has('task_id')) {
                $task = Task::query()
                    ->leftJoin('statuses', 'tasks.status_id', '=', 'statuses.id')
                    ->leftJoin('users', 'tasks.user_id', '=', 'users.id')
                    ->leftJoin('trucks', 'tasks.truck_id', '=', 'trucks.id')
                    ->leftJoin('trailer_models', 'trucks.trailer_model_id', '=', 'trailer_models.id')
                    ->leftJoin('trailer_types', 'trailer_models.trailer_type_id', '=', 'trailer_types.id')
                    ->leftJoin('truck_models', 'trucks.truck_model_id', '=', 'truck_models.id')
                    ->leftJoin('truck_categories', 'truck_models.truck_category_id', '=', 'truck_categories.id')
                    ->leftJoin('yards', 'tasks.yard_id', '=', 'yards.id')
                    ->select([
                        'tasks.*',
                        'statuses.name as status_name',
                        'users.login as user_login',
                        'users.name as user_name',
                        'users.phone as user_phone',
                        'trucks.plate_number as truck_plate_number',
                        'yards.name as yard_name',
                        'trailer_models.name as trailer_model_name',
                        'trailer_types.name as trailer_type_name',
                        'truck_models.name as truck_model_name',
                        'truck_categories.name as truck_category_name'
                    ])
                    ->where('tasks.id', $request->task_id)
                    ->first();

                if (!$task) {
                    return response()->json([
                        'status' => false,
                        'message' => 'Task not found'
                    ], 404);
                }

                // Получаем имена регионов
                $regionNames = [];
                if (!empty($task->route_regions)) {
                    $regionIds = explode(',', $task->route_regions);
                    $regions = DB::table('regions')
                        ->whereIn('id', $regionIds)
                        ->pluck('name')
                        ->toArray();
                    $regionNames = implode(', ', $regions);
                }

                $taskLoadings = TaskLoading::where('task_id', $task->id)
                    ->leftJoin('warehouses', 'task_loadings.warehouse_id', '=', 'warehouses.id')
                    ->leftJoin('warehouse_gates', 'task_loadings.warehouse_gate_plan_id', '=', 'warehouse_gates.id')
                    ->leftJoin('warehouse_gates as a', 'task_loadings.warehouse_gate_fact_id', '=', 'a.id')
                    ->select(
                        'task_loadings.*',
                        'warehouses.name as warehouse_name',
                        'warehouse_gates.name as warehouse_gate_plan_name',
                        'a.name as warehouse_gate_fact_name',
                        'warehouses.coordinates as warehouse_coordinates'
                    )
                    ->get();

                $taskWeighings = $this->buildTaskWeighingsForDisplay($task->id);

                return response()->json([
                    'status' => true,
                    'message' => 'Task retrieved successfully',
                    'data' => [
                        'id' => $task->id,
                        'name' => $task->name,
                        'status_id' => $task->status_id,
                        'status_name' => $task->status_name,
                        'user_id' => $task->user_id,
                        'user_name' => $task->user_name,
                        'user_login' => $task->user_login,
                        'user_phone' => $task->user_phone,
                        'truck_id' => $task->truck_id,
                        'truck_plate_number' => $task->truck_plate_number,
                        'trailer_plate_number' => $task->trailer_number,
                        'truck_model_name' => $task->truck_model_name,
                        'truck_category_name' => $task->truck_category_name,
                        'trailer_model_name' => $task->trailer_model_name,
                        'trailer_type_name' => $task->trailer_type_name,
                        'yard_id' => $task->yard_id,
                        'yard_name' => $task->yard_name,
                        'avtor' => $task->avtor,
                        'company' => $task->company,
                        'description' => $task->description,
                        'total_weight' => $task->total_weight !== null ? (float) $task->total_weight : null,
                        'count_boxes' => $task->count_boxes,
                        'address' => $task->address,
                        'phone' => $task->phone,
                        'plan_date' => $task->plan_date,
                        'begin_date' => $task->begin_date,
                        'end_date' => $task->end_date,
                        'created_at' => $task->created_at,
                        'route_regions' => $task->route_regions,
                        'region_names' => $regionNames,
                        'task_loadings' => $taskLoadings,
                        'task_weighings' => $taskWeighings,
                        'coordinates' => optional($taskLoadings->first())->warehouse_coordinates,
                    ]
                ], 200);
            }

            // === Если task_id НЕ передан — вернуть список задач ===
            $tasks = Task::query();

            // Фильтрация по параметрам
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
            if ($request->has('plan_date_warehouse')) {
                $tasks->whereExists(function ($query) use ($request) {
                    $query->from('task_loadings')
                          ->whereRaw('task_loadings.task_id = tasks.id')
                          ->where('task_loadings.plane_date', '>=', $request->plan_date_warehouse);
                });
            }
            if ($request->has('begin_date')) {
                $tasks->where('tasks.begin_date', '>=', $request->begin_date);
            }
            if ($request->has('end_date')) {
                $tasks->where('tasks.end_date', '<=', $request->end_date);
            }
            if ($request->has('warehouse_id')) {
                $tasks->whereExists(function ($query) use ($request) {
                    $query->from('task_loadings')
                          ->whereRaw('task_loadings.task_id = tasks.id')
                          ->where('task_loadings.warehouse_id', $request->warehouse_id);
                });
            }
            if ($request->has('search')) {
                $tasks->where(function ($q) use ($request) {
                    $q->where('tasks.name', 'like', '%' . $request->search . '%')
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
                ->select(
                    'tasks.*',
                    'statuses.name as status_name',
                    'users.login as user_login',
                    'users.name as user_name',
                    'users.phone as user_phone',
                    'trucks.plate_number as truck_plate_number',
                    'yards.name as yard_name',
                    'trailer_models.name as trailer_model_name',
                    'trailer_types.name as trailer_type_name',
                    'truck_models.name as truck_model_name',
                    'truck_categories.name as truck_category_name'
                )
                ->orderBy('tasks.created_at', 'desc');

            $cur_page = 0;
            $last_page = 0;
            $total = 0;
            if ($request->has('page')) {
                $paginated = $tasks->paginate(50);
                $cur_page = $paginated->currentPage();
                $last_page = $paginated->lastPage();
                $total = $paginated->total();
                $tasks = $paginated->items();
            } else {
                $tasks = $tasks->limit(150)->get();
                $total = count($tasks);
            }

            if (!$tasks) {
                return response()->json([
                    'status' => false,
                    'message' => 'No tasks found',
                    'data' => []
                ], 404);
            }

            $data = [];
            foreach ($tasks as $task) {
                $taskLoadings = TaskLoading::where('task_id', $task->id)
                    ->leftJoin('warehouses', 'task_loadings.warehouse_id', '=', 'warehouses.id')
                    ->leftJoin('warehouse_gates', 'task_loadings.warehouse_gate_plan_id', '=', 'warehouse_gates.id')
                    ->leftJoin('warehouse_gates as a', 'task_loadings.warehouse_gate_fact_id', '=', 'a.id')
                    ->select(
                        'task_loadings.*',
                        'warehouses.name as warehouse_name',
                        'warehouse_gates.name as warehouse_gate_plan_name',
                        'a.name as warehouse_gate_fact_name',
                        'warehouses.coordinates as warehouse_coordinates'
                    )
                    ->get();

                $taskWeighings = $this->buildTaskWeighingsForDisplay($task->id);

                // Получаем имена регионов
                $regionNames = [];
                if (!empty($task->route_regions)) {
                    $regionIds = explode(',', $task->route_regions);
                    $regions = DB::table('regions')
                        ->whereIn('id', $regionIds)
                        ->pluck('name')
                        ->toArray();
                    $regionNames = implode(', ', $regions);
                }

                $data[] = [
                    'id' => $task->id,
                    'name' => $task->name,
                    'status_id' => $task->status_id,
                    'status_name' => $task->status_name,
                    'route_regions' => $task->route_regions,
                    'region_names' => $regionNames,
                    'user_id' => $task->user_id,
                    'user_name' => $task->user_name,
                    'user_login' => $task->user_login,
                    'user_phone' => $task->user_phone,
                    'truck_id' => $task->truck_id,
                    'truck_plate_number' => $task->truck_plate_number,
                    'trailer_plate_number' => $task->trailer_number,
                    'truck_model_name' => $task->truck_model_name,
                    'truck_category_name' => $task->truck_category_name,
                    'trailer_model_name' => $task->trailer_model_name,
                    'trailer_type_name' => $task->trailer_type_name,
                    'yard_id' => $task->yard_id,
                    'yard_name' => $task->yard_name,
                    'avtor' => $task->avtor,
                    'company' => $task->company,
                    'description' => $task->description,
                    'total_weight' => $task->total_weight !== null ? (float) $task->total_weight : null,
                    'count_boxes' => $task->count_boxes,
                    'address' => $task->address,
                    'phone' => $task->phone,
                    'plan_date' => $task->plan_date,
                    'begin_date' => $task->begin_date,
                    'end_date' => $task->end_date,
                    'created_at' => $task->created_at,
                    'task_loadings' => $taskLoadings,
                    'task_weighings' => $taskWeighings,
                    'coordinates' => optional($taskLoadings->first())->warehouse_coordinates,
                ];
            }

            return response()->json([
                'status' => true,
                'message' => 'Tasks retrieved successfully',
                'data' => [
                    'tasks' => $data,
                    'totalPages' => $last_page,
                    'total' => $total,
                    'current_page' => $cur_page,
                    'last_page' => $last_page,
                ],
            ], 200);
        } catch (\Exception $e) {
            Log::error('getTasks - Ошибка', [
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
                'request' => $request->all(),
            ]);

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
                    'tasks.name',
                    'tasks.description',
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
                $truckModels = DB::table('truck_models')
                    ->whereIn('id', $truckModelIds)
                    ->pluck('name', 'id');
            }

            // Формируем нужный массив с нужными полями
            $data = $tasks->map(function ($task) use ($truckModels) {
                return [
                    'truck_plate_number' => $task->truck_plate_number,
                    'truck_model_name' => $truckModels[$task->truck_model_id] ?? 'Неизвестно',
                    'user_name' => $task->user_name,
                    'name' => $task->name,
                    'description' => $task->description,
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
                'route_regions' => 'array',
                'route_regions.*' => 'integer',
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
  
            
            // Очистка task_id от пробелов и преобразование в число
            if ($request->has('task_id') && $request->task_id) {
                $cleanTaskId = str_replace(' ', '', $request->task_id);
                $request->merge(['task_id' => is_numeric($cleanTaskId) ? (int)$cleanTaskId : null]);
            }

            $validate = $request->validate([
                'task_id' => 'nullable|integer',
                'name' => 'nullable|string|max:255',
                'user_name' => 'nullable|string|max:255',
                'login' => 'nullable|string|max:255',
                'user_phone' => 'nullable|string|max:255',
                'company' => 'nullable|string|max:255',
                'plate_number' => 'nullable|string|max:50',
                'trailer_plate_number' => "nullable|string|max:50",
                'truck_model' => 'nullable|string|max:255',
                'truck_category' => 'nullable|string|max:255',
                'trailer_type' => 'nullable|string|max:255',
                'trailer_model' => 'nullable|string|max:255',
                'color' => 'nullable|string|max:100',
                'vin' => 'nullable|string|max:100',
                'avtor' => 'required|string|max:255',
                'phone' => 'nullable|string|max:50',
                'Yard' => 'nullable|string|max:255',
                'description' => 'nullable|string|max:500',
                'plan_date' => 'nullable|date_format:Y-m-d H:i:s',
                'end_date' => 'nullable|date_format:Y-m-d H:i:s',
                'total_weight' => 'nullable|numeric|min:0|max:999999.99',
                'count_boxes' => 'nullable|integer|min:0|max:1000000',
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
                'warehouse.*.arrival_at' => 'nullable|date_format:Y-m-d H:i:s',
                'warehouse.*.departure_at' => 'nullable|date_format:Y-m-d H:i:s',
            ]);

            $onePermission = $request->has('one_permission')
                ? (bool) $request->one_permission
                : true;

            $needsWeighing = (bool) $validate['weighing'] || $onePermission;
            $integrationIssuerId = $this->getIntegrationIssuerId();


            //Добавление или обновление грузовика и его модели
            $normalizedPlateNumber = Truck::normalizePlateNumber($validate['plate_number'] ?? null);
            $normalizedTrailerNumber = Truck::normalizePlateNumber($validate['trailer_plate_number'] ?? null);

            $truckCategory = $this->resolveTruckCategory($validate['truck_category'] ?? null);
            $truckModel = $this->resolveTruckModel($validate['truck_model'] ?? null, $truckCategory?->id);
            $trailerType = $this->resolveTrailerType($validate['trailer_type'] ?? null);
            $trailerModel = $this->resolveTrailerModel($validate['trailer_model'] ?? null, $trailerType?->id);

            $truck = $normalizedPlateNumber ? $this->findTruckByPlateNumber($normalizedPlateNumber) : null;

            if (!$truck && $normalizedPlateNumber) {
                $truck = Truck::create([
                    'user_id' => 1,
                    'vin' => $validate['vin'] ?? null,
                    'plate_number' => $normalizedPlateNumber,
                    'trailer_number' => $normalizedTrailerNumber,
                    'truck_model_id' => $truckModel?->id,
                    'trailer_model_id' => $trailerModel?->id,
                    'trailer_type_id' => $trailerType?->id,
                    'truck_category_id' => $truckCategory?->id,
                    'color' => $validate['color'] ?? null,
                ]);
            } elseif ($truck) {
                $truckUpdateData = array_filter([
                    'vin' => $validate['vin'] ?? null,
                    'plate_number' => $normalizedPlateNumber,
                    'trailer_number' => $normalizedTrailerNumber,
                    'truck_model_id' => $truckModel?->id,
                    'trailer_model_id' => $trailerModel?->id,
                    'trailer_type_id' => $trailerType?->id,
                    'truck_category_id' => $truckCategory?->id,
                    'color' => $validate['color'] ?? null,
                ], static fn ($value) => $value !== null && $value !== '');

                if (!empty($truckUpdateData)) {
                    $truck->fill($truckUpdateData);
                    if ($truck->isDirty()) {
                        $truck->save();
                    }
                }
            }
            //--

            // Добавление или обновление пользователя
            $user = $this->getUserByLogin($validate['login'], $validate['user_name'], $validate['user_phone'], $validate['company']);
           
            
            if ($user && $truck) {
                $user->trucks()->syncWithoutDetaching([$truck->id]);
            }

            //--

            // Добавление или обновление двора
            $yardController = new YardCotroller();
            $yard = $yardController->getYardById($validate['Yard']);
        

            // Создание задачи
            $status = null;
            $statuses = Status::whereIn('key', ['new', 'left_territory', 'on_territory'])->get()->keyBy('key');
            $statusNew = $statuses['new'];
            $on_territory = $statuses['on_territory'];

            // Проверяем, есть ли уже посетитель с таким грузовиком
            $visitor = Visitor::where('truck_id', $truck ? $truck->id : 0)
                ->where('status_id', $on_territory->id)
                ->first();
            if ($visitor) {
                $status = $on_territory;
                 $yard = Yard::where('id', '=', $visitor->yard_id )->first(); // Получаем двор из посетителя
            } else {
                $status = $statusNew;
            }

            if (!$yard) {
                $yard = Yard::query()->orderBy('id')->first();

                if (!$yard) {
                    $yard = Yard::create([
                        'name' => 'Основной двор',
                    ]);
                }
            }


            $task = $this->getTaskById(
                $validate['task_id'],
                $validate['name'],
                $user ? $user->id : null,
                $truck ? $truck->id : null,
                $validate['avtor'],
                $validate['phone'],
                $validate['description'],
                $validate['plan_date'],
                $yard ? $yard->id : 1,
                $status ? $status->id : null,
                $visitor ? $visitor->entry_date : null,
                $visitor ? $visitor->exit_date : null,
                $request->has('create_user_id') ? $request->create_user_id : null,
                $request->has('specification') ? $request->specification : null,
                $request->has('reward') ? $request->reward : null,
                $validate['total_weight'] ?? null,
                $validate['count_boxes'] ?? null

            );


            if ($yard && $truck && $task) {
                // Проверяем или создаем разрешение на въезд
                $endDate = $request->has('end_date') && $request->end_date 
                    ? $request->end_date 
                    : ($validate['plan_date'] ?? now()->format('Y-m-d H:i:s'));
                
                $this->getPermitById(
                    $truck->id,
                    $yard->id,
                    $request->has('create_user_id') ? $request->create_user_id : null,
                    $task->id,
                    $onePermission,
                    $validate['plan_date'] ?? now()->format('Y-m-d H:i:s'),
                    $endDate,
                    $integrationIssuerId,
                );
            }
            //--

            // Дедупликация складов по имени - объединяем документы для одинаковых складов
            $uniqueWarehouses = [];
            foreach ($validate['warehouse'] as $warehouse_d) {
                $warehouseName = trim($warehouse_d['name']);
                
                if (isset($uniqueWarehouses[$warehouseName])) {
                    // Склад уже есть - объединяем документы
                    $existing = &$uniqueWarehouses[$warehouseName];
                    
                    // Объединяем документы через запятую
                    if (!empty($warehouse_d['document'])) {
                        if (!empty($existing['document'])) {
                            $existing['document'] .= ', ' . $warehouse_d['document'];
                        } else {
                            $existing['document'] = $warehouse_d['document'];
                        }
                    }
                    
                    // Объединяем barcodes через запятую  
                    if (!empty($warehouse_d['barcode'])) {
                        if (!empty($existing['barcode'])) {
                            $existing['barcode'] .= ', ' . $warehouse_d['barcode'];
                        } else {
                            $existing['barcode'] = $warehouse_d['barcode'];
                        }
                    }
                    
                    // Объединяем описания
                    if (!empty($warehouse_d['description'])) {
                        if (!empty($existing['description'])) {
                            $existing['description'] .= '; ' . $warehouse_d['description'];
                        } else {
                            $existing['description'] = $warehouse_d['description'];
                        }
                    }
                    
                    // Берём самое раннее arrival_at
                    if (!empty($warehouse_d['arrival_at'])) {
                        if (empty($existing['arrival_at']) || $warehouse_d['arrival_at'] < $existing['arrival_at']) {
                            $existing['arrival_at'] = $warehouse_d['arrival_at'];
                        }
                    }
                    
                    // Берём самое позднее departure_at
                    if (!empty($warehouse_d['departure_at'])) {
                        if (empty($existing['departure_at']) || $warehouse_d['departure_at'] > $existing['departure_at']) {
                            $existing['departure_at'] = $warehouse_d['departure_at'];
                        }
                    }
                } else {
                    // Новый склад - добавляем
                    $uniqueWarehouses[$warehouseName] = $warehouse_d;
                }
            }
            
            // Переиндексируем и пересчитываем sorting_order
            $deduplicatedWarehouses = array_values($uniqueWarehouses);
            foreach ($deduplicatedWarehouses as $index => &$wh) {
                $wh['sorting_order'] = $index;
            }
            unset($wh);

            //Задача взвешивание
            $weighing = 0;
            $weighing = $this->createUpdateTaskWeighing(
                $task->id, 
                $needsWeighing,
                $yard ? $yard->id : 1, 
                count($deduplicatedWarehouses), // Используем количество уникальных складов
                $truck ? $truck->id : null,
                $validate['plate_number'] ?? null
            );
            //--

            //Задачи для погрузки
            $warehouseActive = [];
            
            foreach ($deduplicatedWarehouses as $warehouse_d) {

                $weighing++;

                // Используем двор из задачи, если не указан для склада
                $yardId = null;
                if (!empty($warehouse_d['yard'])) {
                    // Если указан двор для склада - используем его
                    $yardId = $yardController->getYardById($warehouse_d['yard']);
                } else {
                    // Иначе используем двор из основной задачи
                    $yardId = $yard;
                }


                if ($yardId && $truck && $task) {
                    // Проверяем или создаем разрешение на въезд
                    $warehouseEndDate = $request->has('end_date') && $request->end_date 
                        ? $request->end_date 
                        : ($validate['plan_date'] ?? now()->format('Y-m-d H:i:s'));
                    
                    $this->getPermitById(
                        $truck->id,
                        $yardId->id,
                        $request->has('create_user_id') ? $request->create_user_id : null,
                        $task->id,
                        $onePermission,
                        $validate['plan_date'] ?? now()->format('Y-m-d H:i:s'),
                        $warehouseEndDate,
                        $integrationIssuerId,
                    );
                }
                // Проверяем или создаем склад
                $WareHauseController = new WarehouseCotroller;
                $warehouse = $WareHauseController->getWarehouseById($warehouse_d['name'], $yardId, $warehouse_d['barcode']);

                // Пропускаем если склад не создан
                if (!$warehouse) {
                    continue; // ⚠️ Склад не найден/не создан - пропускаем
                }

                //Если склад найден добавим в активные склады
                array_push($warehouseActive, $warehouse->id);

                // Поиск ворот по имени
                $plan_gate = null;
                if (!empty($warehouse_d['plan_gate'])) {
                    $plan_gate = WarehouseGates::where('name', $warehouse_d['plan_gate'])
                        ->where('warehouse_id', $warehouse->id)
                        ->first();
                }

                $this->createUpdateTaskLoading(
                    $task->id,
                    $warehouse->id, // ✅ Всегда валидный ID
                    $warehouse_d['description'],
                    $weighing,
                    $warehouse_d['barcode'],
                    $warehouse_d['document'],
                    null,
                    $plan_gate ? $plan_gate->id : 0,
                    0,
                    $validate['plan_date'],
                    $warehouse_d['arrival_at'] ?? null,
                    $warehouse_d['departure_at'] ?? null
                );
            }
            // Удаляем неактивные склады (только если есть активные)
            if (!empty($warehouseActive)) {
                $warehouseNotActive = TaskLoading::where('task_id', $task->id)
                    ->whereNotIn('warehouse_id', $warehouseActive)
                    ->get();
                foreach ($warehouseNotActive as $notActive) {
                    if ($truck && $task && $notActive->yard_id) {
                        EntryPermit::where('task_id', $task->id)
                            ->where('truck_id', $truck->id)
                            ->where('yard_id', $notActive->yard_id)
                            ->delete();
                    }
                    $notActive->delete();
                }
            }
            //--
            // Отправляем уведомление в Telegram
            if ($task && $visitor ) {
                if($visitor->task_id == null) {
                     $visitor->update([
                    'task_id' => $task->id,
                ]);
                $ActualWarehouse = Warehouse::whereIn('id', $warehouseActive)->get();
                    $this->telegramNotifications->queue(
                    DssTelegramEventRegistry::EVENT_VISITOR_TASK_ALREADY_ON_TERRITORY,
                    '<b>🚛 Уже на территории ' . e($yard->name) .  "</b>\n\n" .
                        '<b>🏷️ ТС:</b> '  . e($request->plate_number) . "\n" .
                        '<b>📦 Задание:</b> ' . e($task->name) . "\n" .
                        '<b>📝 Описание:</b> ' . e($task->description) . "\n" .
                        '<b>👤 Водитель:</b> ' . ($task->user_id ? e(DB::table('users')->where('id', $task->user_id)->value('name')) .
                            ' (' . e(DB::table('users')->where('id', $task->user_id)->value('phone')) . ')' : 'Не указан') . "\n" .
                        '<b>✍️ Автор:</b> ' . e($task->avtor) . "\n" .
                        '<b>🏬 Склады:</b> ' . e($ActualWarehouse->pluck('name')->implode(', ')) . "\n",
                        ['task_id' => $task->id]
                );
                }
               
            }
            return response()->json([
                'status' => true,
                'message' => 'Task created successfully',
                'data' => $task,
            ], 200);
        } catch (\Illuminate\Validation\ValidationException $e) {
            Log::error('addApiTask - Ошибка валидации:', [
                'errors' => $e->errors(),
                'request' => $request->all()
            ]);
            return response()->json([
                'status' => false,
                'message' => 'Validation Error',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            Log::error('addApiTask - Ошибка:', [
                'message' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
                'request' => $request->all()
            ]);
            return response()->json([
                'status' => false,
                'message' => 'Error Creating Task: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function qrProccesing(Request $request)
    {
        $request->validate([
            'qr' => 'required|string|max:5',
            'task_id' => 'required|integer',
            'user_id' => 'required|integer',
        ]);

        $user = User::find($request->user_id);
        if (!$user) {
            return response()->json([
                'status' => false,
                'message' => 'User not found',
            ], 404);
        }


        $warehouse_gate = WarehouseGates::where('code',  $request->qr)->first();
        if (!$warehouse_gate) {
            return response()->json([
                'status' => false,
                'message' => 'Warehouse gate not found',
            ], 404);
        }
        $warehouse = Warehouse::where('id', $warehouse_gate->warehouse_id)->first();
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

            if (!$task) {
                $this->telegramNotifications->queue(
                    DssTelegramEventRegistry::EVENT_TASK_SCAN_FAILED,
                    '<b>⚠️ Ошибка сканирования</b>' . "\n\n" .
                        '<b>👤 Пользователь:</b> ' . e($user->name) . "\n" .
                        '<b>🏠 Склад:</b> ' . e($warehouse->name) . "\n" .
                        '<b>🚪 Ворота:</b> ' . e($warehouse_gate->name) . "\n" .
                        '<i>❗ Рейс не найден</i>',
                    ['task_id' => $request->task_id, 'user_id' => $request->user_id]
                );
                MessageSent::dispatch('Пользователь:' . $user->name . '\nСканирование: склад - ' . $warehouse->name . ' ворота' . $warehouse_gate->name . ', рейс не найден');
                return response()->json([
                    'status' => false,
                    'message' => 'Task not found',
                ], 404);
            }
            $this->telegramNotifications->queue(
                DssTelegramEventRegistry::EVENT_TASK_SCAN_SUCCESS,
                '<b>🚚 Новое сканирование!</b>' . "\n\n" .
                    '<b>👤 Пользователь:</b> ' . e($user->name) . "\n" .
                    '<b>🏠 Склад:</b> ' . e($warehouse->name) . "\n" .
                    '<b>🚪 Ворота:</b> ' . e($warehouse_gate->name) . "\n" .
                    '<b>📦 Рейс:</b> ' . e($task->name),
                ['task_id' => $task->id, 'warehouse_id' => $warehouse->id]
            );
            MessageSent::dispatch('Пользователь:' . $user->name . '\nСканирование: склад - ' . $warehouse->name . ' ворота' . $warehouse_gate->name . ', для выполнения рейса ' . $task->name);
            $task_loading = TaskLoading::where('task_id', $task->id)
                ->where('warehouse_id', $warehouse->id)
                ->first();
            if ($task_loading) {
                $task_loading->update(['warehouse_gate_fact_id' => $warehouse_gate->id]);

                TaskLoadingStatus::create([
                    'task_loading_id' => $task_loading->id,
                    'staus_id' => $waiting_loading->id,
                ]);
            } else {
                $this->telegramNotifications->queue(
                    DssTelegramEventRegistry::EVENT_TASK_SCAN_WAREHOUSE_MISMATCH,
                    '<b>⚠️ Внимание!</b>' . "\n\n" .
                        '<b>👤 Пользователь:</b> ' . e($user->name) . "\n" .
                        '<b>🏠 Сканирование:</b> склад — ' . e($warehouse->name) . ', ворота — ' . e($warehouse_gate->name) . "\n" .
                        '<i>❗ Этот склад не найден в задании</i>',
                    ['task_id' => $task->id, 'warehouse_id' => $warehouse->id]
                );

                MessageSent::dispatch('Пользователь:' . $user->name . '\nСканирование: склад - ' . $warehouse->name . ' ворота' . $warehouse_gate->name . ', в задании нет этого склада');
                return response()->json([
                    'status' => false,
                    'message' => 'Task loading warehouse not found',
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

    private function findTruckByPlateNumber(?string $plateNumber): ?Truck
    {
        $normalizedPlate = Truck::normalizePlateNumber($plateNumber);

        if (!$normalizedPlate) {
            return null;
        }

        return Truck::whereRaw(
            "REPLACE(REPLACE(UPPER(plate_number), ' ', ''), '-', '') = ?",
            [$normalizedPlate]
        )->first();
    }

    private function resolveTruckCategory(?string $truckCategoryName): ?TruckCategory
    {
        $truckCategoryName = trim((string) $truckCategoryName);

        if ($truckCategoryName === '') {
            return null;
        }

        $truckCategory = TruckCategory::where('name', 'like', '%' . $truckCategoryName . '%')->first();

        if ($truckCategory) {
            return $truckCategory;
        }

        return TruckCategory::create([
            'name' => $truckCategoryName,
            'ru_name' => $truckCategoryName,
        ]);
    }

    private function resolveTruckModel(?string $truckModelName, ?int $truckCategoryId = null): ?TruckModel
    {
        $truckModelName = trim((string) $truckModelName);

        if ($truckModelName === '') {
            return null;
        }

        $truckModel = TruckModel::where('name', 'like', '%' . $truckModelName . '%')->first();

        if ($truckModel) {
            if ($truckCategoryId && !$truckModel->truck_category_id) {
                $truckModel->truck_category_id = $truckCategoryId;
                $truckModel->save();
            }

            return $truckModel;
        }

        return TruckModel::create([
            'name' => $truckModelName,
            'truck_category_id' => $truckCategoryId,
        ]);
    }

    private function resolveTrailerType(?string $trailerTypeName): ?TrailerType
    {
        $trailerTypeName = trim((string) $trailerTypeName);

        if ($trailerTypeName === '') {
            return null;
        }

        $trailerType = TrailerType::where('name', 'like', '%' . $trailerTypeName . '%')->first();

        if ($trailerType) {
            return $trailerType;
        }

        return TrailerType::create([
            'name' => $trailerTypeName,
        ]);
    }

    private function resolveTrailerModel(?string $trailerModelName, ?int $trailerTypeId = null): ?TrailerModel
    {
        $trailerModelName = trim((string) $trailerModelName);

        if ($trailerModelName === '') {
            return null;
        }

        $trailerModel = TrailerModel::where('name', 'like', '%' . $trailerModelName . '%')->first();

        if ($trailerModel) {
            if ($trailerTypeId && !$trailerModel->trailer_type_id) {
                $trailerModel->trailer_type_id = $trailerTypeId;
                $trailerModel->save();
            }

            return $trailerModel;
        }

        return TrailerModel::create([
            'name' => $trailerModelName,
            'trailer_type_id' => $trailerTypeId,
        ]);
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

    private function createUpdateTaskLoading(
        $task_id,
        $warehouse_id,
        $description = null,
        $sorting_order = null,
        $barcode = null,
        $document = null,
        $comment = null,
        $warehouse_gate_plan_id = 0,
        $warehouse_gate_fact_id = 0,
        $plan_date = null,
        $arrival_at = null,
        $departure_at = null
    ) {
        if (!$task_id || !$warehouse_id) {
            return null; // Invalid parameters
        }
        $data = [];
        
        // Обработка plan_date для каждого склада
        if ($plan_date) {
            if (!$sorting_order || $sorting_order == 1) {
                // Для первого склада используем исходную дату
                $data['plane_date'] = $plan_date;
            } else {
                // Для последующих складов добавляем по 30 минут к исходной дате
                $date = Carbon::parse($plan_date);
                $additional_minutes = ($sorting_order - 1) * 30;
                $data['plane_date'] = $date->addMinutes($additional_minutes)->format('Y-m-d H:i:s');
            }
        }

        // Время прибытия и убытия ТС на складе (из 1С)
        if ($arrival_at !== null) {
            $data['arrival_at'] = $arrival_at;
        }
        if ($departure_at !== null) {
            $data['departure_at'] = $departure_at;
        }

        // Всегда обновляем эти поля (даже если пустые)
        $data['sort_order'] = $sorting_order;
        $data['warehouse_gate_plan_id'] = $warehouse_gate_plan_id;
        $data['warehouse_gate_fact_id'] = $warehouse_gate_fact_id;
        $data['description'] = $description;
        $data['barcode'] = $barcode;
        $data['document'] = $document;
        $data['comment'] = $comment;

        // Ищем существующую запись по task_id и sort_order (порядок склада)
        $taskLoading = TaskLoading::where('task_id', $task_id)
            ->where('sort_order', $sorting_order)
            ->first();
            
        if ($taskLoading) {
            // Обновляем существующую запись (может измениться склад)
            $data['warehouse_id'] = $warehouse_id;
            $taskLoading->update($data);
            return $taskLoading;
        } else {
            // Создаем новую запись
            $data['task_id'] = $task_id;
            $data['warehouse_id'] = $warehouse_id;
            return TaskLoading::create($data);
        }
    }

    private function getUserByLogin($login, $user_name = null, $user_phone = null, $company = null)
    {
        // Сначала ищем по логину, если он передан
        if (!empty($login)) {
            $user = User::where('login', '=', $login)->first();
            if ($user) {
                return $user;
            }
        }
        
        // Если по логину не нашли - ищем по точному совпадению имени
        if (!empty($user_name)) {
            $user = User::where('name', '=', trim($user_name))->first();
            if ($user) {
                // Нашли по имени - обновляем логин если он пустой у существующего
                if (empty($user->login) && !empty($login)) {
                    $user->login = $login;
                    $user->save();
                }
                return $user;
            }
        }
        
        // Пользователь не найден - создаём нового
        if (!empty($user_name)) {
            // Генерируем логин если не передан
            $finalLogin = !empty($login) ? $login : $this->generateLoginFromName($user_name);
            
            $user = User::create([
                'name' => trim($user_name),
                'login' => $finalLogin,
                'password' => bcrypt('Aa1234'),
                'company' => $company,
                'phone' => $user_phone ?: null,
            ]);
            Log::info("addApiTask - Создан новый пользователь: login={$finalLogin}, name={$user_name}");
            return $user;
        }
        
        Log::warning('addApiTask - Не удалось создать/найти пользователя: login и user_name пустые');
        return null;
    }
    
    /**
     * Генерация логина из имени (транслитерация)
     */
    private function generateLoginFromName($name)
    {
        // Простая транслитерация кириллицы
        $translitMap = [
            'а' => 'a', 'б' => 'b', 'в' => 'v', 'г' => 'g', 'д' => 'd',
            'е' => 'e', 'ё' => 'e', 'ж' => 'zh', 'з' => 'z', 'и' => 'i',
            'й' => 'y', 'к' => 'k', 'л' => 'l', 'м' => 'm', 'н' => 'n',
            'о' => 'o', 'п' => 'p', 'р' => 'r', 'с' => 's', 'т' => 't',
            'у' => 'u', 'ф' => 'f', 'х' => 'h', 'ц' => 'c', 'ч' => 'ch',
            'ш' => 'sh', 'щ' => 'sch', 'ъ' => '', 'ы' => 'y', 'ь' => '',
            'э' => 'e', 'ю' => 'yu', 'я' => 'ya',
            'А' => 'a', 'Б' => 'b', 'В' => 'v', 'Г' => 'g', 'Д' => 'd',
            'Е' => 'e', 'Ё' => 'e', 'Ж' => 'zh', 'З' => 'z', 'И' => 'i',
            'Й' => 'y', 'К' => 'k', 'Л' => 'l', 'М' => 'm', 'Н' => 'n',
            'О' => 'o', 'П' => 'p', 'Р' => 'r', 'С' => 's', 'Т' => 't',
            'У' => 'u', 'Ф' => 'f', 'Х' => 'h', 'Ц' => 'c', 'Ч' => 'ch',
            'Ш' => 'sh', 'Щ' => 'sch', 'Ъ' => '', 'Ы' => 'y', 'Ь' => '',
            'Э' => 'e', 'Ю' => 'yu', 'Я' => 'ya'
        ];
        
        // Транслитерируем всё имя
        $login = strtr(trim($name), $translitMap);
        $login = preg_replace('/\s+/', '_', $login); // Пробелы в подчёркивания
        $login = preg_replace('/[^a-z0-9_]/i', '', $login); // Только буквы, цифры и _
        $login = strtolower($login);
        
        // Проверяем уникальность, добавляем число только если нужно
        $baseLogin = $login;
        $counter = 1;
        while (User::where('login', $login)->exists()) {
            $login = $baseLogin . '_' . $counter;
            $counter++;
        }
        
        return $login;
    }

    private function buildTaskWeighingsForDisplay(int $taskId)
    {
        $taskWeighings = TaskWeighing::query()
            ->where('task_id', $taskId)
            ->leftJoin('statuse_weighings', 'task_weighings.statuse_weighing_id', '=', 'statuse_weighings.id')
            ->select('task_weighings.*', 'statuse_weighings.name as statuse_weighing_name')
            ->orderByRaw('COALESCE(task_weighings.sort_order, task_weighings.id) asc')
            ->get()
            ->map(function ($item) {
                $item->sort_order = $item->sort_order ?? $item->id;
                return $item;
            })
            ->values();

        $actualWeighings = Weighing::query()
            ->where('task_id', $taskId)
            ->whereIn('weighing_type', [Weighing::TYPE_ENTRY, Weighing::TYPE_EXIT])
            ->orderBy('weighed_at')
            ->get();

        $entryWeighing = $actualWeighings
            ->where('weighing_type', Weighing::TYPE_ENTRY)
            ->sortByDesc('weighed_at')
            ->first();

        $exitWeighing = $actualWeighings
            ->where('weighing_type', Weighing::TYPE_EXIT)
            ->sortByDesc('weighed_at')
            ->first();

        $result = $taskWeighings->map(function ($item) {
            return clone $item;
        })->values();

        if ($entryWeighing) {
            if ($result->count() > 0) {
                $result[0]->weight = (float) $entryWeighing->weight;
                $result[0]->updated_at = $entryWeighing->weighed_at;
                $result[0]->sort_order = $result[0]->sort_order ?? 1;
            } else {
                $result->push((object) [
                    'id' => 'weighing-entry-' . $entryWeighing->id,
                    'task_id' => $taskId,
                    'sort_order' => 1,
                    'statuse_weighing_id' => 1,
                    'statuse_weighing_name' => 'Въездное взвешивание',
                    'weight' => (float) $entryWeighing->weight,
                    'updated_at' => $entryWeighing->weighed_at,
                    'description' => $entryWeighing->notes,
                    'yard_id' => $entryWeighing->yard_id,
                ]);
            }
        }

        if ($exitWeighing) {
            if ($result->count() > 1) {
                $result[1]->weight = (float) $exitWeighing->weight;
                $result[1]->updated_at = $exitWeighing->weighed_at;
                $result[1]->sort_order = $result[1]->sort_order ?? 2;
            } else {
                $result->push((object) [
                    'id' => 'weighing-exit-' . $exitWeighing->id,
                    'task_id' => $taskId,
                    'sort_order' => max(2, $result->count() + 1),
                    'statuse_weighing_id' => 2,
                    'statuse_weighing_name' => 'Выездное взвешивание',
                    'weight' => (float) $exitWeighing->weight,
                    'updated_at' => $exitWeighing->weighed_at,
                    'description' => $exitWeighing->notes,
                    'yard_id' => $exitWeighing->yard_id,
                ]);
            }
        }

        return $result
            ->sortBy(function ($item) {
                return $item->sort_order ?? PHP_INT_MAX;
            })
            ->values();
    }

    private function createUpdateTaskWeighing($task_id, $weighing = null, $yard_id = 1, $warehouseCount = 1, $truck_id = null, $plate_number = null)
    {
        if (!$task_id) {
            return 0;
        }
        
        // Работа со старой системой TaskWeighing
        $taskWeighing = TaskWeighing::where('task_id', $task_id)->where('yard_id', $yard_id)->first();
        
        if ($taskWeighing && $weighing) {
            // Задача уже существует, проверяем WeighingRequirement
            $this->syncWeighingRequirement($task_id, $yard_id, $truck_id, $plate_number, true);
            return 1;
        } else if ($taskWeighing && $weighing == null) {
            // Удаляем задачу на взвешивания
            TaskWeighing::where('task_id', $task_id)->where('yard_id', $yard_id)->delete();
            // Также удаляем требование в новой системе (если не было взвешиваний)
            $this->syncWeighingRequirement($task_id, $yard_id, $truck_id, $plate_number, false);
            return 0;
        } else if ($taskWeighing == null && $weighing) {
            // Создаем задание на взвешивания в старой системе
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
            // Создаем требование в новой системе
            $this->syncWeighingRequirement($task_id, $yard_id, $truck_id, $plate_number, true);
            return 1;
        }
        
        return 0;
    }

    private function findActiveVisitorForWeighingRequirement(int $yard_id, int $task_id, ?int $truck_id = null, ?string $plate_number = null): ?Visitor
    {
        $baseQuery = Visitor::query()
            ->where('yard_id', $yard_id)
            ->whereNull('exit_date');

        if ($task_id) {
            $visitor = (clone $baseQuery)
                ->where('task_id', $task_id)
                ->orderByDesc('entry_date')
                ->first();

            if ($visitor) {
                return $visitor;
            }
        }

        if ($truck_id) {
            $visitor = (clone $baseQuery)
                ->where('truck_id', $truck_id)
                ->orderByDesc('entry_date')
                ->first();

            if ($visitor) {
                return $visitor;
            }
        }

        if ($plate_number) {
            return (clone $baseQuery)
                ->where('plate_number', $plate_number)
                ->orderByDesc('entry_date')
                ->first();
        }

        return null;
    }

    /**
     * Синхронизирует WeighingRequirement с TaskWeighing
     * @param int $task_id ID задачи
     * @param int $yard_id ID двора
     * @param int|null $truck_id ID грузовика
     * @param string|null $plate_number Номер ТС
     * @param bool $needsWeighing Требуется ли взвешивание
     */
    private function syncWeighingRequirement($task_id, $yard_id, $truck_id = null, $plate_number = null, $needsWeighing = true)
    {
        // Если нет truck_id - пытаемся получить из задачи
        if (!$truck_id) {
            $task = Task::find($task_id);
            if ($task && $task->truck_id) {
                $truck_id = $task->truck_id;
            }
        }
        
        // Получаем plate_number из truck если не передан
        if (!$plate_number && $truck_id) {
            $truck = Truck::find($truck_id);
            $plate_number = $truck ? $truck->plate_number : null;
        }
        
        // Если нет truck_id или plate_number - не создаём требование
        if (!$truck_id || !$plate_number) {
            return;
        }
        
        // Ищем существующее требование по task_id и yard_id
        $requirement = WeighingRequirement::where('task_id', $task_id)
            ->where('yard_id', $yard_id)
            ->first();

        $visitor = $this->findActiveVisitorForWeighingRequirement(
            $yard_id,
            $task_id,
            $truck_id,
            $plate_number
        );
        
        if ($needsWeighing) {
            // Если требование не существует - создаем
            if (!$requirement) {
                if (!$visitor) {
                    return;
                }

                WeighingRequirement::create([
                    'yard_id' => $yard_id,
                    'visitor_id' => $visitor->id,
                    'task_id' => $task_id,
                    'truck_id' => $truck_id,
                    'plate_number' => $plate_number,
                    'required_type' => WeighingRequirement::TYPE_BOTH,
                    'reason' => WeighingRequirement::REASON_TASK,
                    'status' => WeighingRequirement::STATUS_PENDING,
                ]);
            } else {
                // Обновляем существующее требование если нужно
                $updateData = [];
                if ($truck_id && $requirement->truck_id !== $truck_id) {
                    $updateData['truck_id'] = $truck_id;
                    // При смене truck обновляем plate_number
                    $updateData['plate_number'] = $plate_number;
                }
                if ($plate_number && $requirement->plate_number !== $plate_number) {
                    $updateData['plate_number'] = $plate_number;
                }
                if ($visitor && $requirement->visitor_id !== $visitor->id) {
                    $updateData['visitor_id'] = $visitor->id;
                }
                // Если статус skipped - восстанавливаем на pending
                if ($requirement->status === WeighingRequirement::STATUS_SKIPPED) {
                    $updateData['status'] = WeighingRequirement::STATUS_PENDING;
                    $updateData['skipped_reason'] = null;
                    $updateData['skipped_by_user_id'] = null;
                    $updateData['skipped_at'] = null;
                }
                if (!empty($updateData)) {
                    $requirement->update($updateData);
                }
            }
        } else {
            // Удаляем требование только если нет связанных взвешиваний
            if ($requirement && 
                $requirement->status === WeighingRequirement::STATUS_PENDING &&
                !$requirement->entry_weighing_id && 
                !$requirement->exit_weighing_id) {
                $requirement->delete();
            }
        }
    }

    /**
     * Обрабатывает строку маршрута и возвращает ID регионов
     */
    private function processRouteRegions(string $description): string
    {
        // Очищаем и нормализуем текст маршрута
        $route = str_replace('г. ', '', $description); // Убираем "г. "
        $route = str_replace(' ', '', $route); // Убираем пробелы
        $regions = array_unique(explode('-', $route)); // Разбиваем по дефису и убираем дубликаты
        
        $regionIds = [];
        foreach ($regions as $regionName) {
            if (empty($regionName)) continue;
            
            // Ищем регион в БД
            $region = DB::table('regions')->where('name', 'like', '%' . $regionName . '%')->first();
            
            if (!$region) {
                // Если регион не найден, создаем новый
                $regionId = DB::table('regions')->insertGetId([
                    'name' => $regionName,
                    'created_at' => now(),
                    'updated_at' => now()
                ]);
                $regionIds[] = $regionId;
            } else {
                $regionIds[] = $region->id;
            }
        }
        
        return implode(',', $regionIds);
    }

    private function getTaskById($task_id, $name = null, $user_id = null, $truck_id = null, $avtor = null, $phone = null, $description = null, $plan_date = null, $yard_id = null, $status_id = 1, $begin_date = null, $end_date = null, $create_user_id = null, $specification = null, $reward = null, $total_weight = null, $count_boxes = null)
    {
        // Обрабатываем маршрут из описания, если оно есть
        $route_regions = null;
        if ($description && strpos($description, '-') !== false) {
            $route_regions = $this->processRouteRegions($description);
        }
            $cities = explode('-', str_replace('г. ', '', $description));
            $uniqueCities = array_unique(array_map('trim', $cities));
            $description = 'г. ' . implode(' - ', array_filter($uniqueCities));

        $data = [
            'name' => $name,
            'user_id' => $user_id,
            'truck_id' => $truck_id,
            'avtor' => $avtor,
            'phone' => $phone,
            'description' => $description,
            'plan_date' => $plan_date,
            'yard_id' => $yard_id,
            'status_id' => $status_id,
            'begin_date' => $begin_date,
            'end_date' => $end_date,
            'create_user_id' => $create_user_id,
            'route_regions' => $route_regions,
            'specification' => $specification,
            'reward' => $reward,
            'total_weight' => $total_weight,
            'count_boxes' => $count_boxes,
        ];
        
        // Фильтруем пустые значения для обновления
        $data = array_filter($data, function($value) {
            return $value !== null && $value !== '';
        });
        
        $query = Task::query();

        if (!empty($task_id) && !empty($name)) {
            // Если заданы оба параметра, ищем по ним
           $task = $query->where('id', $task_id)->where('name', $name)->first();
        } else if (!empty($task_id)) {
            // Если задан только task_id
            $task = $query->where('id', $task_id)->first();
        } else if (!empty($name)) {
            // Если задан только name
            $task = $query->where('name', $name)->first();
        } else {
            // Если не задано ни одного параметра, возвращаем null
            $task = null;   
        }

        if ($task) {
            $task->update($data);
        } else {
            // Для создания сохраняем внешний task_id как первичный ключ задачи,
            // потому что дальше по этому id идет вся интеграция и связанные сущности.
            $task = new Task([
                'name' => $name,
                'user_id' => $user_id,
                'truck_id' => $truck_id,
                'avtor' => $avtor,
                'phone' => $phone,
                'description' => $description,
                'plan_date' => $plan_date,
                'yard_id' => $yard_id,
                'status_id' => $status_id,
                'begin_date' => $begin_date,
                'end_date' => $end_date,
                'create_user_id' => $create_user_id,
                'route_regions' => $route_regions,
                'specification' => $specification,
                'reward' => $reward,
                'total_weight' => $total_weight,
                'count_boxes' => $count_boxes,
            ]);

            if (!empty($task_id)) {
                $task->id = (int) $task_id;
            }

            $task->save();
        }
        return $task;
    }

    private function getPermitById($truck_id, $yard_id, $user_id = null, $task_id = null, $one_permission = true, $begin_date = null, $end_date = null, $granted_by_user_id = null)
    {
        $status_id = Status::where('key', 'active')->first()->id;
        $onePermission = (bool) $one_permission;
        $data = [
            'truck_id' => $truck_id,
            'yard_id' => $yard_id,
            'user_id' => $user_id,
            'granted_by_user_id' => $granted_by_user_id,
            'task_id' => $task_id,
            'one_permission' => $onePermission,
            'begin_date' => $begin_date,
            'end_date' => $end_date,
            'status_id' => $status_id,
        ];

        $query = EntryPermit::where('truck_id', $truck_id)->where('yard_id', $yard_id)->where('status_id', $status_id);


        if ($task_id !== null) {
            $query->where('task_id', $task_id);
        }

        $permit = $query->first();

        if ($permit && $granted_by_user_id && !$permit->granted_by_user_id) {
            $permit->update([
                'granted_by_user_id' => $granted_by_user_id,
            ]);
        }

        if (!$permit) {
            [$permit, $replacementResult] = DB::transaction(function () use ($truck_id, $yard_id, $data) {
                $replacementResult = $this->permitReplacementService->deactivateExistingActivePermits($truck_id, $yard_id);
                $permit = EntryPermit::create($data);

                return [$permit, $replacementResult];
            });

            $this->permitVehicleService->syncPermitVehicleSafely($permit);

            if ($onePermission && $task_id !== null) {
                $truck = Truck::find($truck_id);

                $this->createUpdateTaskWeighing(
                    $task_id,
                    true,
                    $yard_id,
                    1,
                    $truck_id,
                    $truck?->plate_number
                );
            }
        }

        return $permit;
    }

    private function getIntegrationIssuerId(): ?int
    {
        return User::query()->firstOrCreate(
            ['login' => 'integration'],
            [
                'name' => 'Интеграция',
                'password' => bcrypt('Aa1234'),
            ]
        )->id;
    }

    /**
     * Обновление времени задачи (обновляет plane_date в task_loadings)
     */
    public function updateTaskTime(Request $request)
    {
        try {
            $validate = $request->validate([
                'task_id' => 'required|integer|exists:tasks,id',
                'warehouse_id' => 'required|integer|exists:warehouses,id',
                'plan_date' => 'required|date',
            ]);

            // Конвертируем ISO формат в MySQL формат
            $planDate = Carbon::parse($validate['plan_date'])->format('Y-m-d H:i:s');
            
            // Находим TaskLoading по task_id И warehouse_id
            $taskLoading = TaskLoading::where('task_id', $validate['task_id'])
                ->where('warehouse_id', $validate['warehouse_id'])
                ->first();
            
            if (!$taskLoading) {
                return response()->json([
                    'status' => false,
                    'message' => 'Погрузка для этой задачи и склада не найдена'
                ], 404);
            }

            // Обновляем plane_date в task_loadings
            $taskLoading->plane_date = $planDate;
            $taskLoading->save();

            return response()->json([
                'status' => true,
                'message' => 'Время погрузки успешно обновлено',
                'data' => $taskLoading
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Ошибка при обновлении времени: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Фиксация прибытия ТС на склад
     * 
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function recordArrival(Request $request)
    {
        try {
            $validated = $request->validate([
                'task_loading_id' => 'required|integer|exists:task_loadings,id',
                'user_id' => 'required|integer|exists:users,id',
                'arrival_at' => 'nullable|date', // Если не передано - используется текущее время
            ]);

            $taskLoading = TaskLoading::with(['task', 'warehouse', 'factGate'])->find($validated['task_loading_id']);

            // Проверяем, не зафиксировано ли уже прибытие
            if ($taskLoading->hasArrived()) {
                return response()->json([
                    'status' => false,
                    'message' => 'Прибытие уже зафиксировано: ' . $taskLoading->arrival_at->format('d.m.Y H:i:s'),
                    'data' => $taskLoading
                ], 409); // Conflict
            }

            $arrivalTime = isset($validated['arrival_at']) 
                ? Carbon::parse($validated['arrival_at']) 
                : now();

            $taskLoading->update([
                'arrival_at' => $arrivalTime,
                'arrival_user_id' => $validated['user_id'],
            ]);

            // Загружаем связи для ответа
            $taskLoading->load(['task.truck', 'warehouse', 'arrivalUser']);

            // Уведомление в Telegram
            $truck = $taskLoading->task->truck;
            $warehouse = $taskLoading->warehouse;
            $user = $taskLoading->arrivalUser;

            $this->telegramNotifications->queue(
                DssTelegramEventRegistry::EVENT_TASK_LOADING_ARRIVAL,
                '<b>🚛 Прибытие на склад</b>' . "\n\n" .
                '<b>📦 Рейс:</b> ' . e($taskLoading->task->name) . "\n" .
                '<b>🚗 ТС:</b> ' . e($truck ? $truck->plate_number : 'N/A') . "\n" .
                '<b>🏭 Склад:</b> ' . e($warehouse->name) . "\n" .
                '<b>⏰ Время:</b> ' . $arrivalTime->format('d.m.Y H:i:s') . "\n" .
                '<b>👤 Оператор:</b> ' . e($user ? $user->name : 'N/A'),
                ['task_id' => $taskLoading->task_id, 'warehouse_id' => $warehouse->id]
            );

            return response()->json([
                'status' => true,
                'message' => 'Прибытие успешно зафиксировано',
                'data' => [
                    'task_loading' => $taskLoading,
                    'arrival_at' => $arrivalTime->format('Y-m-d H:i:s'),
                ]
            ], 200);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'status' => false,
                'message' => 'Ошибка валидации',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Ошибка при фиксации прибытия: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Фиксация убытия ТС со склада
     * 
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function recordDeparture(Request $request)
    {
        try {
            $validated = $request->validate([
                'task_loading_id' => 'required|integer|exists:task_loadings,id',
                'user_id' => 'required|integer|exists:users,id',
                'departure_at' => 'nullable|date', // Если не передано - используется текущее время
            ]);

            $taskLoading = TaskLoading::with(['task', 'warehouse'])->find($validated['task_loading_id']);

            // Проверяем, зафиксировано ли прибытие
            if (!$taskLoading->hasArrived()) {
                return response()->json([
                    'status' => false,
                    'message' => 'Сначала необходимо зафиксировать прибытие',
                    'data' => $taskLoading
                ], 400);
            }

            // Проверяем, не зафиксировано ли уже убытие
            if ($taskLoading->hasDeparted()) {
                return response()->json([
                    'status' => false,
                    'message' => 'Убытие уже зафиксировано: ' . $taskLoading->departure_at->format('d.m.Y H:i:s'),
                    'data' => $taskLoading
                ], 409); // Conflict
            }

            $departureTime = isset($validated['departure_at']) 
                ? Carbon::parse($validated['departure_at']) 
                : now();

            // Проверяем, что время убытия не раньше времени прибытия
            if ($departureTime->lt($taskLoading->arrival_at)) {
                return response()->json([
                    'status' => false,
                    'message' => 'Время убытия не может быть раньше времени прибытия',
                ], 400);
            }

            $taskLoading->update([
                'departure_at' => $departureTime,
                'departure_user_id' => $validated['user_id'],
            ]);

            // Загружаем связи для ответа
            $taskLoading->load(['task.truck', 'warehouse', 'arrivalUser', 'departureUser']);

            $duration = $taskLoading->getFormattedDuration();
            $truck = $taskLoading->task->truck;
            $warehouse = $taskLoading->warehouse;
            $user = $taskLoading->departureUser;

            // Уведомление в Telegram
            $this->telegramNotifications->queue(
                DssTelegramEventRegistry::EVENT_TASK_LOADING_DEPARTURE,
                '<b>🚛 Убытие со склада</b>' . "\n\n" .
                '<b>📦 Рейс:</b> ' . e($taskLoading->task->name) . "\n" .
                '<b>🚗 ТС:</b> ' . e($truck ? $truck->plate_number : 'N/A') . "\n" .
                '<b>🏭 Склад:</b> ' . e($warehouse->name) . "\n" .
                '<b>⏰ Прибытие:</b> ' . $taskLoading->arrival_at->format('d.m.Y H:i:s') . "\n" .
                '<b>⏰ Убытие:</b> ' . $departureTime->format('d.m.Y H:i:s') . "\n" .
                '<b>⏱ Время на складе:</b> ' . $duration . "\n" .
                '<b>👤 Оператор:</b> ' . e($user ? $user->name : 'N/A'),
                ['task_id' => $taskLoading->task_id, 'warehouse_id' => $warehouse->id]
            );

            return response()->json([
                'status' => true,
                'message' => 'Убытие успешно зафиксировано',
                'data' => [
                    'task_loading' => $taskLoading,
                    'departure_at' => $departureTime->format('Y-m-d H:i:s'),
                    'duration_minutes' => $taskLoading->getDurationInMinutes(),
                    'duration_formatted' => $duration,
                ]
            ], 200);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'status' => false,
                'message' => 'Ошибка валидации',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Ошибка при фиксации убытия: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Получение списка ТС на складе (прибыли, но не убыли)
     * 
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function getVehiclesAtWarehouse(Request $request)
    {
        try {
            $validated = $request->validate([
                'warehouse_id' => 'nullable|integer|exists:warehouses,id',
                'yard_id' => 'nullable|integer|exists:yards,id',
            ]);

            $query = TaskLoading::with([
                'task.truck',
                'task.user',
                'warehouse',
                'factGate',
                'arrivalUser'
            ])
            ->currentlyAtWarehouse()
            ->orderBy('arrival_at', 'asc');

            // Фильтр по складу
            if (!empty($validated['warehouse_id'])) {
                $query->where('warehouse_id', $validated['warehouse_id']);
            }

            // Фильтр по двору (через склад)
            if (!empty($validated['yard_id'])) {
                $query->whereHas('warehouse', function ($q) use ($validated) {
                    $q->where('yard_id', $validated['yard_id']);
                });
            }

            $vehicles = $query->get()->map(function ($loading) {
                return [
                    'task_loading_id' => $loading->id,
                    'task_id' => $loading->task_id,
                    'task_name' => $loading->task->name ?? null,
                    'truck_plate' => $loading->task->truck->plate_number ?? null,
                    'driver_name' => $loading->task->user->name ?? null,
                    'warehouse_id' => $loading->warehouse_id,
                    'warehouse_name' => $loading->warehouse->name ?? null,
                    'gate_name' => $loading->factGate->name ?? null,
                    'arrival_at' => $loading->arrival_at?->format('Y-m-d H:i:s'),
                    'arrival_user' => $loading->arrivalUser->name ?? null,
                    'waiting_time_minutes' => $loading->arrival_at 
                        ? now()->diffInMinutes($loading->arrival_at) 
                        : null,
                ];
            });

            return response()->json([
                'status' => true,
                'message' => 'Список ТС на складах получен',
                'count' => $vehicles->count(),
                'data' => $vehicles
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Ошибка получения списка: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Получение истории прибытия/убытия для задачи
     * 
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function getTaskLoadingHistory(Request $request)
    {
        try {
            $validated = $request->validate([
                'task_id' => 'required|integer|exists:tasks,id',
            ]);

            $loadings = TaskLoading::with([
                'warehouse',
                'planGate',
                'factGate',
                'arrivalUser',
                'departureUser'
            ])
            ->where('task_id', $validated['task_id'])
            ->orderBy('sort_order', 'asc')
            ->get()
            ->map(function ($loading) {
                return [
                    'id' => $loading->id,
                    'sort_order' => $loading->sort_order,
                    'warehouse' => [
                        'id' => $loading->warehouse_id,
                        'name' => $loading->warehouse->name ?? null,
                    ],
                    'gates' => [
                        'plan' => $loading->planGate->name ?? null,
                        'fact' => $loading->factGate->name ?? null,
                    ],
                    'times' => [
                        'plan' => $loading->plane_date?->format('Y-m-d H:i:s'),
                        'arrival' => $loading->arrival_at?->format('Y-m-d H:i:s'),
                        'departure' => $loading->departure_at?->format('Y-m-d H:i:s'),
                    ],
                    'duration' => [
                        'minutes' => $loading->getDurationInMinutes(),
                        'formatted' => $loading->getFormattedDuration(),
                    ],
                    'operators' => [
                        'arrival' => $loading->arrivalUser->name ?? null,
                        'departure' => $loading->departureUser->name ?? null,
                    ],
                    'status' => $this->getLoadingStatus($loading),
                    'barcode' => $loading->barcode,
                    'document' => $loading->document,
                ];
            });

            return response()->json([
                'status' => true,
                'message' => 'История погрузки получена',
                'data' => $loadings
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Ошибка получения истории: ' . $e->getMessage()
            ], 500);
        }
    }

    /**
     * Определяет статус погрузки
     */
    private function getLoadingStatus(TaskLoading $loading): string
    {
        if ($loading->hasDeparted()) {
            return 'completed'; // Завершено
        }
        
        if ($loading->hasArrived()) {
            return 'in_progress'; // На складе
        }
        
        return 'pending'; // Ожидает
    }

    /**
     * Сброс времени прибытия/убытия (для администраторов)
     * 
     * @param Request $request
     * @return \Illuminate\Http\JsonResponse
     */
    public function resetLoadingTimes(Request $request)
    {
        try {
            $validated = $request->validate([
                'task_loading_id' => 'required|integer|exists:task_loadings,id',
                'reset_arrival' => 'boolean',
                'reset_departure' => 'boolean',
            ]);

            $taskLoading = TaskLoading::find($validated['task_loading_id']);

            $updateData = [];

            if ($validated['reset_departure'] ?? false) {
                $updateData['departure_at'] = null;
                $updateData['departure_user_id'] = null;
            }

            if ($validated['reset_arrival'] ?? false) {
                $updateData['arrival_at'] = null;
                $updateData['arrival_user_id'] = null;
                // При сбросе прибытия также сбрасываем убытие
                $updateData['departure_at'] = null;
                $updateData['departure_user_id'] = null;
            }

            if (!empty($updateData)) {
                $taskLoading->update($updateData);
            }

            return response()->json([
                'status' => true,
                'message' => 'Время успешно сброшено',
                'data' => $taskLoading->fresh()
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Ошибка сброса времени: ' . $e->getMessage()
            ], 500);
        }
    }
}
