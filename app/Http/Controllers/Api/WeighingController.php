<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Weighing;
use App\Models\WeighingRequirement;
use App\Models\Visitor;
use App\Models\Truck;
use App\Services\WeighingService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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
                return [
                    'id' => $w->id,
                    'plate_number' => $w->plate_number,
                    'weighing_type' => $w->weighing_type,
                    'weight' => $w->weight,
                    'weighed_at' => $w->weighed_at,
                    'weight_diff' => $w->getWeightDifference(),
                    'visitor_id' => $w->visitor_id,
                    'truck_id' => $w->truck_id,
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
     * Записать взвешивание
     */
    public function record(Request $request)
    {
        try {
            $validate = $request->validate([
                'yard_id' => 'required|integer|exists:yards,id',
                'plate_number' => 'required|string|max:50',
                'weighing_type' => 'required|in:entry,exit,intermediate',
                'weight' => 'required|numeric|min:0|max:999999.99',
                'visitor_id' => 'nullable|integer|exists:visitors,id',
                'requirement_id' => 'nullable|integer|exists:weighing_requirements,id',
                'operator_user_id' => 'nullable|integer|exists:users,id',
                'notes' => 'nullable|string|max:1000',
            ]);

            // Пытаемся найти truck по номеру
            $normalizedPlate = strtolower(str_replace(' ', '', $validate['plate_number']));
            $truck = Truck::whereRaw("REPLACE(LOWER(plate_number), ' ', '') = ?", [$normalizedPlate])->first();

            // Если visitor_id не передан, но requirement_id есть - берём из него
            $visitorId = $validate['visitor_id'] ?? null;
            $taskId = null;

            if (!$visitorId && !empty($validate['requirement_id'])) {
                $requirement = WeighingRequirement::find($validate['requirement_id']);
                if ($requirement) {
                    $visitorId = $requirement->visitor_id;
                    $taskId = $requirement->task_id;
                }
            }

            // Если visitor_id есть - берём task_id из него
            if ($visitorId && !$taskId) {
                $visitor = Visitor::find($visitorId);
                $taskId = $visitor?->task_id;
            }

            $weighing = $this->weighingService->recordWeighing(
                yardId: $validate['yard_id'],
                plateNumber: $validate['plate_number'],
                weighingType: $validate['weighing_type'],
                weight: $validate['weight'],
                visitorId: $visitorId,
                truckId: $truck?->id,
                taskId: $taskId,
                requirementId: $validate['requirement_id'] ?? null,
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
