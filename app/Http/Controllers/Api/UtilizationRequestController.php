<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UtilizationRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class UtilizationRequestController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = Auth::user();

        $query = UtilizationRequest::query()
            ->with(['truck:id,name,plate_number', 'user:id,name'])
            ->orderByDesc('created_at');

        if (!$user->isAdmin() && !$user->hasRole('Оператор')) {
            $query->where('user_id', $user->id);
        }

        if ($request->filled('status')) {
            $query->where('status', (string) $request->input('status'));
        }

        if ($request->filled('source')) {
            $query->where('source', (string) $request->input('source'));
        }

        $items = $query->get()->map(fn (UtilizationRequest $item) => $this->formatItem($item))->values();

        return response()->json([
            'status' => true,
            'data' => $items,
        ]);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $item = UtilizationRequest::query()->findOrFail($id);

        $validated = $request->validate([
            'status' => ['required', 'in:new,reviewing,approved,in_progress,completed,rejected'],
        ]);

        $newStatus = (string) $validated['status'];

        $timeline = $item->timeline ?? UtilizationRequest::buildInitialTimeline();
        $statusToTimelineIndex = [
            'new' => 0,
            'reviewing' => 1,
            'approved' => 2,
            'in_progress' => 3,
            'completed' => 4,
        ];

        if (isset($statusToTimelineIndex[$newStatus])) {
            $index = $statusToTimelineIndex[$newStatus];
            if (isset($timeline[$index]) && ($timeline[$index]['time'] ?? null) === null) {
                $timeline[$index]['time'] = now()->toIso8601String();
            }
        }

        $item->update([
            'status' => $newStatus,
            'timeline' => $timeline,
        ]);

        return response()->json([
            'status' => true,
            'data' => $this->formatItem($item->fresh(['truck:id,name,plate_number', 'user:id,name'])),
        ]);
    }

    private function formatItem(UtilizationRequest $item): array
    {
        $photos = array_values(array_filter(array_map(
            fn ($photo) => $this->normalizePhotoUrl(is_string($photo) ? $photo : ''),
            $item->photos ?? []
        )));

        $plateNumber = $item->truck?->plate_number ?: (is_array($item->meta) ? ($item->meta['plate_number'] ?? null) : null);

        return [
            'id' => $item->id,
            'truck_id' => $item->truck_id,
            'equipment_name' => $item->truck
                ? ($item->truck->name ?: ($item->truck->plate_number ? 'ТС ' . $item->truck->plate_number : 'ТС #' . $item->truck_id))
                : ($plateNumber ?: '—'),
            'plate_number' => $plateNumber,
            'driver_name' => $item->driver_name,
            'start_date' => $item->requested_start?->toDateString(),
            'end_date' => null,
            'requested_start' => $item->requested_start?->toIso8601String(),
            'requested_end' => null,
            'terminal' => null,
            'zone' => null,
            'gate' => null,
            'address' => null,
            'comment' => $item->comment,
            'status' => $item->status,
            'status_label' => UtilizationRequest::STATUS_LABELS[$item->status] ?? $item->status,
            'photos' => $photos,
            'timeline' => $item->timeline ?? [],
            'source' => $item->source,
            'client_name' => $item->user?->name,
            'created_at' => $item->created_at?->toIso8601String(),
        ];
    }

    private function normalizePhotoUrl(string $photo): string
    {
        if ($photo === '') {
            return '';
        }

        if (str_starts_with($photo, 'http://') || str_starts_with($photo, 'https://')) {
            return $photo;
        }

        if (str_starts_with($photo, '/storage/')) {
            return url($photo);
        }

        return Storage::disk('public')->url(ltrim($photo, '/'));
    }
}
