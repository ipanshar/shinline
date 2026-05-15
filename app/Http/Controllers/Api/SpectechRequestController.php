<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SpectechRequest;
use App\Models\SpectechSchedule;
use App\Models\Truck;
use App\Models\TruckCategory;
use App\Services\SpectechAvailabilityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class SpectechRequestController extends Controller
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

    // ─── Справочник спецтехники ────────────────────────────────────────────

    /** GET /spectech/api/trucks — список всей спецтехники */
    public function trucksList(Request $request): JsonResponse
    {
        $catId = self::getSpectechCatId();

        $query = Truck::query();
        if ($catId) {
            $query->where('truck_category_id', $catId);
        }

        if ($request->filled('search')) {
            $s = $request->input('search');
            $query->where(function ($q) use ($s) {
                $q->where('name', 'like', "%$s%")
                  ->orWhere('plate_number', 'like', "%$s%");
            });
        }

        $trucks = $query
            ->orderBy('created_at', 'desc')
            ->get([
                'id', 'name', 'plate_number', 'own', 'description',
                'functionality',
                'image_url', 'anpr_source', 'last_seen_at',
                'last_seen_gate', 'anpr_confidence', 'plate_score',
            ]);

        return response()->json([
            'status' => true,
            'data'   => $trucks,
        ]);
    }

    /** POST /spectech/api/trucks — создать запись спецтехники */
    public function truckCreate(Request $request): JsonResponse
    {
        $catId = self::getSpectechCatId();

        $validated = $request->validate([
            'name'         => 'required|string|max:255',
            'plate_number' => 'nullable|string|max:20',
            'own'          => 'nullable|string|in:собственный,аренда',
            'description'  => 'nullable|string',
            'functionality'=> 'nullable|string',
            'image_url'    => 'nullable|string|max:500',
        ]);

        $truck = Truck::create(array_merge($validated, [
            'truck_category_id' => $catId,
        ]));

        return response()->json([
            'status'  => true,
            'message' => 'Техника добавлена',
            'data'    => $truck,
        ], 201);
    }

    /** PUT /spectech/api/trucks/{id} — обновить запись */
    public function truckUpdate(Request $request, int $id): JsonResponse
    {
        $truck = Truck::findOrFail($id);

        $validated = $request->validate([
            'name'         => 'required|string|max:255',
            'plate_number' => 'nullable|string|max:20',
            'own'          => 'nullable|string|in:собственный,аренда',
            'description'  => 'nullable|string',
            'functionality'=> 'nullable|string',
            'image_url'    => 'nullable|string|max:500',
        ]);

        $truck->update($validated);

        return response()->json([
            'status'  => true,
            'message' => 'Техника обновлена',
            'data'    => $truck->fresh(),
        ]);
    }

    /** DELETE /spectech/api/trucks/{id} — удалить запись */
    public function truckDelete(int $id): JsonResponse
    {
        $truck = Truck::findOrFail($id);
        $truck->delete();

        return response()->json([
            'status'  => true,
            'message' => 'Техника удалена',
        ]);
    }

    // ─── Заявки ──────────────────────────────────────────────────────────

    /**
     * Получить список заявок.
     * Оператор видит все, клиент — только свои.
     */
    public function index(Request $request): JsonResponse
    {
        $user = Auth::user();

        $query = SpectechRequest::with(['truck', 'user.telegramApprovedChat'])
            ->orderBy('created_at', 'desc');

        // Пользователь без прав управления видит только свои заявки
        if (! $this->canManageSpectechRequests()) {
            $query->where('user_id', $user->id);
        }

        // Фильтр по статусу
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $requests = $query->get()->map(fn($r) => $this->formatRequest($r));

        return response()->json([
            'status' => true,
            'data'   => $requests,
        ]);
    }

    /**
     * Создать новую заявку с проверкой доступности техники
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'truck_id'    => 'required|exists:trucks,id',
            'start_date'  => 'nullable|date',
            'end_date'    => 'required_without:requested_end|nullable|date|after_or_equal:today',
            'requested_start' => 'nullable|date',
            'requested_end'   => 'required_with:requested_start|nullable|date|after:requested_start',
            'terminal'    => 'required|string|max:50',
            'zone'        => 'required|string|max:100',
            'gate'        => 'nullable|string|max:50',
            'address'     => 'required|string|max:500',
            'comment'     => 'nullable|string|max:2000',
            'photos'      => 'nullable|array|max:3',
            'photos.*'    => 'nullable|string',
            'check_availability' => 'nullable|boolean', // проверить доступность перед созданием
        ]);

        $photoPaths = $this->preparePhotoPaths($validated['photos'] ?? []);
        [$startDate, $endDate] = $this->resolveRequestedWindow($validated);

        // Проверяем доступность техники, если запрашивается
        $availabilityService = new SpectechAvailabilityService();
        if ($validated['check_availability'] ?? false) {
            $isAvailable = $availabilityService->isTruckAvailable(
                $validated['truck_id'],
                $startDate->toIso8601String(),
                $endDate->toIso8601String()
            );

            if (!$isAvailable) {
                // Ищем свободный аналог
                $freeTruck = $availabilityService->findFreeAlternativeTruck(
                    $validated['truck_id'],
                    $startDate->toIso8601String(),
                    $endDate->toIso8601String()
                );

                // Собираем информацию о конфликтах
                $conflictInfo = $availabilityService->getTypeConflictInfo(
                    $validated['truck_id'],
                    $startDate->toIso8601String(),
                    $endDate->toIso8601String()
                );

                return response()->json([
                    'status'        => false,
                    'conflict'      => true,
                    'message'       => 'Выбранная техника занята на указанный период',
                    'free_alternative' => $freeTruck ? [
                        'id'            => $freeTruck->id,
                        'name'          => $freeTruck->name,
                        'plate_number'  => $freeTruck->plate_number,
                        'message'       => "Предложена свободная техника: {$freeTruck->name}",
                    ] : null,
                    'conflict_info' => $conflictInfo,
                ], 409);
            }
        }

        $truck = Truck::findOrFail($validated['truck_id']);
        $typeKey = $this->extractEquipmentTypeKey($truck->name ?? '');

        $spectechRequest = DB::transaction(function () use ($validated, $photoPaths, $startDate, $endDate, $truck, $typeKey) {
            $schedule = SpectechSchedule::create([
                'user_id'              => Auth::id(),
                'truck_id'             => $truck->id,
                'equipment_type_key'   => $typeKey ?: ($truck->name ?? 'Спецтехника'),
                'equipment_type_label' => $typeKey ?: ($truck->name ?? 'Спецтехника'),
                'assigned_truck_name'  => $truck->name . ($truck->plate_number ? " ({$truck->plate_number})" : ''),
                'scheduled_start'      => $startDate,
                'scheduled_end'        => $endDate,
                'purpose'              => $validated['comment'] ?: 'Заявка на спецтехнику',
                'address'              => $validated['address'],
                'notes'                => $validated['comment'] ?? null,
                'status'               => SpectechSchedule::STATUS_PENDING,
            ]);

            return SpectechRequest::create([
                'user_id'         => Auth::id(),
                'truck_id'        => $validated['truck_id'],
                'start_date'      => $startDate->toDateString(),
                'end_date'        => $endDate->toDateString(),
                'terminal'        => trim((string) $validated['terminal']),
                'zone'            => trim((string) $validated['zone']),
                'gate'            => isset($validated['gate']) && trim((string) $validated['gate']) !== '' ? trim((string) $validated['gate']) : null,
                'address'         => trim((string) $validated['address']),
                'comment'         => isset($validated['comment']) && trim((string) $validated['comment']) !== '' ? trim((string) $validated['comment']) : null,
                'status'          => SpectechRequest::STATUS_NEW,
                'photos'          => $photoPaths,
                'timeline'        => SpectechRequest::buildInitialTimeline(),
                'schedule_id'     => $schedule->id,
                'requested_start' => $startDate,
                'requested_end'   => $endDate,
                'from_scheduling' => false,
            ]);
        });

        $spectechRequest->load(['truck', 'user']);

        return response()->json([
            'status'  => true,
            'message' => 'Заявка создана',
            'data'    => $this->formatRequest($spectechRequest),
        ], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $spectechRequest = SpectechRequest::query()
            ->with(['truck', 'user', 'schedule'])
            ->findOrFail($id);

        if ($spectechRequest->user_id !== Auth::id() && ! $this->canManageSpectechRequests()) {
            return response()->json(['status' => false, 'message' => 'Доступ запрещён'], 403);
        }

        $validated = $request->validate([
            'truck_id'        => 'required|exists:trucks,id',
            'driver_name'     => 'nullable|string|max:160',
            'driver_phone'    => 'nullable|string|max:20',
            'start_date'      => 'nullable|date',
            'end_date'        => 'required_without:requested_end|nullable|date',
            'requested_start' => 'nullable|date',
            'requested_end'   => 'required_with:requested_start|nullable|date|after:requested_start',
            'terminal'        => 'required|string|max:50',
            'zone'            => 'required|string|max:100',
            'gate'            => 'nullable|string|max:50',
            'address'         => 'required|string|max:500',
            'comment'         => 'nullable|string|max:2000',
            'photos'          => 'nullable|array|max:3',
            'photos.*'        => 'nullable|string',
            'check_availability' => 'nullable|boolean',
        ]);

        [$startDate, $endDate] = $this->resolveRequestedWindow($validated);
        $availabilityService = new SpectechAvailabilityService();

        if ($validated['check_availability'] ?? false) {
            $excludeScheduleId = $spectechRequest->schedule_id;
            $isAvailable = $availabilityService->isTruckAvailable(
                (int) $validated['truck_id'],
                $startDate->toIso8601String(),
                $endDate->toIso8601String(),
                $excludeScheduleId,
            );

            if (! $isAvailable) {
                $freeTruck = $availabilityService->findFreeAlternativeTruck(
                    (int) $validated['truck_id'],
                    $startDate->toIso8601String(),
                    $endDate->toIso8601String(),
                    $excludeScheduleId,
                );

                $conflictInfo = $availabilityService->getTypeConflictInfo(
                    (int) $validated['truck_id'],
                    $startDate->toIso8601String(),
                    $endDate->toIso8601String(),
                    $excludeScheduleId,
                );

                return response()->json([
                    'status'        => false,
                    'conflict'      => true,
                    'message'       => 'Выбранная техника занята на указанный период',
                    'free_alternative' => $freeTruck ? [
                        'id'           => $freeTruck->id,
                        'name'         => $freeTruck->name,
                        'plate_number' => $freeTruck->plate_number,
                        'message'      => "Предложена свободная техника: {$freeTruck->name}",
                    ] : null,
                    'conflict_info' => $conflictInfo,
                ], 409);
            }
        }

        $truck = Truck::findOrFail((int) $validated['truck_id']);
        $photoPaths = array_key_exists('photos', $validated)
            ? $this->preparePhotoPaths($validated['photos'] ?? [])
            : ($spectechRequest->photos ?? []);

        DB::transaction(function () use ($spectechRequest, $validated, $truck, $startDate, $endDate, $photoPaths) {
            $scheduleId = $this->syncScheduleForRequest($spectechRequest, $truck, $startDate, $endDate, $validated);

            $spectechRequest->update([
                'truck_id'        => $truck->id,
                'driver_name'     => isset($validated['driver_name']) ? trim((string) $validated['driver_name']) : null,
                'driver_phone'    => isset($validated['driver_phone']) ? trim((string) $validated['driver_phone']) : null,
                'start_date'      => $startDate->toDateString(),
                'end_date'        => $endDate->toDateString(),
                'requested_start' => $startDate,
                'requested_end'   => $endDate,
                'terminal'        => trim((string) $validated['terminal']),
                'zone'            => trim((string) $validated['zone']),
                'gate'            => isset($validated['gate']) && trim((string) $validated['gate']) !== '' ? trim((string) $validated['gate']) : null,
                'address'         => trim((string) $validated['address']),
                'comment'         => isset($validated['comment']) && trim((string) $validated['comment']) !== '' ? trim((string) $validated['comment']) : null,
                'photos'          => $photoPaths,
                'schedule_id'     => $scheduleId,
            ]);
        });

        $spectechRequest->load(['truck', 'user', 'schedule']);

        return response()->json([
            'status'  => true,
            'message' => 'Заявка обновлена',
            'data'    => $this->formatRequest($spectechRequest),
        ]);
    }

    /**
     * Отмена заявки с указанием причины
     * PATCH /spectech/api/requests/{id}/cancel
     */
    public function cancel(Request $request, int $id): JsonResponse
    {
        $spectechRequest = SpectechRequest::findOrFail($id);
        $user = Auth::user();
        $isOperator = $this->canManageSpectechRequests();

        if ($spectechRequest->user_id !== $user->id && ! $isOperator) {
            return response()->json(['status' => false, 'message' => 'Доступ запрещён'], 403);
        }

        if ($spectechRequest->status === SpectechRequest::STATUS_CANCELLED) {
            return response()->json(['status' => false, 'message' => 'Заявка уже отменена'], 409);
        }

        if (in_array($spectechRequest->status, [SpectechRequest::STATUS_COMPLETED, SpectechRequest::STATUS_RETURNED])) {
            return response()->json(['status' => false, 'message' => 'Нельзя отменить завершённую заявку'], 409);
        }

        $validated = $request->validate([
            'reason' => 'required|string|max:1000',
        ]);

        $hasCancellationColumns = Schema::hasColumns('spectech_requests', ['cancellation_reason', 'cancelled_by']);

        DB::transaction(function () use ($spectechRequest, $validated, $isOperator, $hasCancellationColumns) {
            $payload = [
                'status' => SpectechRequest::STATUS_CANCELLED,
            ];

            if ($hasCancellationColumns) {
                $payload['cancellation_reason'] = trim($validated['reason']);
                $payload['cancelled_by'] = $isOperator ? SpectechRequest::CANCELLED_BY_OPERATOR : SpectechRequest::CANCELLED_BY_CUSTOMER;
            }

            $spectechRequest->update($payload);

            $spectechRequest->syncScheduleStatus();
        });

        $spectechRequest->load(['truck', 'user']);

        return response()->json([
            'status'  => true,
            'message' => $hasCancellationColumns
                ? 'Заявка отменена'
                : 'Заявка отменена. Причина отмены не сохранена: на сервере ещё не обновлена схема БД.',
            'data'    => $this->formatRequest($spectechRequest),
        ]);
    }

    /**
     * Обновить статус заявки (только оператор/администратор)
     */
    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $user = Auth::user();

        if (! $this->canManageSpectechRequests()) {
            return response()->json(['status' => false, 'message' => 'Доступ запрещён'], 403);
        }

        $spectechRequest = SpectechRequest::findOrFail($id);

        $validated = $request->validate([
            'status' => 'required|in:new,departure,on_location,work_started,completed,returned',
        ]);

        $newStatus = $validated['status'];

        if ($spectechRequest->isStatusFrozen() && $newStatus !== SpectechRequest::STATUS_RETURNED) {
            return response()->json([
                'status' => false,
                'message' => 'Для просроченной заявки доступен только статус "Возврат"',
            ], 409);
        }

        // Обновляем timeline
        $timeline = $spectechRequest->timeline ?? SpectechRequest::buildInitialTimeline();
        $statusToTimelineIndex = [
            'new'          => 0,
            'departure'    => 1,
            'on_location'  => 2,
            'work_started' => 3,
            'completed'    => 4,
            'returned'     => 5,
        ];

        if (isset($statusToTimelineIndex[$newStatus])) {
            $idx = $statusToTimelineIndex[$newStatus];
            if (isset($timeline[$idx]) && $timeline[$idx]['time'] === null) {
                $timeline[$idx]['time'] = now()->toIso8601String();
            }
        }

        $spectechRequest->update([
            'status'   => $newStatus,
            'timeline' => $timeline,
        ]);

        $spectechRequest->syncScheduleStatus();

        $spectechRequest->load(['truck', 'user']);

        return response()->json([
            'status'  => true,
            'message' => 'Статус обновлён',
            'data'    => $this->formatRequest($spectechRequest),
        ]);
    }

    /**
     * Сохранить base64-фото как файл
     */
    private function saveBase64Photo(string $dataUrl): ?string
    {
        try {
            // data:image/jpeg;base64,/9j/4AAQ...
            $parts = explode(',', $dataUrl, 2);
            if (count($parts) !== 2) return null;

            $meta = $parts[0]; // data:image/jpeg;base64
            $data = base64_decode($parts[1]);

            // Определяем расширение
            preg_match('/image\/(\w+)/', $meta, $matches);
            $ext  = isset($matches[1]) ? $matches[1] : 'jpg';
            $ext  = $ext === 'jpeg' ? 'jpg' : $ext;

            $filename = 'spectech/' . uniqid('photo_', true) . '.' . $ext;
            Storage::disk('public')->put($filename, $data);

            return Storage::disk('public')->url($filename);
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Форматировать заявку для ответа
     */
    private function formatRequest(SpectechRequest $r): array
    {
        $photos = array_values(array_filter(array_map(
            fn ($photo) => $this->normalizePhotoUrl(is_string($photo) ? $photo : ''),
            $r->photos ?? []
        )));

        return [
            'id'             => $r->id,
            'equipment_id'   => $r->truck_id,
            'equipment_name' => $r->truck
                ? ($r->truck->name ?: ($r->truck->plate_number ? 'ТС ' . $r->truck->plate_number : 'ТС #' . $r->truck_id))
                : '—',
            'plate_number'   => $r->truck?->plate_number,
            'driver_name'    => $r->driver_name,
            'driver_phone'   => $r->driver_phone,
            'start_date'     => $r->start_date?->toDateString(),
            'end_date'       => $r->end_date?->toDateString(),
            'requested_start'=> $r->requested_start?->toIso8601String(),
            'requested_end'  => $r->requested_end?->toIso8601String(),
            'terminal'       => $r->terminal,
            'zone'           => $r->zone,
            'gate'           => $r->gate,
            'address'        => $r->address,
            'comment'        => $r->comment,
            'status'              => $r->status,
            'status_label'        => SpectechRequest::STATUS_LABELS[$r->status] ?? $r->status,
            'status_frozen'       => $r->isStatusFrozen(),
            'status_frozen_reason'=> $r->getStatusFreezeReason(),
            'photos'              => $photos,
            'timeline'            => $r->timeline ?? [],
            'client_name'         => $r->user?->name,
            'is_telegram_miniapp' => (bool) ($r->user?->telegramApprovedChat),
            'source_label'   => $r->user?->telegramApprovedChat ? 'Telegram Mini App' : 'Веб-кабинет',
            'schedule_id'    => $r->schedule_id,
            'from_scheduling'=> (bool) $r->from_scheduling,
            'conflict_info'  => $r->conflict_info ?? [],
            'cancellation_reason' => $r->cancellation_reason,
            'cancelled_by'        => $r->cancelled_by,
            'created_at'     => $r->created_at?->toIso8601String(),
        ];
    }

    /**
     * POST /spectech/api/requests/from-schedule
     * Создать заявку напрямую из планирования (расписания)
     */
    public function createFromSchedule(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'schedule_id'   => 'required|exists:spectech_schedules,id',
            'driver_name'   => 'nullable|string|max:160',
            'driver_phone'  => 'nullable|string|max:20',
            'terminal'      => 'required|string|max:10',
            'zone'          => 'required|string|max:100',
            'gate'          => 'nullable|string|max:50',
            'address'       => 'required|string|max:500',
            'comment'       => 'nullable|string|max:2000',
            'photos'        => 'nullable|array|max:3',
            'photos.*'      => 'nullable|string',
        ]);

        // Получаем расписание
        $schedule = SpectechSchedule::findOrFail($validated['schedule_id']);

        if ($schedule->user_id !== Auth::id() && ! $this->canManageSpectechRequests()) {
            return response()->json(['status' => false, 'message' => 'Доступ запрещён'], 403);
        }

        if (SpectechRequest::where('schedule_id', $schedule->id)->exists()) {
            return response()->json([
                'status' => false,
                'message' => 'Для этого планирования заявка уже создана',
            ], 409);
        }

        // Сохраняем фотографии
        $photoPaths = [];
        if (!empty($validated['photos'])) {
            foreach ($validated['photos'] as $photoData) {
                if ($photoData && str_starts_with($photoData, 'data:image')) {
                    $path = $this->saveBase64Photo($photoData);
                    if ($path) $photoPaths[] = $path;
                }
            }
        }

        // Создаём заявку
        $spectechRequest = SpectechRequest::create([
            'user_id'         => $schedule->user_id,
            'truck_id'        => $schedule->truck_id,
            'driver_name'     => isset($validated['driver_name']) ? trim((string) $validated['driver_name']) : null,
            'driver_phone'    => isset($validated['driver_phone']) ? trim((string) $validated['driver_phone']) : null,
            'start_date'      => $schedule->scheduled_start->toDateString(),
            'end_date'        => $schedule->scheduled_end->toDateString(),
            'terminal'        => $validated['terminal'],
            'zone'            => $validated['zone'],
            'gate'            => $validated['gate'] ?? null,
            'address'         => $validated['address'],
            'comment'         => $validated['comment'] ?? null,
            'status'          => SpectechRequest::STATUS_NEW,
            'photos'          => $photoPaths,
            'timeline'        => SpectechRequest::buildInitialTimeline(),
            'schedule_id'     => $schedule->id,
            'requested_start' => $schedule->scheduled_start,
            'requested_end'   => $schedule->scheduled_end,
            'from_scheduling' => true,
        ]);

        $spectechRequest->load(['truck', 'user', 'schedule']);

        return response()->json([
            'status'  => true,
            'message' => 'Заявка создана из планирования',
            'data'    => $this->formatRequest($spectechRequest),
        ], 201);
    }

    /**
     * GET /spectech/api/requests/check-availability
     * Проверить доступность техники для заявки
     */
    public function checkAvailability(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'truck_id' => 'required|exists:trucks,id',
            'end_date' => 'required_without:requested_end|nullable|date|after_or_equal:today',
            'requested_start' => 'nullable|date',
            'requested_end'   => 'nullable|date',
            'exclude_schedule_id' => 'nullable|integer|exists:spectech_schedules,id',
        ]);

        $truckId = $validated['truck_id'];
        $startDate = !empty($validated['requested_start'])
            ? \Carbon\Carbon::parse($validated['requested_start'])
            : now();
        $endDate = !empty($validated['requested_end'])
            ? \Carbon\Carbon::parse($validated['requested_end'])
            : \Carbon\Carbon::parse($validated['end_date'])->endOfDay();

        $availabilityService = new SpectechAvailabilityService();
        $excludeScheduleId = isset($validated['exclude_schedule_id']) ? (int) $validated['exclude_schedule_id'] : null;

        $isAvailable = $availabilityService->isTruckAvailable(
            $truckId,
            $startDate->toIso8601String(),
            $endDate->toIso8601String(),
            $excludeScheduleId,
        );

        if ($isAvailable) {
            return response()->json([
                'status'       => true,
                'available'    => true,
                'message'      => 'Техника доступна',
            ]);
        }

        // Ищем свободный аналог
        $freeTruck = $availabilityService->findFreeAlternativeTruck(
            $truckId,
            $startDate->toIso8601String(),
            $endDate->toIso8601String(),
            $excludeScheduleId,
        );

        // Собираем информацию о конфликтах
        $conflictInfo = $availabilityService->getTypeConflictInfo(
            $truckId,
            $startDate->toIso8601String(),
            $endDate->toIso8601String(),
            $excludeScheduleId,
        );

        return response()->json([
            'status'        => true,
            'available'     => false,
            'message'       => 'Техника занята на указанный период',
            'free_alternative' => $freeTruck ? [
                'id'            => $freeTruck->id,
                'name'          => $freeTruck->name,
                'plate_number'  => $freeTruck->plate_number,
            ] : null,
            'conflict_info' => $conflictInfo,
        ]);
    }

    private function extractEquipmentTypeKey(string $name): string
    {
        $cleaned = preg_replace('/[\s]+[№#]?\d+\s*$/', '', trim($name));
        return trim($cleaned ?: $name);
    }

    private function resolveRequestedWindow(array $validated): array
    {
        if (!empty($validated['requested_start']) && !empty($validated['requested_end'])) {
            return [
                Carbon::parse($validated['requested_start']),
                Carbon::parse($validated['requested_end']),
            ];
        }

        $startDate = !empty($validated['start_date'])
            ? Carbon::parse($validated['start_date'])->startOfDay()
            : now();
        $endDate = Carbon::parse($validated['end_date'])->endOfDay();

        return [$startDate, $endDate];
    }

    private function preparePhotoPaths(array $photos): array
    {
        $prepared = [];

        foreach ($photos as $photo) {
            if (! is_string($photo) || trim($photo) === '') {
                continue;
            }

            $photo = trim($photo);

            if (str_starts_with($photo, 'data:image')) {
                $saved = $this->saveBase64Photo($photo);
                if ($saved !== null) {
                    $prepared[] = $saved;
                }

                continue;
            }

            $normalized = $this->normalizePhotoUrl($photo);
            if ($normalized !== null) {
                $prepared[] = $normalized;
            }
        }

        return array_values(array_unique($prepared));
    }

    private function syncScheduleForRequest(
        SpectechRequest $spectechRequest,
        Truck $truck,
        Carbon $startDate,
        Carbon $endDate,
        array $validated,
    ): int {
        $typeKey = $this->extractEquipmentTypeKey($truck->name ?? '');
        $scheduleData = [
            'user_id'              => $spectechRequest->user_id,
            'truck_id'             => $truck->id,
            'equipment_type_key'   => $typeKey ?: ($truck->name ?? 'Спецтехника'),
            'equipment_type_label' => $typeKey ?: ($truck->name ?? 'Спецтехника'),
            'assigned_truck_name'  => $truck->name . ($truck->plate_number ? " ({$truck->plate_number})" : ''),
            'scheduled_start'      => $startDate,
            'scheduled_end'        => $endDate,
            'purpose'              => isset($validated['comment']) && trim((string) $validated['comment']) !== ''
                ? trim((string) $validated['comment'])
                : 'Заявка на спецтехнику',
            'address'              => trim((string) $validated['address']),
            'notes'                => isset($validated['comment']) && trim((string) $validated['comment']) !== ''
                ? trim((string) $validated['comment'])
                : null,
        ];

        if ($spectechRequest->schedule) {
            $spectechRequest->schedule->update($scheduleData);

            return $spectechRequest->schedule->id;
        }

        $schedule = SpectechSchedule::create(array_merge($scheduleData, [
            'status' => SpectechSchedule::STATUS_PENDING,
        ]));

        return $schedule->id;
    }

    private function canManageSpectechRequests(): bool
    {
        $user = Auth::user();

        return $user?->canManageSpectech() ?? false;
    }


    /**
     * Нормализует путь/URL фото к браузерно-доступному виду.
     */
    private function normalizePhotoUrl(string $photo): ?string
    {
        $photo = trim($photo);
        if ($photo === '') {
            return null;
        }

        if (str_starts_with($photo, 'data:image') || str_starts_with($photo, '/storage/')) {
            return $photo;
        }

        if (str_starts_with($photo, 'storage/')) {
            return '/' . $photo;
        }

        if (str_starts_with($photo, 'http://') || str_starts_with($photo, 'https://')) {
            $path = parse_url($photo, PHP_URL_PATH);

            if (is_string($path) && $path !== '') {
                $storageOffset = strpos($path, '/storage/');
                if ($storageOffset !== false) {
                    return substr($path, $storageOffset);
                }
            }

            return $photo;
        }

        $normalized = ltrim($photo, '/');

        return '/storage/' . $normalized;
    }
}
