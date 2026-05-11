<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SpectechSchedule;
use App\Models\Truck;
use App\Models\TruckCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class SpectechScheduleController extends Controller
{
    /** Кешированный id категории «Спец техника» */
    private static ?int $spectechCatId = null;

    private static function getSpectechCatId(): ?int
    {
        if (self::$spectechCatId === null) {
            $cat = TruckCategory::where('name', 'Спец техника')->first();
            self::$spectechCatId = $cat?->id;
        }
        return self::$spectechCatId;
    }

    /**
     * GET /spectech/api/schedule/equipment-types
     * Список доступных типов спецтехники для бронирования.
     * Группируем по truck_category_id внутри спецтехники.
     */
    public function equipmentTypes(): JsonResponse
    {
        $spectechCatId = self::getSpectechCatId();

        // Получаем все подкатегории (или группы по имени), если нет подкатегорий — просто уникальные имена
        $trucks = Truck::query()
            ->when($spectechCatId, fn($q) => $q->where('truck_category_id', $spectechCatId))
            ->whereNotNull('name')
            ->get(['id', 'name', 'plate_number']);

        // Группируем по первому слову имени (или всему имени без цифр в конце)
        $groups = [];
        foreach ($trucks as $truck) {
            $key = $this->extractEquipmentTypeKey($truck->name ?? '');
            if (!$key) continue;

            if (!isset($groups[$key])) {
                $groups[$key] = [
                    'key'    => $key,
                    'label'  => $key,
                    'trucks' => [],
                ];
            }

            $groups[$key]['trucks'][] = [
                'id'           => $truck->id,
                'name'         => $truck->name,
                'plate_number' => $truck->plate_number,
            ];
        }

        $result = array_values($groups);

        return response()->json([
            'status' => true,
            'data'   => $result,
        ]);
    }

    /**
     * GET /spectech/api/schedule/check-availability
     * Проверить доступность техники определённого типа на период.
     */
    public function checkAvailability(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'equipment_type_key' => 'required|string|max:100',
            'start'              => 'required|date',
            'end'                => 'required|date|after:start',
        ]);

        $typeKey = $validated['equipment_type_key'];
        $start   = $validated['start'];
        $end     = $validated['end'];

        $spectechCatId = self::getSpectechCatId();

        // Находим все грузовики данного типа
        $allTrucks = Truck::query()
            ->when($spectechCatId, fn($q) => $q->where('truck_category_id', $spectechCatId))
            ->get(['id', 'name', 'plate_number'])
            ->filter(fn($t) => $this->extractEquipmentTypeKey($t->name ?? '') === $typeKey)
            ->values();

        if ($allTrucks->isEmpty()) {
            return response()->json([
                'status'  => false,
                'message' => 'Техника данного типа не найдена в справочнике',
            ], 422);
        }

        $available = [];
        $occupied  = [];

        foreach ($allTrucks as $truck) {
            $isBusy = SpectechSchedule::isTruckOccupied($truck->id, $start, $end);

            if ($isBusy) {
                $freeAt = SpectechSchedule::getNextFreeAt($truck->id, $start, $end);

                // Детализация: какие периоды пересекаются
                $conflicts = SpectechSchedule::where('truck_id', $truck->id)
                    ->whereIn('status', SpectechSchedule::ACTIVE_STATUSES)
                    ->where('scheduled_start', '<', $end)
                    ->where('scheduled_end', '>', $start)
                    ->orderBy('scheduled_start')
                    ->get(['id', 'scheduled_start', 'scheduled_end', 'purpose', 'status'])
                    ->map(fn($s) => [
                        'id'              => $s->id,
                        'scheduled_start' => $s->scheduled_start?->format('d.m.Y H:i'),
                        'scheduled_end'   => $s->scheduled_end?->format('d.m.Y H:i'),
                        'purpose'         => $s->purpose,
                        'status_label'    => SpectechSchedule::STATUS_LABELS[$s->status] ?? $s->status,
                    ])
                    ->toArray();

                $occupied[] = [
                    'truck_id'     => $truck->id,
                    'truck_name'   => $truck->name,
                    'plate_number' => $truck->plate_number,
                    'free_at'      => $freeAt,
                    'conflicts'    => $conflicts,
                ];
            } else {
                $available[] = [
                    'truck_id'     => $truck->id,
                    'truck_name'   => $truck->name,
                    'plate_number' => $truck->plate_number,
                ];
            }
        }

        return response()->json([
            'status'        => true,
            'has_available' => count($available) > 0,
            'available'     => $available,
            'occupied'      => $occupied,
            'total_trucks'  => $allTrucks->count(),
        ]);
    }

    /**
     * GET /spectech/api/schedule
     * Список всех записей расписания (для Calendar/Gantt view)
     */
    public function index(Request $request): JsonResponse
    {
        $user  = Auth::user();
        $query = SpectechSchedule::with(['truck', 'user', 'spectechRequest'])
            ->orderBy('scheduled_start', 'desc');

        // Обычный пользователь видит только свои
        if (!$user->isAdmin() && !$user->hasRole('Оператор')) {
            $query->where('user_id', $user->id);
        }

        // Фильтр по периоду для calendar view
        if ($request->filled('from')) {
            $query->where('scheduled_end', '>=', $request->from);
        }
        if ($request->filled('to')) {
            $query->where('scheduled_start', '<=', $request->to);
        }

        // Фильтр по статусу
        if ($request->filled('status') && $request->status !== 'all') {
            $query->where('status', $request->status);
        }

        // Фильтр по типу техники
        if ($request->filled('equipment_type_key')) {
            $query->where('equipment_type_key', $request->equipment_type_key);
        }

        $schedules = $query->get()->map(fn($s) => $this->formatSchedule($s));

        return response()->json([
            'status' => true,
            'data'   => $schedules,
        ]);
    }

    /**
     * POST /spectech/api/schedule
     * Создать запись расписания с автоматическим назначением свободной техники.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'equipment_type_key'   => 'required|string|max:100',
            'equipment_type_label' => 'required|string|max:100',
            'scheduled_start'      => 'required|date',
            'scheduled_end'        => 'required|date|after:scheduled_start',
            'purpose'              => 'required|string|max:500',
            'address'              => 'nullable|string|max:500',
            'notes'                => 'nullable|string|max:2000',
        ]);

        $typeKey      = $validated['equipment_type_key'];
        $start        = $validated['scheduled_start'];
        $end          = $validated['scheduled_end'];

        $spectechCatId = self::getSpectechCatId();

        // Ищем все машины данного типа
        $allTrucks = Truck::query()
            ->when($spectechCatId, fn($q) => $q->where('truck_category_id', $spectechCatId))
            ->get(['id', 'name', 'plate_number'])
            ->filter(fn($t) => $this->extractEquipmentTypeKey($t->name ?? '') === $typeKey)
            ->values();

        if ($allTrucks->isEmpty()) {
            return response()->json([
                'status'  => false,
                'message' => 'Техника данного типа не найдена в справочнике',
            ], 422);
        }

        // Ищем первую свободную
        $assignedTruck = null;
        $conflictInfo  = [];

        foreach ($allTrucks as $truck) {
            $busy = SpectechSchedule::isTruckOccupied($truck->id, $start, $end);

            if (!$busy) {
                $assignedTruck = $truck;
                break;
            }

            // Собираем информацию о занятости для уведомления
            $freeAt    = SpectechSchedule::getNextFreeAt($truck->id, $start, $end);
            $conflicts = SpectechSchedule::where('truck_id', $truck->id)
                ->whereIn('status', SpectechSchedule::ACTIVE_STATUSES)
                ->where('scheduled_start', '<', $end)
                ->where('scheduled_end', '>', $start)
                ->orderBy('scheduled_start')
                ->get(['scheduled_start', 'scheduled_end', 'purpose'])
                ->map(fn($s) => [
                    'from'    => $s->scheduled_start?->format('d.m.Y H:i'),
                    'to'      => $s->scheduled_end?->format('d.m.Y H:i'),
                    'purpose' => $s->purpose,
                ])
                ->toArray();

            $conflictInfo[] = [
                'truck_name'   => $truck->name,
                'plate_number' => $truck->plate_number,
                'free_at'      => $freeAt
                    ? (new \DateTime($freeAt))->format('d.m.Y H:i')
                    : 'неизвестно',
                'conflicts'    => $conflicts,
            ];
        }

        // Если ни одна техника не свободна — возвращаем конфликт (НЕ создаём запись)
        if (!$assignedTruck) {
            return response()->json([
                'status'        => false,
                'conflict'      => true,
                'message'       => 'Все единицы техники заняты на указанный период',
                'conflict_info' => $conflictInfo,
            ], 409);
        }

        // Создаём запись расписания
        $schedule = SpectechSchedule::create([
            'user_id'              => Auth::id(),
            'truck_id'             => $assignedTruck->id,
            'equipment_type_key'   => $typeKey,
            'equipment_type_label' => $validated['equipment_type_label'],
            'assigned_truck_name'  => $assignedTruck->name . ($assignedTruck->plate_number ? " ({$assignedTruck->plate_number})" : ''),
            'scheduled_start'      => $start,
            'scheduled_end'        => $end,
            'purpose'              => $validated['purpose'],
            'address'              => $validated['address'] ?? null,
            'notes'                => $validated['notes'] ?? null,
            'status'               => SpectechSchedule::STATUS_PENDING,
        ]);

        $schedule->load(['truck', 'user', 'spectechRequest']);

        return response()->json([
            'status'  => true,
            'message' => "Запланировано: {$assignedTruck->name}",
            'data'    => $this->formatSchedule($schedule),
        ], 201);
    }

    /**
     * PATCH /spectech/api/schedule/{id}/status
     * Обновить статус записи.
     */
    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $user = Auth::user();
        if (!$user->isAdmin() && !$user->hasRole('Оператор')) {
            return response()->json(['status' => false, 'message' => 'Доступ запрещён'], 403);
        }

        $schedule = SpectechSchedule::findOrFail($id);

        $validated = $request->validate([
            'status' => 'required|in:pending,confirmed,in_progress,done,cancelled',
        ]);

        $schedule->update(['status' => $validated['status']]);

        return response()->json([
            'status'  => true,
            'message' => 'Статус обновлён',
            'data'    => $this->formatSchedule($schedule->fresh(['truck', 'user', 'spectechRequest'])),
        ]);
    }

    /**
     * DELETE /spectech/api/schedule/{id}
     * Отменить (мягкое удаление через статус cancelled).
     */
    public function cancel(int $id): JsonResponse
    {
        $user     = Auth::user();
        $schedule = SpectechSchedule::findOrFail($id);

        // Только создатель или оператор/админ
        if ($schedule->user_id !== $user->id && !$user->isAdmin() && !$user->hasRole('Оператор')) {
            return response()->json(['status' => false, 'message' => 'Доступ запрещён'], 403);
        }

        $schedule->update(['status' => SpectechSchedule::STATUS_CANCELLED]);

        return response()->json(['status' => true, 'message' => 'Запись отменена']);
    }

    // ─── helpers ──────────────────────────────────────────────────────────────

    private function formatSchedule(SpectechSchedule $s): array
    {
        return [
            'id'                  => $s->id,
            'user_id'             => $s->user_id,
            'client_name'         => $s->user?->name,
            'truck_id'            => $s->truck_id,
            'truck_name'          => $s->truck?->name,
            'plate_number'        => $s->truck?->plate_number,
            'equipment_type_key'  => $s->equipment_type_key,
            'equipment_type_label'=> $s->equipment_type_label,
            'assigned_truck_name' => $s->assigned_truck_name,
            'scheduled_start'     => $s->scheduled_start?->toIso8601String(),
            'scheduled_end'       => $s->scheduled_end?->toIso8601String(),
            'purpose'             => $s->purpose,
            'address'             => $s->address,
            'notes'               => $s->notes,
            'status'              => $s->status,
            'status_label'        => SpectechSchedule::STATUS_LABELS[$s->status] ?? $s->status,
            'has_request'         => (bool) $s->spectechRequest,
            'request_id'          => $s->spectechRequest?->id,
            'created_at'          => $s->created_at?->toIso8601String(),
        ];
    }

    /**
     * Извлечь ключ типа из имени (убрать цифры и знаки в конце)
     * "Камаз 1" → "Камаз"
     * "Автокран 25т №2" → "Автокран 25т"
     */
    private function extractEquipmentTypeKey(string $name): string
    {
        // Убираем порядковый номер в конце: " 1", " 2", " №1", " №2"
        $cleaned = preg_replace('/[\s]+[№#]?\d+\s*$/', '', trim($name));
        return trim($cleaned ?: $name);
    }
}

