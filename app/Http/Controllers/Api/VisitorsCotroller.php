<?php

namespace App\Http\Controllers\Api;

use App\Events\MessageSent;
use App\Http\Controllers\Controller;
use App\Http\Controllers\TelegramController;
use App\Models\Checkpoint;
use App\Models\CheckpointExitReview;
use App\Models\Devaice;
use App\Models\EntryPermit;
use App\Models\Status;
use App\Models\Task;
use App\Models\Truck;
use App\Models\TruckModel;
use App\Models\VehicleCapture;
use App\Models\Visitor;
use App\Models\Yard;
use App\Services\DssPermitVehicleService;
use App\Services\DssVisitorConfirmationService;
use App\Services\DssVisitorFlowService;
use App\Services\EntryPermitReplacementService;
use App\Services\WeighingService;
use Illuminate\Support\Facades\DB;
use Illuminate\Http\Request;

class VisitorsCotroller extends Controller
{
    public function __construct(
        private DssPermitVehicleService $permitVehicleService,
        private EntryPermitReplacementService $permitReplacementService,
        private DssVisitorConfirmationService $confirmationService,
        private DssVisitorFlowService $visitorFlowService,
        private WeighingService $weighingService,
    ) {
    }

    public function addVisitor(Request $request)
    {
        try {
            $plate_number = Truck::normalizePlateNumber($request->plate_number);
            $truck = $plate_number
                ? Truck::whereRaw("REPLACE(REPLACE(UPPER(plate_number), ' ', ''), '-', '') = ?", [$plate_number])->first()
                : null;
            if (!$truck && $request->truck_model_name) {

                $truck_model = TruckModel::where('name', $request->truck_model_name)->first();
                if (!$truck_model) {
                    $truck_model = TruckModel::create([
                        'name' => $request->truck_model_name,
                    ]);
                }

                if ($truck_model) {
                    $truck = Truck::create([
                        'plate_number' => $plate_number,
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
            $permit = $truck ? EntryPermit::where('truck_id', $truck ? $truck->id : null)
                ->where('yard_id', $request->yard_id)
                ->where('status_id', '=', Status::where('key', 'active')->first()->id)
                // Только действующие (не просроченные) разрешения
                ->where(function ($q) {
                    $q->whereNull('end_date')
                      ->orWhere('end_date', '>=', now()->startOfDay());
                })
                ->orderBy('created_at', 'desc')
                ->first() : null;

            // Проверка строгого режима
            $yard = Yard::find($request->yard_id);
            if ($yard && $yard->strict_mode && !$permit) {
                return response()->json([
                    'status' => false,
                    'message' => 'Въезд запрещён: строгий режим активен, требуется разрешение на въезд',
                    'error_code' => 'STRICT_MODE_NO_PERMIT',
                ], 403);
            }

            $PermitText = $permit ? ($permit->one_permission ? 'Одноразовое' : 'Многоразовое') : 'Нет разрешения';
            $task = $permit ? DB::table('tasks')->where('id', $permit->task_id)->first() : null;

            $statusRow = DB::table('statuses')->where('key', 'on_territory')->first();

            if (!$statusRow) {
                return response()->json([
                    'status' => false,
                    'message' => 'Status "on_territory" not found',
                ], 404);
            }

            $status = $statusRow->id;

            if ($request->truck_model_name) {
                $truck_model = DB::table('truck_models')->where('name', $request->truck_model_name)->first();
                if (!$truck_model) {
                    $truck_model = TruckModel::create([
                        'name' => $request->truck_model_name,
                    ]);
                }
            }

            $confirmation = $this->confirmationService->resolve($yard, $truck, $permit);
            $autoConfirm = (bool) $confirmation['auto_confirm'];


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
                'status_id' => $status,
                'confirmation_status' => $confirmation['status'],
                'confirmed_at' => $autoConfirm ? now() : null,
                'yard_id' => $request->yard_id ? $request->yard_id : null,
                'truck_id' => $truck ? $truck->id : null,
                'task_id' => $task ? $task->id : null,
            ]);
            $Visitor->save();

            // Загружаем связи для корректной работы WeighingService
            $Visitor->load(['yard', 'truck', 'task']);

            // Создаём требование на взвешивание, если необходимо
            $weighingRequirement = $this->weighingService->createRequirement($Visitor);
            
            if ($weighingRequirement) {
                logger()->info('Создано требование на взвешивание', [
                    'visitor_id' => $Visitor->id,
                    'requirement_id' => $weighingRequirement->id,
                    'reason' => $weighingRequirement->reason,
                ]);
            } else {
                logger()->info('Взвешивание не требуется', [
                    'visitor_id' => $Visitor->id,
                    'yard_id' => $Visitor->yard_id,
                    'yard_weighing_required' => $Visitor->yard?->weighing_required,
                ]);
            }

            if ($task) {
                $yard = DB::table('yards')->where('id', $request->yard_id)->first();
                Task::where('id', $task->id)->update([
                    'begin_date' => now(),
                    'yard_id' => $request->yard_id,
                    'status_id' => $status,
                ]);
                $warehouse = DB::table('task_loadings')->leftJoin('warehouses', 'task_loadings.warehouse_id', '=', 'warehouses.id')->where('task_loadings.task_id', $task->id)->where('warehouses.yard_id', $request->yard_id)->select('warehouses.name as name')->get();
                (new TelegramController())->sendNotification(
                    '<b>🚛 Въезд на территорию ' . e($yard->name) .  "</b>\n\n" .
                        '<b>🏷️ ТС:</b> '  . e($request->plate_number) . "\n" .
                        '<b>📦 Задание:</b> ' . e($task->name) . "\n" .
                        '<b>📝 Описание:</b> ' . e($task->description) . "\n" .
                        '<b>👤 Водитель:</b> ' . ($task->user_id ? e(DB::table('users')->where('id', $task->user_id)->value('name')) .
                            ' (' . e(DB::table('users')->where('id', $task->user_id)->value('phone')) . ')' : 'Не указан') . "\n" .
                        '<b>✍️ Автор:</b> ' . e($task->avtor) . "\n" .
                        '<b>🏬 Склады:</b> ' . e($warehouse->pluck('name')->implode(', ')) . "\n" .
                        '<b>🛂 Разрешение на въезд:</b> <i>' . e($PermitText) . '</i>'
                );

                // MessageSent::dispatch('На територию въехало транспортное средство ' . $request->plate_number . ', для рейса ' . $task->name);
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
                'trace' => $e->getTraceAsString(),
            ], 500);
        }
    }

    public function getVisitors(Request $request)
    {
        // ВАЖНО: Показываем только подтверждённых посетителей!
        // Посетители с confirmation_status = 'pending' показываются в отдельном блоке для подтверждения
        $query = DB::table('visitors')
            ->where(function($q) {
                // Показываем confirmed ИЛИ старые записи без статуса подтверждения (для обратной совместимости)
                $q->where('visitors.confirmation_status', '=', 'confirmed')
                  ->orWhereNull('visitors.confirmation_status');
            })
            ->leftJoin('truck_categories', 'visitors.truck_category_id', '=', 'truck_categories.id')
            ->leftJoin('tasks', 'visitors.task_id', '=', 'tasks.id')
            ->leftJoin('truck_brands', 'visitors.truck_brand_id', '=', 'truck_brands.id')
            ->leftJoin('users', 'tasks.user_id', '=', 'users.id')
            ->leftJoin('statuses', 'visitors.status_id', '=', 'statuses.id')
            ->leftJoin('yards', 'visitors.yard_id', '=', 'yards.id')
            ->leftJoin('trucks', 'visitors.truck_id', '=', 'trucks.id')
            ->leftJoin('truck_models', 'trucks.truck_model_id', '=', 'truck_models.id')
            ->leftJoin('devaices as entrance_device', 'visitors.entrance_device_id', '=', 'entrance_device.id')
            ->leftJoin('devaices as exit_device', 'visitors.exit_device_id', '=', 'exit_device.id')
            ->leftJoin('checkpoints as entrance_checkpoint', 'entrance_device.checkpoint_id', '=', 'entrance_checkpoint.id')
            ->leftJoin('checkpoints as exit_checkpoint', 'exit_device.checkpoint_id', '=', 'exit_checkpoint.id')
            ->select(
                'visitors.*',
                'tasks.name as name',
                'tasks.description as description',
                'truck_categories.name as truck_category_name',
                'truck_brands.name as truck_brand_name',
                'users.name as user_name',
                'users.phone as user_phone',
                'statuses.name as status_name',
                'yards.name as yard_name',
                'trucks.name as truck_name',
                'trucks.own as truck_own',
                'trucks.vip_level as truck_vip_level',
                'truck_models.name as truck_model_name',
                'entrance_device.channelName as entrance_device_name',
                'exit_device.channelName as exit_device_name',
                'entrance_checkpoint.name as entrance_checkpoint_name',
                'exit_checkpoint.name as exit_checkpoint_name'
            )
            ->orderBy('visitors.id', 'desc');

        if ($request->has('status') && is_array($request->status)) {
            $query->whereIn('statuses.key', $request->status);
        }
        if ($request->has('yard_id')) {
            $query->where('visitors.yard_id', '=', $request->yard_id);
        }

        $visitors = $query->take(1000)->get();

        $activeStatusId = Status::where('key', 'active')->value('id');

        $visitors = $visitors->map(function ($visitor) use ($activeStatusId) {
            $permit = null;

            if ($visitor->truck_id && $visitor->yard_id && $activeStatusId) {
                $permit = EntryPermit::query()
                    ->where('truck_id', $visitor->truck_id)
                    ->where('yard_id', $visitor->yard_id)
                    ->where('status_id', $activeStatusId)
                    ->where(function ($query) {
                        $query->whereNull('end_date')
                            ->orWhere('end_date', '>=', now()->startOfDay());
                    })
                    ->orderByDesc('created_at')
                    ->first();
            }

            $visitor->permit_id = $permit?->id;
            $visitor->permit_type = $permit ? ($permit->one_permission ? 'one_time' : 'permanent') : null;
            $visitor->has_permit = $permit !== null;

            return $visitor;
        });

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

    /**
     * Получить историю въездов/выездов за период
     */
    public function getVisitorHistory(Request $request)
    {
        try {
            $validate = $request->validate([
                'yard_id' => 'required|integer',
                'date_from' => 'nullable|date',
                'date_to' => 'nullable|date',
                'plate_number' => 'nullable|string',
                'status' => 'nullable|string|in:on_territory,left',
            ]);

            $query = DB::table('visitors')
                ->leftJoin('truck_categories', 'visitors.truck_category_id', '=', 'truck_categories.id')
                ->leftJoin('tasks', 'visitors.task_id', '=', 'tasks.id')
                ->leftJoin('users', 'tasks.user_id', '=', 'users.id')
                ->leftJoin('statuses', 'visitors.status_id', '=', 'statuses.id')
                ->leftJoin('yards', 'visitors.yard_id', '=', 'yards.id')
                ->leftJoin('trucks', 'visitors.truck_id', '=', 'trucks.id')
                ->leftJoin('truck_models', 'trucks.truck_model_id', '=', 'truck_models.id')
                ->leftJoin('truck_brands', 'trucks.truck_brand_id', '=', 'truck_brands.id')
                ->leftJoin('entry_permits', function($join) use ($validate) {
                    $join->on('entry_permits.truck_id', '=', 'visitors.truck_id')
                         ->on('entry_permits.yard_id', '=', 'visitors.yard_id')
                         ->where('entry_permits.id', '=', DB::raw('(SELECT MAX(ep.id) FROM entry_permits ep WHERE ep.truck_id = visitors.truck_id AND ep.yard_id = visitors.yard_id)'));
                })
                ->leftJoin('devaices as entrance_device', 'visitors.entrance_device_id', '=', 'entrance_device.id')
                ->leftJoin('devaices as exit_device', 'visitors.exit_device_id', '=', 'exit_device.id')
                ->select(
                    'visitors.id',
                    'visitors.plate_number',
                    'visitors.entry_date',
                    'visitors.exit_date',
                    'visitors.truck_id',
                    'visitors.viche_color as vehicle_color',
                    'tasks.name as task_name',
                    'tasks.description as description',
                    'truck_categories.name as truck_category_name',
                    'truck_brands.name as truck_brand_name',
                    'users.name as driver_name',
                    'users.phone as driver_phone',
                    'statuses.name as status_name',
                    'yards.name as yard_name',
                    'trucks.own as truck_own',
                    'trucks.vip_level as truck_vip_level',
                    'trucks.color as truck_color',
                    'truck_models.name as truck_model_name',
                    'entrance_device.channelName as entrance_device_name',
                    'exit_device.channelName as exit_device_name',
                    'entry_permits.id as permit_id',
                    'entry_permits.one_permission as permit_one_time'
                )
                ->where('visitors.yard_id', $validate['yard_id'])
                ->where(function($q) {
                    // Показываем confirmed ИЛИ старые записи без статуса (для обратной совместимости)
                    $q->where('visitors.confirmation_status', '=', 'confirmed')
                      ->orWhereNull('visitors.confirmation_status');
                })
                ->orderBy('visitors.entry_date', 'desc');

            // Фильтр по датам
            if (!empty($validate['date_from'])) {
                $query->whereDate('visitors.entry_date', '>=', $validate['date_from']);
            }
            if (!empty($validate['date_to'])) {
                $query->whereDate('visitors.entry_date', '<=', $validate['date_to']);
            }

            // Фильтр по номеру
            if (!empty($validate['plate_number'])) {
                $plate = strtoupper(str_replace(' ', '', $validate['plate_number']));
                $query->where('visitors.plate_number', 'LIKE', "%{$plate}%");
            }

            // Фильтр по статусу (на территории / покинул)
            if (!empty($validate['status'])) {
                if ($validate['status'] === 'on_territory') {
                    $query->whereNull('visitors.exit_date');
                } else if ($validate['status'] === 'left') {
                    $query->whereNotNull('visitors.exit_date');
                }
            }

            $visitors = $query->limit(2000)->get();

            return response()->json([
                'status' => true,
                'message' => 'History retrieved successfully',
                'count' => $visitors->count(),
                'data' => $visitors,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Получить данные для акта приёма-передачи смены
     */
    public function getShiftReport(Request $request)
    {
        try {
            $validate = $request->validate([
                'yard_id' => 'required|integer',
                'shift_start' => 'required|date',
                'shift_end' => 'required|date',
            ]);

            $baseQuery = function() use ($validate) {
                return DB::table('visitors')
                    ->leftJoin('tasks', 'visitors.task_id', '=', 'tasks.id')
                    ->leftJoin('users', 'tasks.user_id', '=', 'users.id')
                    ->leftJoin('trucks', 'visitors.truck_id', '=', 'trucks.id')
                    ->leftJoin('truck_models', 'trucks.truck_model_id', '=', 'truck_models.id')
                    ->leftJoin('truck_brands', 'trucks.truck_brand_id', '=', 'truck_brands.id')
                    ->leftJoin('entry_permits', function($join) use ($validate) {
                        $join->on('entry_permits.truck_id', '=', 'visitors.truck_id')
                             ->on('entry_permits.yard_id', '=', 'visitors.yard_id')
                             ->where('entry_permits.id', '=', DB::raw('(SELECT MAX(ep.id) FROM entry_permits ep WHERE ep.truck_id = visitors.truck_id AND ep.yard_id = visitors.yard_id)'));
                    })
                    ->select(
                        'visitors.id',
                        'visitors.plate_number',
                        'visitors.entry_date',
                        'visitors.exit_date',
                        'visitors.viche_color as vehicle_color',
                        'tasks.name as task_name',
                        'users.name as driver_name',
                        'users.phone as driver_phone',
                        'trucks.color as truck_color',
                        'truck_models.name as truck_model_name',
                        'truck_brands.name as truck_brand_name',
                        'entry_permits.id as permit_id',
                        'entry_permits.one_permission as permit_one_time'
                    )
                    ->where('visitors.yard_id', $validate['yard_id'])
                    ->where(function($q) {
                        $q->where('visitors.confirmation_status', '=', 'confirmed')
                          ->orWhereNull('visitors.confirmation_status');
                    });
            };

            // 1. Въехали за смену (entry_date в пределах смены)
            $enteredVehicles = $baseQuery()
                ->where('visitors.entry_date', '>=', $validate['shift_start'])
                ->where('visitors.entry_date', '<=', $validate['shift_end'])
                ->orderBy('visitors.entry_date', 'asc')
                ->get();

            // 2. Выехали за смену (exit_date в пределах смены)
            $exitedVehicles = $baseQuery()
                ->whereNotNull('visitors.exit_date')
                ->where('visitors.exit_date', '>=', $validate['shift_start'])
                ->where('visitors.exit_date', '<=', $validate['shift_end'])
                ->orderBy('visitors.exit_date', 'asc')
                ->get();

            // 3. На территории на момент конца смены
            // Въехали до конца смены И (ещё не выехали ИЛИ выехали после конца смены)
            $onTerritoryVehicles = $baseQuery()
                ->where('visitors.entry_date', '<=', $validate['shift_end'])
                ->where(function($q) use ($validate) {
                    $q->whereNull('visitors.exit_date')
                      ->orWhere('visitors.exit_date', '>', $validate['shift_end']);
                })
                ->orderBy('visitors.entry_date', 'asc')
                ->get();

            return response()->json([
                'status' => true,
                'message' => 'Shift report data retrieved successfully',
                'data' => [
                    'entered' => $enteredVehicles,
                    'exited' => $exitedVehicles,
                    'on_territory' => $onTerritoryVehicles,
                ],
                'stats' => [
                    'entered_count' => $enteredVehicles->count(),
                    'exited_count' => $exitedVehicles->count(),
                    'on_territory_count' => $onTerritoryVehicles->count(),
                ],
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
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

            if ($visitor->exit_date !== null) {
                return response()->json([
                    'status' => true,
                    'message' => 'Visitor already exited',
                ], 200);
            }

            $this->visitorFlowService->closeVisitorExit($visitor);

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
        $query = Truck::leftJoin('truck_models', 'trucks.truck_model_id', '=', 'truck_models.id')
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
        //$data = $query->get();
        if ($request->has('yard_id')) {
            $activeStatusId = Status::where('key', 'active')->first()->id;
            $data = $query->get()->map(function ($truck) use ($request, $activeStatusId) {
                $permit = EntryPermit::where('truck_id', $truck->id)
                    ->where('yard_id', $request->yard_id)
                    ->where('status_id', $activeStatusId)
                    // Только действующие (не просроченные) разрешения
                    ->where(function ($q) {
                        $q->whereNull('end_date')
                          ->orWhere('end_date', '>=', now()->startOfDay());
                    })
                    ->orderBy('created_at', 'desc')
                    ->first();
                
                $task = $permit ? Task::find($permit->task_id) : null;
                $driver = $task && $task->user_id ? DB::table('users')->find($task->user_id) : null;

                return array_merge($truck->toArray(), [
                    'permit_id' => $permit?->id,
                    'permit_type' => $permit ? ($permit->one_permission ? 'one_time' : 'permanent') : null,
                    'has_permit' => $permit !== null,
                    'task_id' => $task?->id,
                    'task_name' => $task?->name,
                    'driver_name' => $driver?->name,
                    'driver_phone' => $driver?->phone,
                ]);
            });
        } else {
            $data = $query->get();
        }


        return response()->json([
            'status' => true,
            'message' => 'Trucks Retrieved Successfully',
            'data' => $data,
        ], 200);
    }

    public function ChatTest(Request $request)
    {
        MessageSent::dispatch($request->text);
        return response()->json(['status' => 'Message dispatched']);
    }

    public function getActivePermits(Request $request)
    {
        $query = EntryPermit::leftJoin('trucks', 'entry_permits.truck_id', '=', 'trucks.id')
            ->leftJoin('truck_models', 'trucks.truck_model_id', '=', 'truck_models.id')
            ->leftJoin('truck_brands', 'trucks.truck_brand_id', '=', 'truck_brands.id')
            ->leftJoin('truck_categories', 'trucks.truck_category_id', '=', 'truck_categories.id')
            ->leftJoin('yards', 'entry_permits.yard_id', '=', 'yards.id')
            ->select(
                'entry_permits.*',
                'yards.name as yard_name',
                'trucks.plate_number',
                'truck_models.name as truck_model_name',
                'truck_brands.name as truck_brand_name',
                'truck_categories.name as truck_category_name'
            )
            ->where('entry_permits.status_id', Status::where('key', 'active')->first()->id);

        if ($request->has('yard_id')) {
            $query->where('entry_permits.yard_id', $request->yard_id);
        }

        $permits = $query->get();

        return response()->json([
            'status' => true,
            'message' => 'Active Permits Retrieved Successfully',
            'data' => $permits,
        ], 200);
    }

    /**
     * Добавить посетителя в режиме ожидания подтверждения (от камеры DSS)
     * Камера вызывает этот метод, посетитель создаётся со статусом pending
     */
    public function addPendingVisitor(Request $request)
    {
        try {
            $validate = $request->validate([
                'plate_number' => 'required|string|max:50',
                'yard_id' => 'required|integer|exists:yards,id',
                'recognition_confidence' => 'nullable|integer|min:0|max:100',
                'entrance_device_id' => 'nullable|integer',
            ]);

            $originalPlate = $validate['plate_number'];
            $normalizedPlate = $this->normalizePlateNumber($originalPlate);
            
            // Ищем грузовик по нормализованному номеру
            $truck = Truck::whereRaw("REPLACE(LOWER(plate_number), ' ', '') = ?", [$normalizedPlate])->first();
            
            // Получаем информацию о дворе (строгий режим)
            $yard = Yard::find($validate['yard_id']);
            $isStrictMode = $yard && $yard->strict_mode;
            
            // Ищем разрешение и задачу
            $permit = null;
            $task = null;
            $activeStatus = Status::where('key', 'active')->first();
            
            if ($truck && $activeStatus) {
                // Получаем последнее активное разрешение (по дате создания)
                $permit = EntryPermit::where('truck_id', $truck->id)
                    ->where('yard_id', $validate['yard_id'])
                    ->where('status_id', $activeStatus->id)
                    // Только действующие (не просроченные) разрешения
                    ->where(function ($q) {
                        $q->whereNull('end_date')
                          ->orWhere('end_date', '>=', now()->startOfDay());
                    })
                    ->orderBy('created_at', 'desc')
                    ->first();
                    
                if ($permit) {
                    $task = Task::find($permit->task_id);
                }
            }

            $statusRow = DB::table('statuses')->where('key', 'on_territory')->first();
            
            // Определяем статус подтверждения через единый сервис.
            // confirmed выставляется только при truck + active permit,
            // иначе visitor остаётся pending независимо от режима двора.
            $confidence = $request->recognition_confidence ?? 0;
            
            $confirmation = $this->confirmationService->resolve($yard, $truck, $permit);
            $autoConfirm = $confirmation['auto_confirm'];
            
            $visitor = Visitor::create([
                'plate_number' => $originalPlate,
                'original_plate_number' => $originalPlate,
                'entry_date' => now(),
                'status_id' => $statusRow->id,
                'confirmation_status' => $confirmation['status'],
                'confirmed_at' => $autoConfirm ? now() : null,
                'recognition_confidence' => $confidence,
                'yard_id' => $validate['yard_id'],
                'truck_id' => $truck?->id,
                'task_id' => $task?->id,
                'entrance_device_id' => $request->entrance_device_id,
                'entry_permit_id' => $permit?->id,
                'truck_category_id' => $truck?->truck_category_id,
                'truck_brand_id' => $truck?->truck_brand_id,
            ]);

            // Если автоподтверждение - выполняем постобработку confirmed visitor,
            // включая создание требования на взвешивание по разрешению/двору/ТС.
            if ($autoConfirm) {
                $this->processConfirmedVisitor($visitor, $task, $validate['yard_id']);
            }

            return response()->json([
                'status' => true,
                'message' => $autoConfirm ? 'Visitor auto-confirmed' : 'Visitor pending confirmation',
                'data' => [
                    'visitor' => $visitor,
                    'auto_confirmed' => $autoConfirm,
                    'truck_found' => $confirmation['truck_found'],
                    'permit_found' => $confirmation['permit_found'],
                    'decision_reason' => $confirmation['reason'],
                    'task_found' => $task !== null,
                ]
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Получить список посетителей, ожидающих подтверждения
     */
    public function getPendingVisitors(Request $request)
    {
        try {
            $query = Visitor::query()
                ->where('confirmation_status', Visitor::CONFIRMATION_PENDING)
                ->leftJoin('yards', 'visitors.yard_id', '=', 'yards.id')
                ->leftJoin('trucks', 'visitors.truck_id', '=', 'trucks.id')
                ->leftJoin('tasks', 'visitors.task_id', '=', 'tasks.id')
                ->leftJoin('devaices', 'visitors.entrance_device_id', '=', 'devaices.id')
                ->leftJoin('entry_permits', function($join) {
                    $join->on('visitors.truck_id', '=', 'entry_permits.truck_id')
                         ->on('visitors.yard_id', '=', 'entry_permits.yard_id')
                         ->whereExists(function($q) {
                             $q->selectRaw('1')
                               ->from('statuses')
                               ->whereRaw('statuses.id = entry_permits.status_id')
                               ->where('statuses.key', 'active');
                         });
                })
                ->select(
                    'visitors.*',
                    'yards.name as yard_name',
                    'yards.strict_mode as yard_strict_mode',
                    'trucks.plate_number as matched_plate_number',
                    'tasks.name as task_name',
                    'devaices.channelName as device_name',
                    'entry_permits.id as permit_id'
                )
                ->orderBy('visitors.entry_date', 'desc');

            $yardId = null;
            if ($request->has('yard_id') && $request->yard_id) {
                $yardId = $request->yard_id;
                $query->where('visitors.yard_id', $yardId);
            }

            // Ограничиваем до 20 записей для скорости
            $visitors = $query->limit(20)->get();

            // Предзагрузка ожидаемых задач один раз для двора (а не для каждого посетителя)
            $expectedTasks = $yardId ? $this->getExpectedTasksOptimized($yardId) : [];

            // Формируем данные БЕЗ тяжёлых вызовов findSimilarPlates в цикле
            // similar_plates будут загружаться по запросу с фронтенда
            $data = $visitors->map(function ($visitor) use ($expectedTasks) {
                // Определяем причину ожидания подтверждения
                $pendingReason = $this->determinePendingReason($visitor);

                return [
                    'id' => $visitor->id,
                    'plate_number' => $visitor->plate_number,
                    'original_plate_number' => $visitor->original_plate_number,
                    'entry_date' => $visitor->entry_date,
                    'recognition_confidence' => $visitor->recognition_confidence,
                    'yard_id' => $visitor->yard_id,
                    'yard_name' => $visitor->yard_name,
                    'yard_strict_mode' => (bool) $visitor->yard_strict_mode,
                    'device_name' => $visitor->device_name,
                    'matched_truck_id' => $visitor->truck_id,
                    'matched_plate_number' => $visitor->matched_plate_number,
                    'task_id' => $visitor->task_id,
                    'task_name' => $visitor->task_name,
                    'has_permit' => !empty($visitor->permit_id),
                    // Причина ожидания подтверждения
                    'pending_reason' => $pendingReason['code'],
                    'pending_reason_text' => $pendingReason['text'],
                    // Похожие номера - загружаются отдельно через searchSimilarPlates
                    'similar_plates' => [],
                    // Ожидаемые задачи - предзагружены один раз
                    'expected_tasks' => $expectedTasks,
                ];
            });

            return response()->json([
                'status' => true,
                'message' => 'Pending visitors retrieved',
                'count' => $data->count(),
                'data' => $data,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Очередь проверки на КПП для оператора охраны
     */
    public function getCheckpointReviewQueue(Request $request)
    {
        try {
            $validate = $request->validate([
                'checkpoint_id' => 'required|integer|exists:checkpoints,id',
                'limit' => 'nullable|integer|min:1|max:50',
            ]);

            $limit = $validate['limit'] ?? 20;

            $visitors = Visitor::query()
                ->whereIn('visitors.confirmation_status', [
                    Visitor::CONFIRMATION_PENDING,
                    Visitor::CONFIRMATION_CONFIRMED,
                    Visitor::CONFIRMATION_REJECTED,
                ])
                ->leftJoin('yards', 'visitors.yard_id', '=', 'yards.id')
                ->leftJoin('trucks', 'visitors.truck_id', '=', 'trucks.id')
                ->leftJoin('tasks', 'visitors.task_id', '=', 'tasks.id')
                ->leftJoin('devaices', 'visitors.entrance_device_id', '=', 'devaices.id')
                ->where('devaices.checkpoint_id', $validate['checkpoint_id'])
                ->select(
                    'visitors.*',
                    'yards.name as yard_name',
                    'yards.strict_mode as yard_strict_mode',
                    'trucks.plate_number as matched_plate_number',
                    'tasks.name as task_name',
                    'devaices.channelName as device_name',
                    'devaices.checkpoint_id as device_checkpoint_id'
                )
                ->orderBy('visitors.entry_date', 'desc')
                ->limit($limit)
                ->get();

            $data = $visitors->map(function ($visitor) {
                $yard = $visitor->yard_id ? Yard::find($visitor->yard_id) : null;
                $truck = $visitor->truck_id ? Truck::find($visitor->truck_id) : null;
                $task = $visitor->task_id ? Task::find($visitor->task_id) : null;
                $permit = $truck ? $this->getActivePermitForTruck($truck->id, (int) $visitor->yard_id) : null;
                $capture = $this->findLatestCaptureForVisitor(
                    $visitor->entrance_device_id,
                    $visitor->original_plate_number ?: $visitor->plate_number,
                    $visitor->entry_date,
                );

                $loadingCount = $task
                    ? DB::table('task_loadings')->where('task_id', $task->id)->count()
                    : 0;

                $weighingRequirement = $this->weighingService->determineRequirementFromContext(
                    $yard,
                    $truck,
                    $permit,
                    $task,
                );

                $visitor->permit_id = $permit?->id;
                $pendingReason = match ($visitor->confirmation_status) {
                    Visitor::CONFIRMATION_CONFIRMED => [
                        'code' => 'confirmed',
                        'text' => 'Въезд подтверждён',
                    ],
                    Visitor::CONFIRMATION_REJECTED => [
                        'code' => 'rejected',
                        'text' => 'Въезд отклонён',
                    ],
                    default => $this->determinePendingReason($visitor),
                };

                return [
                    'visitor_id' => $visitor->id,
                    'plate_number' => $visitor->plate_number,
                    'original_plate_number' => $visitor->original_plate_number,
                    'confirmation_status' => $visitor->confirmation_status,
                    'confirmed_at' => $visitor->confirmed_at?->format('Y-m-d H:i:s'),
                    'entry_date' => $visitor->entry_date,
                    'recognition_confidence' => $visitor->recognition_confidence,
                    'yard_id' => $visitor->yard_id,
                    'yard_name' => $visitor->yard_name,
                    'yard_strict_mode' => (bool) $visitor->yard_strict_mode,
                    'checkpoint_id' => $visitor->device_checkpoint_id,
                    'device_name' => $visitor->device_name,
                    'matched_truck_id' => $visitor->truck_id,
                    'matched_plate_number' => $visitor->matched_plate_number,
                    'task_id' => $visitor->task_id,
                    'task_name' => $visitor->task_name,
                    'has_permit' => $permit !== null,
                    'permit_type' => $permit ? ($permit->one_permission ? 'one_time' : 'permanent') : null,
                    'has_loading_task' => $loadingCount > 0,
                    'loading_points_count' => $loadingCount,
                    'has_weighing_task' => $weighingRequirement !== null,
                    'weighing_reason' => $weighingRequirement['reason'] ?? null,
                    'pending_reason' => $pendingReason['code'],
                    'pending_reason_text' => $pendingReason['text'],
                    'capture_id' => $capture?->id,
                    'capture_time' => $capture?->captureTime ? date('Y-m-d H:i:s', (int) $capture->captureTime) : null,
                    'capture_picture_url' => $this->buildCapturePictureUrl($capture),
                    'capture_plate_picture_url' => $this->buildPlatePictureUrl($capture),
                ];
            })->values();

            return response()->json([
                'status' => true,
                'message' => 'Checkpoint review queue retrieved',
                'count' => $data->count(),
                'data' => $data,
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Ручное добавление посетителя на выбранном КПП
     */
    public function addManualCheckpointVisitor(Request $request)
    {
        try {
            $validate = $request->validate([
                'checkpoint_id' => 'required|integer|exists:checkpoints,id',
                'plate_number' => 'required|string|max:50',
                'comment' => 'nullable|string|max:500',
                'create_permit' => 'nullable|boolean',
                'create_weighing' => 'nullable|boolean',
            ]);

            $checkpoint = Checkpoint::findOrFail($validate['checkpoint_id']);
            $yard = Yard::findOrFail($checkpoint->yard_id);
            $device = Devaice::query()
                ->where('checkpoint_id', $checkpoint->id)
                ->where('type', 'Entry')
                ->orderBy('id')
                ->first();

            $normalizedPlate = $this->normalizePlateNumber($validate['plate_number']);

            $existingVisitor = Visitor::query()
                ->where('yard_id', $yard->id)
                ->whereNull('exit_date')
                ->whereIn('confirmation_status', [
                    Visitor::CONFIRMATION_PENDING,
                    Visitor::CONFIRMATION_CONFIRMED,
                ])
                ->whereRaw(
                    "REPLACE(REPLACE(LOWER(plate_number), ' ', ''), '-', '') = ?",
                    [$normalizedPlate]
                )
                ->orderByDesc('id')
                ->first();

            if ($existingVisitor) {
                return response()->json([
                    'status' => true,
                    'message' => 'Visitor already exists in active queue',
                    'data' => [
                        'visitor_id' => $existingVisitor->id,
                        'already_exists' => true,
                    ],
                ], 200);
            }

            $originalPlate = Truck::normalizePlateNumber($validate['plate_number']) ?? strtoupper(trim($validate['plate_number']));
            $truck = $this->resolveOrCreateTruckByPlate($originalPlate);

            $permit = $truck ? $this->getActivePermitForTruck($truck->id, $yard->id) : null;
            $task = $permit?->task_id ? Task::find($permit->task_id) : null;
            $statusRow = DB::table('statuses')->where('key', 'on_territory')->first();

            if (!$statusRow) {
                return response()->json([
                    'status' => false,
                    'message' => 'Status on_territory not found',
                ], 404);
            }

            $visitor = Visitor::create([
                'plate_number' => $originalPlate,
                'original_plate_number' => $originalPlate,
                'entry_date' => now(),
                'status_id' => $statusRow->id,
                'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
                'confirmed_at' => now(),
                'confirmed_by_user_id' => $request->user()?->id,
                'recognition_confidence' => null,
                'yard_id' => $yard->id,
                'truck_id' => $truck?->id,
                'task_id' => $task?->id,
                'entrance_device_id' => $device?->id,
                'entry_permit_id' => $permit?->id,
                'truck_category_id' => $truck?->truck_category_id,
                'truck_brand_id' => $truck?->truck_brand_id,
                'comment' => $validate['comment'] ?? null,
            ]);

            // Создание разового пропуска если запрошено
            if (!empty($validate['create_permit']) && $truck && !$permit) {
                $newPermit = $this->createOneTimePermit(
                    $truck->id,
                    $yard->id,
                    $request->user()?->id,
                    !empty($validate['create_weighing'])
                );

                if ($newPermit) {
                    $visitor->update(['entry_permit_id' => $newPermit->id]);
                }
            }

            // Ручное создание задания на взвешивание (если нет пропуска с weighing)
            if (!empty($validate['create_weighing']) && empty($validate['create_permit'])) {
                $this->weighingService->createManualRequirement(
                    $yard->id,
                    $visitor->id,
                    $originalPlate,
                    $truck?->id,
                    $task?->id
                );
            }

            $this->processConfirmedVisitor($visitor, $task, $yard->id);

            return response()->json([
                'status' => true,
                'message' => 'Manual checkpoint visitor created',
                'data' => [
                    'visitor_id' => $visitor->id,
                    'already_exists' => false,
                ],
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function getCheckpointExitReviewQueue(Request $request)
    {
        try {
            $validate = $request->validate([
                'checkpoint_id' => 'required|integer|exists:checkpoints,id',
                'limit' => 'nullable|integer|min:1|max:50',
            ]);

            $limit = $validate['limit'] ?? 20;

            $reviewsQuery = CheckpointExitReview::query()
                ->where('checkpoint_id', $validate['checkpoint_id'])
                ->whereIn('status', ['pending', 'confirmed', 'rejected'])
                ->orderByDesc('capture_time');

            $totalCount = (clone $reviewsQuery)->count();

            $reviews = $reviewsQuery
                ->limit($limit)
                ->get();

            $data = $reviews->map(function (CheckpointExitReview $review) {
                $capture = $review->vehicle_capture_id ? VehicleCapture::find($review->vehicle_capture_id) : null;
                $checkpoint = Checkpoint::find($review->checkpoint_id);
                $yard = $review->yard_id ? Yard::find($review->yard_id) : null;
                $device = $review->device_id ? Devaice::find($review->device_id) : null;

                return [
                    'review_id' => $review->id,
                    'status' => $review->status,
                    'resolved_at' => $review->resolved_at?->format('Y-m-d H:i:s'),
                    'resolved_visitor_id' => $review->resolved_visitor_id,
                    'plate_number' => $review->plate_number,
                    'capture_time' => $review->capture_time,
                    'recognition_confidence' => $review->recognition_confidence,
                    'checkpoint_id' => $review->checkpoint_id,
                    'checkpoint_name' => $checkpoint?->name,
                    'yard_id' => $review->yard_id,
                    'yard_name' => $yard?->name,
                    'device_id' => $review->device_id,
                    'device_name' => $device?->channelName,
                    'truck_id' => $review->truck_id,
                    'note' => $review->note,
                    'capture_picture_url' => $this->buildCapturePictureUrl($capture),
                    'capture_plate_picture_url' => $this->buildPlatePictureUrl($capture),
                    'candidate_visitors' => $this->getExitReviewVisitors($review),
                ];
            })->values();

            return response()->json([
                'status' => true,
                'message' => 'Checkpoint exit review queue retrieved',
                'count' => $data->count(),
                'total_count' => $totalCount,
                'data' => $data,
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function confirmExitReview(Request $request)
    {
        try {
            $validate = $request->validate([
                'review_id' => 'required|integer|exists:checkpoint_exit_reviews,id',
                'operator_user_id' => 'required|integer|exists:users,id',
                'visitor_id' => 'nullable|integer|exists:visitors,id',
            ]);

            $review = CheckpointExitReview::findOrFail($validate['review_id']);
            if ($review->status !== 'pending') {
                return response()->json([
                    'status' => false,
                    'message' => 'Exit review already processed',
                ], 400);
            }

            $visitor = !empty($validate['visitor_id'])
                ? Visitor::find($validate['visitor_id'])
                : $this->resolveSingleExitCandidate($review);

            if (!$visitor) {
                return response()->json([
                    'status' => false,
                    'message' => 'Не удалось определить активный визит для выезда',
                ], 422);
            }

            if ($visitor->yard_id !== $review->yard_id || $visitor->exit_date !== null) {
                return response()->json([
                    'status' => false,
                    'message' => 'Выбранный визит уже закрыт или не относится к этому двору',
                ], 422);
            }

            if ($visitor->confirmation_status === Visitor::CONFIRMATION_PENDING) {
                $visitor->confirmation_status = Visitor::CONFIRMATION_CONFIRMED;
                $visitor->confirmed_by_user_id = $validate['operator_user_id'];
                $visitor->confirmed_at = now();
                $visitor->save();
            }

            $device = Devaice::find($review->device_id);
            $this->visitorFlowService->closeVisitorExit($visitor, $device, $review->capture_time ?? now());

            $review->status = 'confirmed';
            $review->resolved_at = now();
            $review->resolved_by_user_id = $validate['operator_user_id'];
            $review->resolved_visitor_id = $visitor->id;
            $review->save();

            return response()->json([
                'status' => true,
                'message' => 'Exit confirmed successfully',
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function rejectExitReview(Request $request)
    {
        try {
            $validate = $request->validate([
                'review_id' => 'required|integer|exists:checkpoint_exit_reviews,id',
                'operator_user_id' => 'required|integer|exists:users,id',
                'reason' => 'nullable|string|max:255',
            ]);

            $review = CheckpointExitReview::findOrFail($validate['review_id']);
            if ($review->status !== 'pending') {
                return response()->json([
                    'status' => false,
                    'message' => 'Exit review already processed',
                ], 400);
            }

            $review->status = 'rejected';
            $review->resolved_at = now();
            $review->resolved_by_user_id = $validate['operator_user_id'];
            $review->note = $validate['reason'] ?? $review->note;
            $review->save();

            return response()->json([
                'status' => true,
                'message' => 'Exit review rejected',
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function searchActiveVisitorsForExit(Request $request)
    {
        try {
            $validate = $request->validate([
                'yard_id' => 'required|integer|exists:yards,id',
                'plate_number' => 'required|string|max:50',
            ]);

            $normalizedPlate = $this->normalizePlateNumber($validate['plate_number']);
            $likePlate = '%' . $normalizedPlate . '%';

            $visitors = Visitor::query()
                ->where('visitors.yard_id', $validate['yard_id'])
                ->whereNull('visitors.exit_date')
                ->leftJoin('tasks', 'visitors.task_id', '=', 'tasks.id')
                ->leftJoin('trucks', 'visitors.truck_id', '=', 'trucks.id')
                ->select(
                    'visitors.*',
                    'tasks.name as task_name',
                    'trucks.plate_number as truck_plate_number'
                )
                ->where(function ($query) use ($normalizedPlate, $likePlate) {
                    $query->whereRaw(
                        "REPLACE(REPLACE(LOWER(visitors.plate_number), ' ', ''), '-', '') LIKE ?",
                        [$likePlate]
                    )
                    ->orWhereRaw(
                        "REPLACE(REPLACE(LOWER(COALESCE(trucks.plate_number, '')), ' ', ''), '-', '') LIKE ?",
                        [$likePlate]
                    )
                    ->orWhereRaw(
                        "REPLACE(REPLACE(LOWER(visitors.plate_number), ' ', ''), '-', '') = ?",
                        [$normalizedPlate]
                    )
                    ->orWhereRaw(
                        "REPLACE(REPLACE(LOWER(COALESCE(trucks.plate_number, '')), ' ', ''), '-', '') = ?",
                        [$normalizedPlate]
                    );
                })
                ->orderByRaw("CASE WHEN visitors.confirmation_status = ? THEN 0 ELSE 1 END", [Visitor::CONFIRMATION_CONFIRMED])
                ->orderByDesc('visitors.entry_date')
                ->limit(15)
                ->get()
                ->map(function ($visitor) use ($normalizedPlate) {
                    $visitorPlate = $this->normalizePlateNumber((string) $visitor->plate_number);
                    $truckPlate = $this->normalizePlateNumber((string) ($visitor->truck_plate_number ?? ''));

                    return [
                        'visitor_id' => $visitor->id,
                        'plate_number' => $visitor->plate_number,
                        'entry_date' => $visitor->entry_date,
                        'task_id' => $visitor->task_id,
                        'task_name' => $visitor->task_name,
                        'confirmation_status' => $visitor->confirmation_status,
                        'truck_id' => $visitor->truck_id,
                        'is_exact_truck_match' => $truckPlate !== '' && $truckPlate === $normalizedPlate,
                        'is_exact_plate_match' => $visitorPlate === $normalizedPlate,
                    ];
                })
                ->values();

            return response()->json([
                'status' => true,
                'message' => 'Active visitors found',
                'data' => $visitors,
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Определить причину, почему посетитель ожидает подтверждения
     */
    private function determinePendingReason($visitor): array
    {
        // 1. ТС не найдено в базе
        if (empty($visitor->truck_id)) {
            return [
                'code' => 'truck_not_found',
                'text' => '🚫 ТС не найдено в базе',
            ];
        }

        // 2. Строгий режим на дворе и нет разрешения
        if ($visitor->yard_strict_mode && empty($visitor->permit_id)) {
            return [
                'code' => 'no_permit',
                'text' => '🔒 Нет разрешения (строгий режим)',
            ];
        }

        // 3. Низкая уверенность распознавания
        if ($visitor->recognition_confidence !== null && $visitor->recognition_confidence < 80) {
            return [
                'code' => 'low_confidence',
                'text' => '⚠️ Низкая уверенность распознавания',
            ];
        }

        // 4. Другая причина (ручное добавление, ошибка OCR и т.д.)
        return [
            'code' => 'manual_check',
            'text' => 'Требуется проверка',
        ];
    }

    /**
     * Оптимизированная версия получения ожидаемых задач (без подзапросов)
     */
    private function getExpectedTasksOptimized(int $yardId): array
    {
        $statusNew = Status::where('key', 'new')->first();
        
        if (!$statusNew) {
            return [];
        }

        $tasks = Task::query()
            ->where('status_id', $statusNew->id)
            ->where('yard_id', $yardId)
            ->leftJoin('trucks', 'tasks.truck_id', '=', 'trucks.id')
            ->leftJoin('users', 'tasks.user_id', '=', 'users.id')
            ->select(
                'tasks.id',
                'tasks.name',
                'tasks.description',
                'tasks.plan_date',
                'trucks.id as truck_id',
                'trucks.plate_number',
                'users.name as driver_name',
                'users.phone as driver_phone'
            )
            ->orderBy('tasks.plan_date', 'asc')
            ->limit(50)
            ->get();

        return $tasks->toArray();
    }

    /**
     * Подтвердить посетителя оператором КПП
     */
    public function confirmVisitor(Request $request)
    {
        try {
            $validate = $request->validate([
                'visitor_id' => 'required|integer|exists:visitors,id',
                'operator_user_id' => 'required|integer|exists:users,id',
                'truck_id' => 'nullable|integer|exists:trucks,id',
                'task_id' => 'nullable|integer|exists:tasks,id',
                'corrected_plate_number' => 'nullable|string|max:50',
                'comment' => 'nullable|string|max:500',
                'create_permit' => 'nullable|boolean',
                'create_weighing' => 'nullable|boolean',
            ]);

            $visitor = Visitor::find($validate['visitor_id']);
            
            if ($visitor->confirmation_status !== Visitor::CONFIRMATION_PENDING) {
                return response()->json([
                    'status' => false,
                    'message' => 'Visitor already processed',
                ], 400);
            }

            $truck = null;
            $task = null;
            $correctedPlate = Truck::normalizePlateNumber($validate['corrected_plate_number'] ?? $visitor->plate_number)
                ?? ($validate['corrected_plate_number'] ?? $visitor->plate_number);
            $shouldCreatePermit = !empty($validate['create_permit']);
            $shouldCreateWeighing = !empty($validate['create_weighing']);

            // Если передан truck_id - используем его
            if (!empty($validate['truck_id'])) {
                $truck = Truck::find($validate['truck_id']);
            } 
            // Иначе ищем по скорректированному номеру
            else if ($correctedPlate) {
                $normalizedPlate = $this->normalizePlateNumber($correctedPlate);
                $truck = $this->findTruckByNormalizedPlate($normalizedPlate);
            }

            // Если передан task_id - используем его
            if (!empty($validate['task_id'])) {
                $task = Task::find($validate['task_id']);
                // Если задача есть, но грузовика нет - берём грузовик из задачи
                if ($task && !$truck) {
                    $truck = Truck::find($task->truck_id);
                }
            }
            // Иначе ищем задачу через разрешение
            else if ($truck) {
                $permit = EntryPermit::where('truck_id', $truck->id)
                    ->where('yard_id', $visitor->yard_id)
                    ->where('status_id', Status::where('key', 'active')->first()->id)
                    // Только действующие (не просроченные) разрешения
                    ->where(function ($q) {
                        $q->whereNull('end_date')
                          ->orWhere('end_date', '>=', now()->startOfDay());
                    })
                    ->orderBy('created_at', 'desc')
                    ->first();
                    
                if ($permit) {
                    $task = Task::find($permit->task_id);
                }
            }

            if (!$truck && $correctedPlate) {
                $truck = $this->resolveOrCreateTruckByPlate($correctedPlate);
            }

            $permit = $truck
                ? $this->getActivePermitForTruck($truck->id, $visitor->yard_id)
                : null;

            if ($shouldCreatePermit && $truck && !$permit) {
                $permit = $this->createOneTimePermit(
                    $truck->id,
                    $visitor->yard_id,
                    $validate['operator_user_id'],
                    $shouldCreateWeighing
                );
            }

            // Проверка строгого режима
            $yard = Yard::find($visitor->yard_id);
            $hasPermit = $permit !== null;
            
            if ($yard && $yard->strict_mode && !$hasPermit) {
                return response()->json([
                    'status' => false,
                    'message' => 'Въезд запрещён: строгий режим активен, требуется разрешение на въезд',
                    'error_code' => 'STRICT_MODE_NO_PERMIT',
                ], 403);
            }

            // Обновляем посетителя
            $visitor->update([
                'plate_number' => $correctedPlate,
                'truck_id' => $truck?->id,
                'task_id' => $task?->id,
                'truck_category_id' => $truck?->truck_category_id,
                'truck_brand_id' => $truck?->truck_brand_id,
                'entry_permit_id' => $permit?->id,
                'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
                'confirmed_by_user_id' => $validate['operator_user_id'],
                'confirmed_at' => now(),
                'comment' => $validate['comment'] ?? null,
            ]);

            // Обработка подтверждённого посетителя, даже если задача отсутствует:
            // это нужно для создания требования на взвешивание по разрешению или политике двора.
            $this->processConfirmedVisitor($visitor, $task, $visitor->yard_id);

            return response()->json([
                'status' => true,
                'message' => 'Visitor confirmed successfully',
                'data' => $visitor->fresh(),
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Отклонить посетителя (ложное срабатывание камеры)
     */
    public function rejectVisitor(Request $request)
    {
        try {
            $validate = $request->validate([
                'visitor_id' => 'required|integer|exists:visitors,id',
                'operator_user_id' => 'required|integer|exists:users,id',
                'reason' => 'nullable|string|max:255',
            ]);

            $visitor = Visitor::find($validate['visitor_id']);
            
            $visitor->update([
                'confirmation_status' => Visitor::CONFIRMATION_REJECTED,
                'confirmed_by_user_id' => $validate['operator_user_id'],
                'confirmed_at' => now(),
                'name' => $validate['reason'] ?? 'Отклонено оператором',
            ]);

            return response()->json([
                'status' => true,
                'message' => 'Visitor rejected',
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Получить ожидаемые ТС (задачи со статусом "new" на указанный двор)
     */
    public function getExpectedVehicles(Request $request)
    {
        try {
            $validate = $request->validate([
                'yard_id' => 'required|integer|exists:yards,id',
            ]);

            $tasks = $this->getExpectedTasks($validate['yard_id']);

            return response()->json([
                'status' => true,
                'message' => 'Expected vehicles retrieved',
                'count' => count($tasks),
                'data' => $tasks,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Поиск похожих номеров (для подсказок оператору)
     */
    public function searchSimilarPlates(Request $request)
    {
        try {
            $validate = $request->validate([
                'plate_number' => 'required|string|max:50',
                'yard_id' => 'nullable|integer|exists:yards,id',
            ]);

            $similar = $this->findSimilarPlates(
                $validate['plate_number'], 
                $validate['yard_id'] ?? null
            );

            return response()->json([
                'status' => true,
                'data' => $similar,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Нормализация номера (убираем пробелы, приводим к нижнему регистру)
     */
    private function normalizePlateNumber(string $plate): string
    {
        return strtolower(str_replace([' ', '-'], '', $plate));
    }

    private function findTruckByNormalizedPlate(?string $normalizedPlate): ?Truck
    {
        if (empty($normalizedPlate)) {
            return null;
        }

        return Truck::whereRaw(
            "REPLACE(REPLACE(LOWER(plate_number), ' ', ''), '-', '') = ?",
            [$normalizedPlate]
        )->first();
    }

    private function resolveOrCreateTruckByPlate(?string $plateNumber): ?Truck
    {
        $normalizedPlate = Truck::normalizePlateNumber($plateNumber);

        if (empty($normalizedPlate)) {
            return null;
        }

        return $this->findTruckByNormalizedPlate(strtolower($normalizedPlate))
            ?? Truck::create([
                'plate_number' => $normalizedPlate,
            ]);
    }

    private function createOneTimePermit(int $truckId, int $yardId, ?int $grantedByUserId, bool $weighingRequired = false): ?EntryPermit
    {
        $activeStatus = Status::where('key', 'active')->first();

        if (!$activeStatus) {
            return null;
        }

        [$permit, $replacedPermits] = DB::transaction(function () use ($truckId, $yardId, $weighingRequired, $activeStatus, $grantedByUserId) {
            $replacedPermits = $this->permitReplacementService->deactivateExistingActivePermits($truckId, $yardId);

            $permit = EntryPermit::create([
                'truck_id' => $truckId,
                'yard_id' => $yardId,
                'one_permission' => true,
                'weighing_required' => $weighingRequired,
                'status_id' => $activeStatus->id,
                'granted_by_user_id' => $grantedByUserId,
            ]);

            return [$permit, $replacedPermits];
        });

        foreach ($replacedPermits as $replacedPermit) {
            $this->permitVehicleService->revokePermitVehicleSafely($replacedPermit);
        }

        $this->permitVehicleService->syncPermitVehicleSafely($permit);

        return $permit;
    }

    private function getActivePermitForTruck(int $truckId, int $yardId): ?EntryPermit
    {
        $activeStatus = Status::where('key', 'active')->first();

        if (!$activeStatus) {
            return null;
        }

        return EntryPermit::where('truck_id', $truckId)
            ->where('yard_id', $yardId)
            ->where('status_id', $activeStatus->id)
            ->where(function ($q) {
                $q->whereNull('end_date')
                    ->orWhere('end_date', '>=', now()->startOfDay());
            })
            ->orderBy('created_at', 'desc')
            ->first();
    }

    private function findLatestCaptureForVisitor(?int $deviceId, ?string $plateNumber, $entryDate): ?VehicleCapture
    {
        if (!$deviceId || !$plateNumber) {
            return null;
        }

        $normalizedPlate = $this->normalizePlateNumber($plateNumber);
        $targetTimestamp = strtotime((string) $entryDate);

        $query = VehicleCapture::query()
            ->where('devaice_id', $deviceId)
            ->whereRaw(
                "REPLACE(REPLACE(LOWER(plateNo), ' ', ''), '-', '') = ?",
                [$normalizedPlate]
            );

        if ($targetTimestamp) {
            $query->whereBetween('captureTime', [
                (string) ($targetTimestamp - 600),
                (string) ($targetTimestamp + 600),
            ])->orderByRaw('ABS(CAST(captureTime AS SIGNED) - ?) asc', [$targetTimestamp]);
        }

        return $query->orderByDesc('id')->first();
    }

    private function buildCapturePictureUrl(?VehicleCapture $capture): ?string
    {
        if (!$capture) {
            return null;
        }

        if ($capture->local_capturePicture) {
            return '/storage/' . ltrim($capture->local_capturePicture, '/');
        }

        return null;
    }

    private function buildPlatePictureUrl(?VehicleCapture $capture): ?string
    {
        if (!$capture || !$capture->plateNoPicture) {
            return null;
        }

        return $capture->plateNoPicture;
    }

    private function getExitReviewVisitors(CheckpointExitReview $review): array
    {
        if ($review->status !== 'pending' && $review->resolved_visitor_id) {
            $resolvedVisitor = Visitor::query()
                ->leftJoin('tasks', 'visitors.task_id', '=', 'tasks.id')
                ->select('visitors.*', 'tasks.name as task_name')
                ->where('visitors.id', $review->resolved_visitor_id)
                ->first();

            if ($resolvedVisitor) {
                return [[
                    'visitor_id' => $resolvedVisitor->id,
                    'plate_number' => $resolvedVisitor->plate_number,
                    'entry_date' => $resolvedVisitor->entry_date,
                    'task_id' => $resolvedVisitor->task_id,
                    'task_name' => $resolvedVisitor->task_name,
                    'confirmation_status' => $resolvedVisitor->confirmation_status,
                    'truck_id' => $resolvedVisitor->truck_id,
                    'is_exact_truck_match' => $review->truck_id ? (int) $resolvedVisitor->truck_id === (int) $review->truck_id : false,
                    'is_exact_plate_match' => $this->normalizePlateNumber((string) $resolvedVisitor->plate_number) === $review->normalized_plate,
                ]];
            }
        }

        return $this->findActiveVisitorsForExitReview($review);
    }

    private function findActiveVisitorsForExitReview(CheckpointExitReview $review): array
    {
        $query = Visitor::query()
            ->where('visitors.yard_id', $review->yard_id)
            ->whereNull('visitors.exit_date')
            ->leftJoin('tasks', 'visitors.task_id', '=', 'tasks.id')
            ->select('visitors.*', 'tasks.name as task_name');

        if ($review->truck_id) {
            $query->where(function ($builder) use ($review) {
                $builder->where('visitors.truck_id', $review->truck_id)
                    ->orWhereRaw(
                        "REPLACE(REPLACE(LOWER(visitors.plate_number), ' ', ''), '-', '') = ?",
                        [$review->normalized_plate]
                    );
            });
        } else {
            $query->whereRaw(
                "REPLACE(REPLACE(LOWER(visitors.plate_number), ' ', ''), '-', '') = ?",
                [$review->normalized_plate]
            );
        }

        return $query
            ->orderByRaw("CASE WHEN visitors.confirmation_status = ? THEN 0 ELSE 1 END", [Visitor::CONFIRMATION_CONFIRMED])
            ->orderByDesc('visitors.entry_date')
            ->limit(10)
            ->get()
            ->map(function ($visitor) use ($review) {
                return [
                    'visitor_id' => $visitor->id,
                    'plate_number' => $visitor->plate_number,
                    'entry_date' => $visitor->entry_date,
                    'task_id' => $visitor->task_id,
                    'task_name' => $visitor->task_name,
                    'confirmation_status' => $visitor->confirmation_status,
                    'truck_id' => $visitor->truck_id,
                    'is_exact_truck_match' => $review->truck_id ? (int) $visitor->truck_id === (int) $review->truck_id : false,
                    'is_exact_plate_match' => $this->normalizePlateNumber((string) $visitor->plate_number) === $review->normalized_plate,
                ];
            })
            ->values()
            ->toArray();
    }

    private function resolveSingleExitCandidate(CheckpointExitReview $review): ?Visitor
    {
        $candidates = $this->findActiveVisitorsForExitReview($review);

        if (count($candidates) !== 1) {
            return null;
        }

        return Visitor::find($candidates[0]['visitor_id']);
    }

    /**
     * Поиск похожих номеров с учётом типичных ошибок OCR
     */
    private function findSimilarPlates(string $plate, ?int $yardId = null): array
    {
        $normalized = $this->normalizePlateNumber($plate);
        
        // Создаём варианты с типичными заменами OCR
        $ocrReplacements = [
            '0' => ['O', 'o', 'О', 'о', 'Q'],
            'O' => ['0', 'О', 'о'],
            'o' => ['0', 'O', 'О'],
            '1' => ['I', 'i', 'l', '|', 'L'],
            'I' => ['1', 'i', 'l', '|'],
            'i' => ['1', 'I', 'l'],
            'l' => ['1', 'I', 'i', '|'],
            'B' => ['8', 'В', 'в'],
            '8' => ['B', 'В'],
            'S' => ['5', '$'],
            '5' => ['S', '$'],
            'Z' => ['2'],
            '2' => ['Z'],
            'G' => ['6'],
            '6' => ['G'],
            'А' => ['A'],
            'В' => ['B', '8'],
            'Е' => ['E'],
            'К' => ['K'],
            'М' => ['M'],
            'Н' => ['H'],
            'О' => ['O', '0'],
            'Р' => ['P'],
            'С' => ['C'],
            'Т' => ['T'],
            'У' => ['Y'],
            'Х' => ['X'],
        ];

        // Базовый запрос - ищем похожие по LIKE
        $query = Truck::query()
            ->leftJoin('truck_models', 'trucks.truck_model_id', '=', 'truck_models.id')
            ->select(
                'trucks.id',
                'trucks.plate_number',
                'truck_models.name as truck_model_name'
            );

        // Поиск по частичному совпадению (минимум 4 символа)
        if (strlen($normalized) >= 4) {
            $searchPattern = '%' . substr($normalized, 0, 4) . '%';
            $query->whereRaw("REPLACE(LOWER(plate_number), ' ', '') LIKE ?", [$searchPattern]);
        } else {
            $query->whereRaw("REPLACE(LOWER(plate_number), ' ', '') LIKE ?", ['%' . $normalized . '%']);
        }

        $trucks = $query->limit(20)->get();

        // Добавляем информацию о разрешениях и задачах
        $activeStatus = Status::where('key', 'active')->first();
        $result = $trucks->map(function ($truck) use ($yardId, $normalized, $activeStatus) {
            $permit = null;
            $task = null;
            
            if ($yardId && $activeStatus) {
                $permit = EntryPermit::where('truck_id', $truck->id)
                    ->where('yard_id', $yardId)
                    ->where('status_id', $activeStatus->id)
                    // Только действующие (не просроченные) разрешения
                    ->where(function ($q) {
                        $q->whereNull('end_date')
                          ->orWhere('end_date', '>=', now()->startOfDay());
                    })
                    ->orderBy('created_at', 'desc')
                    ->first();
                    
                if ($permit) {
                    $task = Task::find($permit->task_id);
                }
            }

            // Вычисляем "похожесть" номера
            $truckNormalized = $this->normalizePlateNumber($truck->plate_number);
            $similarity = similar_text($normalized, $truckNormalized, $percent);

            return [
                'truck_id' => $truck->id,
                'plate_number' => $truck->plate_number,
                'truck_model_name' => $truck->truck_model_name,
                'has_permit' => $permit !== null,
                'permit_id' => $permit?->id,
                'task_id' => $task?->id,
                'task_name' => $task?->name,
                'similarity_percent' => round($percent, 1),
            ];
        })
        ->sortByDesc('similarity_percent')
        ->values()
        ->toArray();

        return $result;
    }

    /**
     * Получить список ожидаемых задач на двор
     */
    private function getExpectedTasks(int $yardId): array
    {
        $statusNew = Status::where('key', 'new')->first();
        $activeStatus = Status::where('key', 'active')->first();
        
        if (!$statusNew || !$activeStatus) {
            return [];
        }

        $tasks = Task::query()
            ->where('status_id', $statusNew->id)
            ->where(function ($q) use ($yardId, $activeStatus) {
                $q->where('yard_id', $yardId)
                  ->orWhereExists(function ($subQuery) use ($yardId, $activeStatus) {
                      $subQuery->from('entry_permits')
                          ->whereRaw('entry_permits.task_id = tasks.id')
                          ->where('entry_permits.yard_id', $yardId)
                          ->where('entry_permits.status_id', $activeStatus->id);
                  });
            })
            ->leftJoin('trucks', 'tasks.truck_id', '=', 'trucks.id')
            ->leftJoin('users', 'tasks.user_id', '=', 'users.id')
            ->select(
                'tasks.id',
                'tasks.name',
                'tasks.description',
                'tasks.plan_date',
                'tasks.avtor',
                'trucks.id as truck_id',
                'trucks.plate_number',
                'users.name as driver_name',
                'users.phone as driver_phone'
            )
            ->orderBy('tasks.plan_date', 'asc')
            ->limit(50)
            ->get()
            ->toArray();

        return $tasks;
    }

    /**
     * Обработка подтверждённого посетителя (обновление задачи, уведомления)
     */
    private function processConfirmedVisitor(Visitor $visitor, ?Task $task, int $yardId): void
    {
        $statusOnTerritory = Status::where('key', 'on_territory')->first();
        $yard = DB::table('yards')->where('id', $yardId)->first();

        if ($task && $statusOnTerritory) {
            $task->update([
                'begin_date' => $visitor->entry_date ?? now(),
                'yard_id' => $yardId,
                'status_id' => $statusOnTerritory->id,
            ]);

            $warehouses = DB::table('task_loadings')
                ->leftJoin('warehouses', 'task_loadings.warehouse_id', '=', 'warehouses.id')
                ->where('task_loadings.task_id', $task->id)
                ->select('warehouses.name')
                ->get();

            $permit = EntryPermit::where('truck_id', $visitor->truck_id)
                ->where('yard_id', $yardId)
                ->where('status_id', Status::where('key', 'active')->first()->id)
                ->where(function ($q) {
                    $q->whereNull('end_date')
                      ->orWhere('end_date', '>=', now()->startOfDay());
                })
                ->orderBy('created_at', 'desc')
                ->first();

            $permitText = $permit ? ($permit->one_permission ? 'Одноразовое' : 'Многоразовое') : 'Нет разрешения';

            (new TelegramController())->sendNotification(
                '<b>🚛 Въезд на территорию ' . e($yard->name) . "</b>\n\n" .
                '<b>🏷️ ТС:</b> ' . e($visitor->plate_number) . "\n" .
                '<b>📦 Задание:</b> ' . e($task->name) . "\n" .
                '<b>📝 Описание:</b> ' . e($task->description) . "\n" .
                '<b>👤 Водитель:</b> ' . ($task->user_id
                    ? e(DB::table('users')->where('id', $task->user_id)->value('name')) .
                      ' (' . e(DB::table('users')->where('id', $task->user_id)->value('phone')) . ')'
                    : 'Не указан') . "\n" .
                '<b>✍️ Автор:</b> ' . e($task->avtor) . "\n" .
                '<b>🏬 Склады:</b> ' . e($warehouses->pluck('name')->implode(', ')) . "\n" .
                '<b>🛂 Разрешение:</b> <i>' . e($permitText) . '</i>' .
                ($visitor->original_plate_number !== $visitor->plate_number
                    ? "\n<b>⚠️ Скорректировано:</b> " . e($visitor->original_plate_number) . " → " . e($visitor->plate_number)
                    : '')
            );
        }

        // Загружаем связи для корректной работы WeighingService
        $visitor->load(['yard', 'truck', 'task']);

        // Создаём требование на взвешивание (если нужно)
        $this->weighingService->createRequirement($visitor);
    }

    /**
     * Получить список разрешений с фильтрами
     */
    public function getPermits(Request $request)
    {
        try {
            $query = $this->buildPermitsQuery($request);

            // Сортировка
            $sortField = $request->input('sort_field', 'created_at');
            $sortDirection = $request->input('sort_direction', 'desc');
            
            // Разрешённые поля для сортировки
            $allowedSortFields = [
                'created_at' => 'entry_permits.created_at',
                'begin_date' => 'entry_permits.begin_date',
                'end_date' => 'entry_permits.end_date',
                'plate_number' => 'trucks.plate_number',
            ];
            
            // Валидация направления сортировки
            $sortDirection = strtolower($sortDirection) === 'asc' ? 'asc' : 'desc';
            
            // Применяем сортировку
            if (isset($allowedSortFields[$sortField])) {
                $query->orderBy($allowedSortFields[$sortField], $sortDirection);
            } else {
                $query->orderBy('entry_permits.created_at', 'desc');
            }

            // Пагинация
            $perPage = $request->input('per_page', 25); // По умолчанию 25 записей
            $page = $request->input('page', 1);
            
            // Ограничиваем максимальное количество записей на страницу
            $perPage = min((int)$perPage, 100);
            
            $paginated = $query->paginate($perPage, ['*'], 'page', $page);

            return response()->json([
                'status' => true,
                'message' => 'Permits retrieved successfully',
                'data' => $paginated->items(),
                'pagination' => [
                    'current_page' => $paginated->currentPage(),
                    'last_page' => $paginated->lastPage(),
                    'per_page' => $paginated->perPage(),
                    'total' => $paginated->total(),
                    'from' => $paginated->firstItem(),
                    'to' => $paginated->lastItem(),
                ],
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function syncPermitsWithDss(Request $request)
    {
        try {
            $baseQuery = $this->buildPermitsQuery($request)
                ->orderBy('entry_permits.created_at', 'desc');

            $maxBatchSize = max(1, (int) config('dss.permit_vehicle_sync.max_batch_size', 28));
            $inactiveStatusId = Status::where('key', 'not_active')->value('id');
            $totalMatching = (clone $baseQuery)->count('entry_permits.id');

            $permits = $baseQuery
                ->orderBy('entry_permits.created_at', 'desc')
                ->limit($maxBatchSize)
                ->get();

            $summary = [
                'processed' => 0,
                'synced' => 0,
                'revoked' => 0,
                'failed' => 0,
                'skipped' => 0,
            ];
            $processedPermitIds = [];

            foreach ($permits as $permit) {
                $summary['processed']++;
                $processedPermitIds[] = $permit->id;

                if (!$this->isPermitEffectiveActive($permit) && ($permit->status_key ?? null) === 'active' && $inactiveStatusId) {
                    $permit->status_id = $inactiveStatusId;
                    $permit->save();
                    $permit->status_key = 'not_active';
                }
            }

            $results = $this->permitVehicleService->smartSyncPermitsBatchSafely($permits->all());

            foreach ($permits as $permit) {
                $result = $results[$permit->id] ?? [
                    'error' => 'DSS batch result missing for permit',
                ];

                if (!empty($result['success'])) {
                    if (($result['action'] ?? null) === 'revoke' || in_array($result['status'] ?? null, ['revoked'], true)) {
                        $summary['revoked']++;
                    } else {
                        $summary['synced']++;
                    }
                } elseif (isset($result['error'])) {
                    $summary['failed']++;
                } else {
                    $summary['skipped']++;
                }
            }

            $remoteVehicleIdBackfill = $this->permitVehicleService->backfillRemoteVehicleIdsForPermits($processedPermitIds);

            return response()->json([
                'status' => true,
                'message' => 'Синхронизация разрешений с DSS завершена',
                'summary' => $summary,
                'remote_vehicle_id_backfill' => $remoteVehicleIdBackfill,
                'processed_permit_ids' => $processedPermitIds,
                'batch_limit' => $maxBatchSize,
                'matching_total' => $totalMatching,
                'remaining' => max(0, $totalMatching - $summary['processed']),
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Создать разрешение на въезд
     */
    public function addPermit(Request $request)
    {
        try {
            $validate = $request->validate([
                'truck_id' => 'required|integer|exists:trucks,id',
                'yard_id' => 'required|integer|exists:yards,id',
                'user_id' => 'nullable|integer|exists:users,id', // Водитель
                'granted_by_user_id' => 'nullable|integer|exists:users,id', // Кто выдал
                'task_id' => 'nullable|integer|exists:tasks,id',
                'one_permission' => 'required|boolean', // true = разовое
                'weighing_required' => 'nullable|boolean', // Требуется ли взвешивание
                'begin_date' => 'nullable|date',
                'end_date' => 'nullable|date',
                'comment' => 'nullable|string|max:500',
                // Гостевые поля
                'is_guest' => 'nullable|boolean',
                'guest_name' => 'nullable|string|max:255',
                'guest_company' => 'nullable|string|max:255',
                'guest_destination' => 'nullable|string|max:255',
                'guest_purpose' => 'nullable|string|max:500',
                'guest_phone' => 'nullable|string|max:50',
            ]);

            // Получаем статус "active"
            $activeStatus = Status::where('key', 'active')->first();
            if (!$activeStatus) {
                return response()->json([
                    'status' => false,
                    'message' => 'Active status not found',
                ], 500);
            }

            [$permit, $replacedPermits] = DB::transaction(function () use ($validate, $activeStatus) {
                $replacedPermits = $this->permitReplacementService->deactivateExistingActivePermits(
                    $validate['truck_id'],
                    $validate['yard_id']
                );

                $permit = EntryPermit::create([
                    'truck_id' => $validate['truck_id'],
                    'yard_id' => $validate['yard_id'],
                    'user_id' => $validate['user_id'] ?? null,
                    'granted_by_user_id' => $validate['granted_by_user_id'] ?? null,
                    'task_id' => $validate['task_id'] ?? null,
                    'one_permission' => $validate['one_permission'],
                    'weighing_required' => $validate['weighing_required'] ?? null,
                    'begin_date' => $validate['begin_date'] ?? now(),
                    'end_date' => $validate['end_date'] ?? null,
                    'status_id' => $activeStatus->id,
                    'comment' => $validate['comment'] ?? null,
                    'is_guest' => $validate['is_guest'] ?? false,
                    'guest_name' => $validate['guest_name'] ?? null,
                    'guest_company' => $validate['guest_company'] ?? null,
                    'guest_destination' => $validate['guest_destination'] ?? null,
                    'guest_purpose' => $validate['guest_purpose'] ?? null,
                    'guest_phone' => $validate['guest_phone'] ?? null,
                ]);

                return [$permit, $replacedPermits];
            });

            $dssReplacedPermits = [];

            foreach ($replacedPermits as $replacedPermit) {
                $dssReplacedPermits[] = $this->permitVehicleService->revokePermitVehicleSafely($replacedPermit);
            }

            $dssVehicleSync = $this->permitVehicleService->syncPermitVehicleSafely($permit);

            // Загружаем связи для ответа
            $permit->load(['truck', 'yard', 'driver', 'grantedBy', 'task']);

            return response()->json([
                'status' => true,
                'message' => 'Разрешение успешно создано',
                'data' => $permit,
                'replaced_permits_count' => $replacedPermits->count(),
                'dss_replaced_permits' => $dssReplacedPermits,
                'dss_vehicle_sync' => $dssVehicleSync,
            ], 200);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'status' => false,
                'message' => 'Ошибка валидации',
                'errors' => $e->errors(),
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Обновить разрешение
     */
    public function updatePermit(Request $request)
    {
        try {
            $validate = $request->validate([
                'id' => 'required|integer|exists:entry_permits,id',
                'user_id' => 'nullable|integer|exists:users,id',
                'one_permission' => 'nullable|boolean',
                'weighing_required' => 'nullable|boolean',
                'begin_date' => 'nullable|date',
                'end_date' => 'nullable|date',
                'comment' => 'nullable|string|max:500',
                // Гостевые поля
                'is_guest' => 'nullable|boolean',
                'guest_name' => 'nullable|string|max:255',
                'guest_company' => 'nullable|string|max:255',
                'guest_destination' => 'nullable|string|max:255',
                'guest_purpose' => 'nullable|string|max:500',
                'guest_phone' => 'nullable|string|max:50',
            ]);

            $permit = EntryPermit::find($validate['id']);

            $updateData = [];
            if (isset($validate['user_id'])) $updateData['user_id'] = $validate['user_id'];
            if (isset($validate['one_permission'])) $updateData['one_permission'] = $validate['one_permission'];
            if (array_key_exists('weighing_required', $validate)) $updateData['weighing_required'] = $validate['weighing_required'];
            if (isset($validate['begin_date'])) $updateData['begin_date'] = $validate['begin_date'];
            if (isset($validate['end_date'])) $updateData['end_date'] = $validate['end_date'];
            if (isset($validate['comment'])) $updateData['comment'] = $validate['comment'];
            // Гостевые поля
            if (array_key_exists('is_guest', $validate)) $updateData['is_guest'] = $validate['is_guest'];
            if (array_key_exists('guest_name', $validate)) $updateData['guest_name'] = $validate['guest_name'];
            if (array_key_exists('guest_company', $validate)) $updateData['guest_company'] = $validate['guest_company'];
            if (array_key_exists('guest_destination', $validate)) $updateData['guest_destination'] = $validate['guest_destination'];
            if (array_key_exists('guest_purpose', $validate)) $updateData['guest_purpose'] = $validate['guest_purpose'];
            if (array_key_exists('guest_phone', $validate)) $updateData['guest_phone'] = $validate['guest_phone'];

            $permit->update($updateData);

            return response()->json([
                'status' => true,
                'message' => 'Разрешение обновлено',
                'data' => $permit->fresh(),
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Деактивировать разрешение
     */
    public function deactivatePermit(Request $request)
    {
        try {
            $validate = $request->validate([
                'id' => 'required|integer|exists:entry_permits,id',
            ]);

            $permit = EntryPermit::find($validate['id']);
            
            $inactiveStatus = Status::where('key', 'not_active')->first();
            if (!$inactiveStatus) {
                return response()->json([
                    'status' => false,
                    'message' => 'Inactive status not found',
                ], 500);
            }

            $permit->update([
                'status_id' => $inactiveStatus->id,
                'end_date' => now(),
            ]);

            $dssVehicleRevoke = $this->permitVehicleService->revokePermitVehicleSafely($permit);

            return response()->json([
                'status' => true,
                'message' => 'Разрешение деактивировано',
                'data' => $permit->fresh(),
                'dss_vehicle_revoke' => $dssVehicleRevoke,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Массовая деактивация просроченных разовых разрешений
     */
    public function deactivateExpiredPermits(Request $request)
    {
        try {
            $yardId = $request->input('yard_id'); // Опционально: только для конкретного двора
            
            $activeStatus = Status::where('key', 'active')->first();
            $inactiveStatus = Status::where('key', 'not_active')->first();
            
            if (!$activeStatus || !$inactiveStatus) {
                return response()->json([
                    'status' => false,
                    'message' => 'Статусы не найдены',
                ], 500);
            }

            // Находим просроченные разовые разрешения
            $query = EntryPermit::where('status_id', $activeStatus->id)
                ->where('one_permission', true)  // Только разовые
                ->where('end_date', '<', now()->startOfDay());  // Просроченные

            if ($yardId) {
                $query->where('yard_id', $yardId);
            }

            $expiredPermits = $query->get();
            $expiredCount = $expiredPermits->count();
            $revokeSummary = [
                'success' => 0,
                'failed' => 0,
                'skipped' => 0,
            ];

            foreach ($expiredPermits as $permit) {
                $permit->update([
                    'status_id' => $inactiveStatus->id,
                ]);

                $revokeResult = $this->permitVehicleService->revokePermitVehicleSafely($permit);

                if (!empty($revokeResult['success'])) {
                    $revokeSummary['success']++;
                } elseif (isset($revokeResult['error'])) {
                    $revokeSummary['failed']++;
                } else {
                    $revokeSummary['skipped']++;
                }
            }

            return response()->json([
                'status' => true,
                'message' => "Деактивировано {$expiredCount} просроченных разрешений",
                'deactivated_count' => $expiredCount,
                'dss_vehicle_revoke_summary' => $revokeSummary,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Удалить разрешение (только неактивные)
     */
    public function deletePermit(Request $request)
    {
        try {
            $validate = $request->validate([
                'id' => 'required|integer|exists:entry_permits,id',
            ]);

            $permit = EntryPermit::find($validate['id']);
            
            $activeStatus = Status::where('key', 'active')->first();
            if ($permit->status_id === $activeStatus->id) {
                return response()->json([
                    'status' => false,
                    'message' => 'Нельзя удалить активное разрешение. Сначала деактивируйте его.',
                ], 400);
            }

            $permit->delete();

            return response()->json([
                'status' => true,
                'message' => 'Разрешение удалено',
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Получить разрешения для конкретного ТС
     */
    public function getPermitsByTruck(Request $request)
    {
        try {
            $validate = $request->validate([
                'truck_id' => 'required|integer|exists:trucks,id',
            ]);

            $permits = EntryPermit::where('truck_id', $validate['truck_id'])
                ->leftJoin('yards', 'entry_permits.yard_id', '=', 'yards.id')
                ->leftJoin('users as drivers', 'entry_permits.user_id', '=', 'drivers.id')
                ->leftJoin('users as granters', 'entry_permits.granted_by_user_id', '=', 'granters.id')
                ->leftJoin('tasks', 'entry_permits.task_id', '=', 'tasks.id')
                ->leftJoin('statuses', 'entry_permits.status_id', '=', 'statuses.id')
                ->select(
                    'entry_permits.*',
                    'yards.name as yard_name',
                    'yards.strict_mode as yard_strict_mode',
                    'drivers.name as driver_name',
                    'granters.name as granted_by_name',
                    'tasks.name as task_name',
                    'statuses.name as status_name',
                    'statuses.key as status_key'
                )
                ->orderBy('entry_permits.created_at', 'desc')
                ->get();

            return response()->json([
                'status' => true,
                'message' => 'Permits for truck retrieved successfully',
                'data' => $permits,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    private function buildPermitsQuery(Request $request)
    {
        $query = EntryPermit::query()
            ->leftJoin('trucks', 'entry_permits.truck_id', '=', 'trucks.id')
            ->leftJoin('truck_models', 'trucks.truck_model_id', '=', 'truck_models.id')
            ->leftJoin('truck_brands', 'trucks.truck_brand_id', '=', 'truck_brands.id')
            ->leftJoin('dss_parking_permits', 'entry_permits.id', '=', 'dss_parking_permits.entry_permit_id')
            ->leftJoin('yards', 'entry_permits.yard_id', '=', 'yards.id')
            ->leftJoin('users as drivers', 'entry_permits.user_id', '=', 'drivers.id')
            ->leftJoin('users as granters', 'entry_permits.granted_by_user_id', '=', 'granters.id')
            ->leftJoin('tasks', 'entry_permits.task_id', '=', 'tasks.id')
            ->leftJoin('statuses', 'entry_permits.status_id', '=', 'statuses.id')
            ->select(
                'entry_permits.*',
                'trucks.plate_number',
                'trucks.color as truck_color',
                'truck_models.name as truck_model_name',
                'truck_brands.name as truck_brand_name',
                'yards.name as yard_name',
                'yards.strict_mode as yard_strict_mode',
                'drivers.name as driver_name',
                'drivers.phone as driver_phone',
                'granters.name as granted_by_name',
                'tasks.name as task_name',
                'statuses.name as status_name',
                'statuses.key as status_key',
                'dss_parking_permits.id as dss_parking_permit_id',
                'dss_parking_permits.status as dss_parking_status',
                'dss_parking_permits.synced_at as dss_parking_synced_at',
                'dss_parking_permits.error_message as dss_parking_error_message'
            );

        if ($request->has('yard_id') && $request->yard_id) {
            $query->where('entry_permits.yard_id', $request->yard_id);
        }

        if ($request->has('status') && $request->status) {
            if ($request->status === 'active') {
                $query->where('statuses.key', 'active');
                $query->where(function ($q) {
                    $q->whereNull('entry_permits.end_date')
                        ->orWhere('entry_permits.end_date', '>=', now()->startOfDay());
                });
            } elseif ($request->status === 'inactive') {
                $query->where('statuses.key', 'not_active');
            }
        }

        if ($request->has('permit_type') && $request->permit_type !== 'all') {
            if ($request->permit_type === 'one_time') {
                $query->where('entry_permits.one_permission', true);
            } elseif ($request->permit_type === 'permanent') {
                $query->where('entry_permits.one_permission', false);
            }
        }

        if ($request->has('plate_number') && $request->plate_number) {
            $plate = strtolower(str_replace(' ', '', $request->plate_number));
            $query->whereRaw("LOWER(REPLACE(trucks.plate_number, ' ', '')) LIKE ?", ['%' . $plate . '%']);
        }

        if ($request->has('guest_type') && $request->guest_type !== 'all') {
            if ($request->guest_type === 'guest') {
                $query->where('entry_permits.is_guest', true);
            } elseif ($request->guest_type === 'not_guest') {
                $query->where('entry_permits.is_guest', false);
            }
        }

        if ($request->has('guest_search') && $request->guest_search) {
            $guestSearch = '%' . $request->guest_search . '%';
            $query->where(function ($q) use ($guestSearch) {
                $q->where('entry_permits.guest_name', 'like', $guestSearch)
                    ->orWhere('entry_permits.guest_company', 'like', $guestSearch);
            });
        }

        if ($request->has('date_from') && $request->date_from) {
            $query->whereDate('entry_permits.created_at', '>=', $request->date_from);
        }

        if ($request->has('date_to') && $request->date_to) {
            $query->whereDate('entry_permits.created_at', '<=', $request->date_to);
        }

        if ($request->has('exclude_permit_ids') && is_array($request->exclude_permit_ids) && !empty($request->exclude_permit_ids)) {
            $excludePermitIds = array_values(array_filter(array_map('intval', $request->exclude_permit_ids), static fn (int $id) => $id > 0));
            if ($excludePermitIds !== []) {
                $query->whereNotIn('entry_permits.id', $excludePermitIds);
            }
        }

        if ($request->has('dss_sync_scope') && $request->dss_sync_scope && $request->dss_sync_scope !== 'all') {
            if ($request->dss_sync_scope === 'failed') {
                $query->whereIn('dss_parking_permits.status', ['failed', 'revoke_failed']);
            } elseif ($request->dss_sync_scope === 'already_exists') {
                $query->where('dss_parking_permits.status', 'already_exists');
            } elseif ($request->dss_sync_scope === 'no_status') {
                $query->whereNull('dss_parking_permits.id');
            }
        }

        return $query;
    }

    private function isPermitEffectiveActive(EntryPermit $permit): bool
    {
        if (($permit->status_key ?? null) !== 'active') {
            return false;
        }

        return !$permit->end_date || $permit->end_date >= now()->startOfDay();
    }
}
