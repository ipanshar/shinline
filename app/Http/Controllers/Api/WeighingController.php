<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Weighing;
use App\Models\WeighingRequirement;
use App\Models\Visitor;
use App\Models\Truck;
use App\Services\WeighingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

class WeighingController extends Controller
{
    protected WeighingService $weighingService;

    public function __construct(WeighingService $weighingService)
    {
        $this->weighingService = $weighingService;
    }

    /**
     * Получить список ожидающих взвешивания по двору
     */
    public function getPending(Request $request)
    {
        try {
            $validate = $request->validate([
                'yard_id' => 'required|integer|exists:yards,id',
            ]);

            $requirements = $this->weighingService->getPendingByYard($validate['yard_id']);

            $data = $requirements->map(function ($req) {
                return [
                    'id' => $req->id,
                    'visitor_id' => $req->visitor_id,
                    'truck_id' => $req->truck_id,
                    'task_id' => $req->task_id,
                    'plate_number' => $req->plate_number,
                    'required_type' => $req->required_type,
                    'reason' => $req->reason,
                    'reason_text' => $req->getReasonText(),
                    'status' => $req->status,
                    'needs_entry' => $req->needsEntryWeighing(),
                    'needs_exit' => $req->needsExitWeighing(),
                    'entry_weight' => $req->entryWeighing?->weight,
                    'entry_weighed_at' => $req->entryWeighing?->weighed_at,
                    'visitor_entry_date' => $req->visitor?->entry_date,
                    'task_name' => $req->task?->name,
                    'created_at' => $req->created_at,
                ];
            });

            return response()->json([
                'status' => true,
                'message' => 'Pending weighings retrieved',
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
     * Получить взвешивания за сегодня
     */
    public function getToday(Request $request)
    {
        try {
            $validate = $request->validate([
                'yard_id' => 'required|integer|exists:yards,id',
            ]);

            $weighings = $this->weighingService->getTodayByYard($validate['yard_id']);

            $data = $weighings->map(function ($w) {
                $paired = $w->getPairedWeighing();
                $historyGroupKey = $w->requirement_id
                    ? 'requirement:' . $w->requirement_id
                    : ($paired
                        ? 'pair:' . min($w->id, $paired->id) . '-' . max($w->id, $paired->id)
                        : 'single:' . $w->id);

                return [
                    'id' => $w->id,
                    'plate_number' => $w->plate_number,
                    'weighing_type' => $w->weighing_type,
                    'weight' => $w->weight,
                    'weighed_at' => $w->weighed_at,
                    'weight_diff' => $w->getWeightDifference(),
                    'visitor_id' => $w->visitor_id,
                    'truck_id' => $w->truck_id,
                    'requirement_id' => $w->requirement_id,
                    'history_group_key' => $historyGroupKey,
                    'operator_name' => $w->operator?->name,
                    'notes' => $w->notes,
                ];
            });

            return response()->json([
                'status' => true,
                'message' => 'Today weighings retrieved',
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
     * Получить историю взвешиваний за период
     */
    public function getHistory(Request $request)
    {
        try {
            $validate = $request->validate([
                'yard_id' => 'required|integer|exists:yards,id',
                'date_from' => 'nullable|date',
                'date_to' => 'nullable|date',
            ]);

            $weighings = $this->weighingService->getHistoryByYard(
                $validate['yard_id'],
                $validate['date_from'] ?? null,
                $validate['date_to'] ?? null
            );

            $data = $weighings->map(function ($w) {
                $paired = $w->getPairedWeighing();
                $historyGroupKey = $w->requirement_id
                    ? 'requirement:' . $w->requirement_id
                    : ($paired
                        ? 'pair:' . min($w->id, $paired->id) . '-' . max($w->id, $paired->id)
                        : 'single:' . $w->id);

                return [
                    'id' => $w->id,
                    'plate_number' => $w->plate_number,
                    'weighing_type' => $w->weighing_type,
                    'weight' => $w->weight,
                    'weighed_at' => $w->weighed_at,
                    'weight_diff' => $w->getWeightDifference(),
                    'visitor_id' => $w->visitor_id,
                    'truck_id' => $w->truck_id,
                    'requirement_id' => $w->requirement_id,
                    'history_group_key' => $historyGroupKey,
                    'operator_name' => $w->operator?->name,
                    'notes' => $w->notes,
                ];
            });

            return response()->json([
                'status' => true,
                'message' => 'Weighings history retrieved',
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
     * Записать взвешивание
     */
    public function record(Request $request)
    {
        try {
            $validator = Validator::make($request->all(), [
                'yard_id' => 'required|integer|exists:yards,id',
                'plate_number' => 'required|string|max:50',
                'weighing_type' => 'required|in:entry,exit,intermediate',
                'weight' => 'required|numeric|min:0|max:999999.99',
                'visitor_id' => 'nullable|integer|exists:visitors,id',
                'truck_id' => 'nullable|integer|exists:trucks,id',
                'requirement_id' => 'nullable|integer|exists:weighing_requirements,id',
                'operator_user_id' => 'nullable|integer|exists:users,id',
                'notes' => 'nullable|string|max:1000',
                'create_truck' => 'nullable|boolean',
            ]);

            if ($validator->fails()) {
                return $this->validationErrorResponse(
                    $validator->errors()->first(),
                    $validator->errors()->toArray()
                );
            }

            $validate = $validator->validated();

            $normalizedPlate = Truck::normalizePlateNumber($validate['plate_number']);

            if (!$this->isValidManualPlateNumber($normalizedPlate)) {
                return $this->validationErrorResponse(
                    'Некорректный номер ТС. Допустимы только буквы, цифры, пробелы и дефисы.',
                    ['plate_number' => ['Некорректный номер ТС. Допустимы только буквы, цифры, пробелы и дефисы.']]
                );
            }

            $truck = $this->findTruckByPlateNumber($normalizedPlate);
            $requestedTruck = !empty($validate['truck_id'])
                ? Truck::find($validate['truck_id'])
                : null;

            if ($requestedTruck) {
                $requestedTruckPlate = Truck::normalizePlateNumber($requestedTruck->plate_number);

                if ($requestedTruckPlate !== $normalizedPlate) {
                    return $this->validationErrorResponse(
                        'Выбранное ТС не соответствует введённому номеру.',
                        ['truck_id' => ['Выбранное ТС не соответствует введённому номеру.']]
                    );
                }

                $truck = $requestedTruck;
            }

            $shouldCreateTruck = (bool) ($validate['create_truck'] ?? false);

            if (!$truck && !$shouldCreateTruck) {
                return response()->json([
                    'status' => false,
                    'message' => 'ТС не найдено. Выберите существующее или подтвердите создание нового.',
                    'code' => 'truck_not_found',
                    'requires_truck_creation' => true,
                    'data' => [
                        'plate_number' => $normalizedPlate,
                    ],
                ], 422);
            }

            if (!$truck && $shouldCreateTruck) {
                $truck = Truck::create([
                    'plate_number' => $normalizedPlate,
                ]);
            }

            $visitor = null;

            // Если visitor_id не передан, но requirement_id есть - берём из него
            $visitorId = $validate['visitor_id'] ?? null;
            $taskId = null;
            $requirementId = $validate['requirement_id'] ?? null;

            if (!$visitorId && $requirementId) {
                $requirement = WeighingRequirement::find($requirementId);
                if ($requirement) {
                    $visitorId = $requirement->visitor_id;
                    $taskId = $requirement->task_id;
                    $visitor = $requirement->visitor_id ? Visitor::find($requirement->visitor_id) : null;
                }
            } elseif ($visitorId) {
                $visitor = Visitor::query()
                    ->whereKey($visitorId)
                    ->where('yard_id', $validate['yard_id'])
                    ->whereNull('exit_date')
                    ->first();

                if (!$visitor) {
                    return response()->json([
                        'status' => false,
                        'message' => 'Ручное взвешивание доступно только для ТС, которое сейчас находится на территории.',
                        'code' => 'visitor_not_on_yard',
                    ], 422);
                }

                $visitorId = $visitor->id;
                $taskId = $visitor->task_id;
            } else {
                $visitor = $this->findActiveVisitorForManualWeighing(
                    yardId: (int) $validate['yard_id'],
                    normalizedPlate: $normalizedPlate,
                    truckId: $truck?->id,
                );

                if (!$visitor) {
                    return response()->json([
                        'status' => false,
                        'message' => 'Ручное взвешивание доступно только для ТС, которое сейчас находится на территории.',
                        'code' => 'visitor_not_on_yard',
                    ], 422);
                }

                $visitorId = $visitor->id;
                $taskId = $visitor->task_id;
            }

            // Если visitor_id есть - берём task_id из него
            if ($visitorId && !$taskId) {
                $visitor = $visitor ?? Visitor::find($visitorId);
                $taskId = $visitor?->task_id;
            }

            if (!$requirementId && $visitor) {
                $this->confirmVisitorForManualWeighing(
                    $visitor,
                    $validate['operator_user_id'] ?? null,
                );
            }

            $weighing = $this->weighingService->recordWeighing(
                yardId: $validate['yard_id'],
                plateNumber: $normalizedPlate,
                weighingType: $validate['weighing_type'],
                weight: $validate['weight'],
                visitorId: $visitorId,
                truckId: $truck?->id,
                taskId: $taskId,
                requirementId: $requirementId,
                operatorUserId: $validate['operator_user_id'] ?? null,
                notes: $validate['notes'] ?? null,
            );

            return response()->json([
                'status' => true,
                'message' => 'Weighing recorded successfully',
                'data' => [
                    'id' => $weighing->id,
                    'plate_number' => $weighing->plate_number,
                    'weighing_type' => $weighing->weighing_type,
                    'weight' => $weighing->weight,
                    'weighed_at' => $weighing->weighed_at,
                    'weight_diff' => $weighing->getWeightDifference(),
                ],
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    private function findTruckByPlateNumber(string $normalizedPlate): ?Truck
    {
        return Truck::query()
            ->whereRaw(
                "REPLACE(REPLACE(UPPER(plate_number), ' ', ''), '-', '') = ?",
                [$normalizedPlate]
            )
            ->first();
    }

    private function findActiveVisitorForManualWeighing(int $yardId, string $normalizedPlate, ?int $truckId): ?Visitor
    {
        return Visitor::query()
            ->where('yard_id', $yardId)
            ->whereNull('exit_date')
            ->where(function ($query) use ($normalizedPlate, $truckId) {
                if ($truckId) {
                    $query->orWhere('truck_id', $truckId);
                }

                $query->orWhereRaw(
                    "REPLACE(REPLACE(UPPER(plate_number), ' ', ''), '-', '') = ?",
                    [$normalizedPlate]
                );
            })
            ->orderByRaw("CASE WHEN confirmation_status = ? THEN 0 ELSE 1 END", [Visitor::CONFIRMATION_CONFIRMED])
            ->when($truckId, function ($query, $truckId) {
                $query->orderByRaw("CASE WHEN truck_id = ? THEN 0 ELSE 1 END", [$truckId]);
            })
            ->orderByDesc('entry_date')
            ->first();
    }

    private function confirmVisitorForManualWeighing(Visitor $visitor, ?int $operatorUserId): void
    {
        $visitor->forceFill([
            'confirmation_status' => Visitor::CONFIRMATION_CONFIRMED,
            'confirmed_by_user_id' => $operatorUserId,
            'confirmed_at' => now(),
        ])->save();
    }

    private function isValidManualPlateNumber(?string $plateNumber): bool
    {
        if ($plateNumber === null) {
            return false;
        }

        $length = mb_strlen($plateNumber, 'UTF-8');

        if ($length < 3 || $length > 20) {
            return false;
        }

        return preg_match('/^[0-9A-ZА-ЯЁ]+$/u', $plateNumber) === 1;
    }

    private function validationErrorResponse(string $message, array $errors): JsonResponse
    {
        return response()->json([
            'status' => false,
            'message' => $message,
            'errors' => $errors,
        ], 422);
    }

    /**
     * Создать требование вручную
     */
    public function createRequirement(Request $request)
    {
        try {
            $validate = $request->validate([
                'yard_id' => 'required|integer|exists:yards,id',
                'visitor_id' => 'required|integer|exists:visitors,id',
                'plate_number' => 'required|string|max:50',
                'truck_id' => 'nullable|integer|exists:trucks,id',
                'task_id' => 'nullable|integer|exists:tasks,id',
                'required_type' => 'nullable|in:entry,exit,both',
            ]);

            $requirement = $this->weighingService->createManualRequirement(
                yardId: $validate['yard_id'],
                visitorId: $validate['visitor_id'],
                plateNumber: $validate['plate_number'],
                truckId: $validate['truck_id'] ?? null,
                taskId: $validate['task_id'] ?? null,
                requiredType: $validate['required_type'] ?? 'both',
            );

            return response()->json([
                'status' => true,
                'message' => 'Weighing requirement created',
                'data' => $requirement,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Пропустить взвешивание
     */
    public function skip(Request $request)
    {
        try {
            $validate = $request->validate([
                'requirement_id' => 'required|integer|exists:weighing_requirements,id',
                'user_id' => 'required|integer|exists:users,id',
                'reason' => 'required|string|max:500',
            ]);

            $requirement = $this->weighingService->skipRequirement(
                requirementId: $validate['requirement_id'],
                userId: $validate['user_id'],
                reason: $validate['reason'],
            );

            return response()->json([
                'status' => true,
                'message' => 'Weighing skipped',
                'data' => $requirement,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * История взвешиваний ТС
     */
    public function truckHistory(Request $request)
    {
        try {
            $validate = $request->validate([
                'truck_id' => 'required|integer|exists:trucks,id',
                'date_from' => 'nullable|date',
                'date_to' => 'nullable|date',
            ]);

            $weighings = $this->weighingService->getTruckHistory(
                truckId: $validate['truck_id'],
                dateFrom: $validate['date_from'] ?? null,
                dateTo: $validate['date_to'] ?? null,
            );

            return response()->json([
                'status' => true,
                'message' => 'Truck weighing history retrieved',
                'count' => $weighings->count(),
                'data' => $weighings,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Статистика по двору
     */
    public function statistics(Request $request)
    {
        try {
            $validate = $request->validate([
                'yard_id' => 'required|integer|exists:yards,id',
                'date_from' => 'required|date',
                'date_to' => 'required|date',
            ]);

            $stats = $this->weighingService->getStatistics(
                yardId: $validate['yard_id'],
                dateFrom: $validate['date_from'],
                dateTo: $validate['date_to'],
            );

            return response()->json([
                'status' => true,
                'message' => 'Statistics retrieved',
                'data' => $stats,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Получить все взвешивания (с фильтрами)
     */
    public function index(Request $request)
    {
        try {
            $validate = $request->validate([
                'yard_id' => 'nullable|integer|exists:yards,id',
                'date_from' => 'nullable|date',
                'date_to' => 'nullable|date',
                'plate_number' => 'nullable|string|max:50',
                'weighing_type' => 'nullable|in:entry,exit,intermediate',
                'limit' => 'nullable|integer|min:1|max:1000',
            ]);

            $query = Weighing::with(['yard', 'truck', 'visitor', 'operator'])
                ->orderBy('weighed_at', 'desc');

            if (!empty($validate['yard_id'])) {
                $query->where('yard_id', $validate['yard_id']);
            }

            if (!empty($validate['date_from'])) {
                $query->whereDate('weighed_at', '>=', $validate['date_from']);
            }

            if (!empty($validate['date_to'])) {
                $query->whereDate('weighed_at', '<=', $validate['date_to']);
            }

            if (!empty($validate['plate_number'])) {
                $query->where('plate_number', 'LIKE', '%' . $validate['plate_number'] . '%');
            }

            if (!empty($validate['weighing_type'])) {
                $query->where('weighing_type', $validate['weighing_type']);
            }

            $limit = $validate['limit'] ?? 100;
            $weighings = $query->limit($limit)->get();

            return response()->json([
                'status' => true,
                'message' => 'Weighings retrieved',
                'count' => $weighings->count(),
                'data' => $weighings,
            ], 200);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Error: ' . $e->getMessage(),
            ], 500);
        }
    }
}
