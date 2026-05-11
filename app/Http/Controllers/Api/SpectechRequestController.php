<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SpectechRequest;
use App\Models\Truck;
use App\Models\TruckCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
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

        $query = SpectechRequest::with(['truck', 'user'])
            ->orderBy('created_at', 'desc');

        // Если не оператор/администратор — только свои заявки
        if (!$user->isAdmin() && !$user->hasRole('Оператор')) {
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
     * Создать новую заявку
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'truck_id'   => 'required|exists:trucks,id',
            'end_date'   => 'required|date|after_or_equal:today',
            'terminal'   => 'required|string|max:10',
            'zone'       => 'required|string|max:100',
            'gate'       => 'nullable|string|max:50',
            'address'    => 'required|string|max:500',
            'comment'    => 'nullable|string|max:2000',
            'photos'     => 'nullable|array|max:3',
            'photos.*'   => 'nullable|string', // base64 data URL или путь
        ]);

        // Сохраняем фотографии из base64
        $photoPaths = [];
        if (!empty($validated['photos'])) {
            foreach ($validated['photos'] as $photoData) {
                if ($photoData && str_starts_with($photoData, 'data:image')) {
                    $path = $this->saveBase64Photo($photoData);
                    if ($path) $photoPaths[] = $path;
                }
            }
        }

        $spectechRequest = SpectechRequest::create([
            'user_id'    => Auth::id(),
            'truck_id'   => $validated['truck_id'],
            'start_date' => now()->toDateString(),
            'end_date'   => $validated['end_date'],
            'terminal'   => $validated['terminal'],
            'zone'       => $validated['zone'],
            'gate'       => $validated['gate'] ?? null,
            'address'    => $validated['address'],
            'comment'    => $validated['comment'] ?? null,
            'status'     => SpectechRequest::STATUS_NEW,
            'photos'     => $photoPaths,
            'timeline'   => SpectechRequest::buildInitialTimeline(),
        ]);

        $spectechRequest->load(['truck', 'user']);

        return response()->json([
            'status'  => true,
            'message' => 'Заявка создана',
            'data'    => $this->formatRequest($spectechRequest),
        ], 201);
    }

    /**
     * Обновить статус заявки (только оператор/администратор)
     */
    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $user = Auth::user();

        if (!$user->isAdmin() && !$user->hasRole('Оператор')) {
            return response()->json(['status' => false, 'message' => 'Доступ запрещён'], 403);
        }

        $spectechRequest = SpectechRequest::findOrFail($id);

        $validated = $request->validate([
            'status' => 'required|in:new,departure,on_location,work_started,completed,returned',
        ]);

        $newStatus = $validated['status'];

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
            'start_date'     => $r->start_date?->toDateString(),
            'end_date'       => $r->end_date?->toDateString(),
            'terminal'       => $r->terminal,
            'zone'           => $r->zone,
            'gate'           => $r->gate,
            'address'        => $r->address,
            'comment'        => $r->comment,
            'status'         => $r->status,
            'status_label'   => SpectechRequest::STATUS_LABELS[$r->status] ?? $r->status,
            'photos'         => $photos,
            'timeline'       => $r->timeline ?? [],
            'client_name'    => $r->user?->name,
            'created_at'     => $r->created_at?->toIso8601String(),
        ];
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

        if (
            str_starts_with($photo, 'http://') ||
            str_starts_with($photo, 'https://') ||
            str_starts_with($photo, 'data:image') ||
            str_starts_with($photo, '/storage/')
        ) {
            return $photo;
        }

        if (str_starts_with($photo, 'storage/')) {
            return '/' . $photo;
        }

        $normalized = ltrim($photo, '/');
        if (str_starts_with($normalized, 'spectech/')) {
            return Storage::disk('public')->url($normalized);
        }

        return Storage::disk('public')->url($normalized);
    }
}


