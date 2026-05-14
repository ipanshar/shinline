<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UtilizationRequest;
use Illuminate\Database\Eloquent\Builder;
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
            $this->applyStatusFilter($query, (string) $request->input('status'));
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
            'status' => ['required', 'in:reviewing,approved,rejected'],
        ]);

        $newStatus = (string) $validated['status'];

        $timeline = $item->timeline ?? UtilizationRequest::buildInitialTimeline();
        $statusToTimelineIndex = [
            'reviewing' => 0,
            'approved' => 1,
            'rejected' => 2,
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
            'status' => UtilizationRequest::normalizeWorkflowStatus($item->status),
            'status_label' => UtilizationRequest::labelFor($item->status),
            'photos' => $photos,
            'timeline' => $item->timeline ?? [],
            'source' => $item->source,
            'client_name' => $item->user?->name,
            'created_at' => $item->created_at?->toIso8601String(),
        ];
    }

    private function applyStatusFilter(Builder $query, string $status): void
    {
        match ($status) {
            UtilizationRequest::STATUS_APPROVED => $query->whereIn('status', [
                UtilizationRequest::STATUS_APPROVED,
                UtilizationRequest::STATUS_IN_PROGRESS,
                UtilizationRequest::STATUS_COMPLETED,
            ]),
            UtilizationRequest::STATUS_REJECTED => $query->where('status', UtilizationRequest::STATUS_REJECTED),
            default => $query->whereIn('status', [
                UtilizationRequest::STATUS_NEW,
                UtilizationRequest::STATUS_REVIEWING,
            ]),
        };
    }

    private function normalizePhotoUrl(string $photo): string
    {
        if ($photo === '') {
            return '';
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

        return '/storage/' . ltrim($photo, '/');
    }
}
