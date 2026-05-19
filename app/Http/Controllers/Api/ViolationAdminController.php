<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ViolationCategory;
use App\Models\ViolationIncident;
use App\Models\ViolationType;
use App\Services\Violations\ViolationIncidentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ViolationAdminController extends Controller
{
    public function incidents(Request $request): JsonResponse
    {
        $query = ViolationIncident::query()
            ->with([
                'reporter:id,name',
                'reviewer:id,name',
                'evidences:id,incident_id,media_role,media_kind,path,is_primary,sort_order',
            ])
            ->orderByDesc('occurred_at')
            ->orderByDesc('id');

        if ($request->filled('status')) {
            $query->where('workflow_status', (string) $request->query('status'));
        }

        if ($request->filled('search')) {
            $search = '%' . trim((string) $request->query('search')) . '%';
            $query->where(function ($builder) use ($search) {
                $builder->where('employee_full_name', 'like', $search)
                    ->orWhere('employee_department', 'like', $search)
                    ->orWhere('type_name', 'like', $search)
                    ->orWhere('category_name', 'like', $search)
                    ->orWhere('reported_by_name', 'like', $search);
            });
        }

        $items = $query
            ->limit((int) $request->query('limit', 100))
            ->get()
            ->map(fn (ViolationIncident $incident) => $this->formatIncident($incident))
            ->values();

        return response()->json(['data' => $items]);
    }

    public function resolveIdentity(Request $request, ViolationIncident $incident, ViolationIncidentService $incidentService): JsonResponse
    {
        $validated = $request->validate([
            'employee_full_name' => ['required', 'string', 'max:160'],
            'employee_department' => ['nullable', 'string', 'max:160'],
            'employee_position' => ['nullable', 'string', 'max:160'],
            'review_note' => ['nullable', 'string', 'max:2000'],
        ]);

        $user = $request->user();
        if (! $user) {
            abort(401);
        }

        $resolved = $incidentService->resolveUnknownIncidentIdentity($incident, $user, $validated);

        return response()->json(['data' => $this->formatIncident($resolved)]);
    }

    public function catalog(): JsonResponse
    {
        return response()->json(['data' => $this->catalogPayload(false)]);
    }

    public function upsertCategory(Request $request, ?ViolationCategory $category = null): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'key' => [
                'nullable',
                'string',
                'max:80',
                Rule::unique('violation_categories', 'key')->ignore($category?->id),
            ],
            'description' => ['nullable', 'string', 'max:2000'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $payload = [
            'name' => trim((string) $validated['name']),
            'key' => $this->normalizedKey($validated['key'] ?? null, (string) $validated['name']),
            'description' => $this->nullableTrim($validated['description'] ?? null),
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
            'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : true,
        ];

        $record = $category
            ? tap($category)->update($payload)
            : ViolationCategory::query()->create($payload);

        return response()->json(['data' => $record->fresh()]);
    }

    public function upsertType(Request $request, ?ViolationType $type = null): JsonResponse
    {
        $validated = $request->validate([
            'category_id' => ['required', 'integer', 'exists:violation_categories,id'],
            'name' => ['required', 'string', 'max:160'],
            'key' => [
                'nullable',
                'string',
                'max:80',
                Rule::unique('violation_types', 'key')->ignore($type?->id),
            ],
            'description' => ['nullable', 'string', 'max:2000'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $payload = [
            'category_id' => (int) $validated['category_id'],
            'name' => trim((string) $validated['name']),
            'key' => $this->normalizedKey($validated['key'] ?? null, (string) $validated['name']),
            'description' => $this->nullableTrim($validated['description'] ?? null),
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
            'is_active' => array_key_exists('is_active', $validated) ? (bool) $validated['is_active'] : true,
        ];

        $record = $type
            ? tap($type)->update($payload)
            : ViolationType::query()->create($payload);

        return response()->json(['data' => $record->fresh('category')]);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function catalogPayload(bool $onlyActive): array
    {
        return ViolationCategory::query()
            ->with(['types' => function ($query) use ($onlyActive) {
                if ($onlyActive) {
                    $query->where('is_active', true);
                }
            }])
            ->when($onlyActive, fn ($query) => $query->where('is_active', true))
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get()
            ->map(function (ViolationCategory $category) {
                return [
                    'id' => $category->id,
                    'key' => $category->key,
                    'name' => $category->name,
                    'description' => $category->description,
                    'sort_order' => $category->sort_order,
                    'is_active' => (bool) $category->is_active,
                    'types' => $category->types->map(fn (ViolationType $type) => [
                        'id' => $type->id,
                        'category_id' => $type->category_id,
                        'key' => $type->key,
                        'name' => $type->name,
                        'description' => $type->description,
                        'sort_order' => $type->sort_order,
                        'is_active' => (bool) $type->is_active,
                    ])->values(),
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function formatIncident(ViolationIncident $incident): array
    {
        $originalEvidences = $incident->evidences
            ->filter(fn ($evidence) => $evidence->media_role === 'original')
            ->values();
        $recognitionProbe = $incident->evidences->firstWhere('media_role', 'recognition_probe');

        return [
            'id' => $incident->id,
            'incident_uid' => $incident->incident_uid,
            'workflow_status' => $incident->workflow_status,
            'recognition_status' => $incident->recognition_status,
            'occurred_at' => $incident->occurred_at?->toIso8601String(),
            'reported_at' => $incident->reported_at?->toIso8601String(),
            'reported_by_name' => $incident->reported_by_name,
            'reported_by_user' => $incident->reporter?->name,
            'category_name' => $incident->category_name,
            'type_name' => $incident->type_name,
            'employee_full_name' => $incident->employee_full_name,
            'employee_department' => $incident->employee_department,
            'employee_position' => $incident->employee_position,
            'description' => $incident->description,
            'location_label' => $incident->location_label,
            'evidence_total_count' => $incident->evidence_total_count,
            'evidence_photo_count' => $incident->evidence_photo_count,
            'evidence_video_count' => $incident->evidence_video_count,
            'recognition_similarity' => $incident->recognition_similarity,
            'review_note' => $incident->review_note,
            'rejection_reason' => $incident->rejection_reason,
            'identity_requires_manual_review' => $incident->workflow_status === ViolationIncident::STATUS_UNKNOWN_MANUAL,
            'recognition_probe' => $recognitionProbe ? [
                'id' => $recognitionProbe->id,
                'media_kind' => $recognitionProbe->media_kind,
                'url' => $this->storageUrl($recognitionProbe->path),
                'is_primary' => false,
            ] : null,
            'evidences' => $originalEvidences->map(fn ($evidence) => [
                'id' => $evidence->id,
                'media_kind' => $evidence->media_kind,
                'url' => $this->storageUrl($evidence->path),
                'is_primary' => (bool) $evidence->is_primary,
            ])->values(),
        ];
    }

    private function storageUrl(?string $path): ?string
    {
        if (! is_string($path) || trim($path) === '') {
            return null;
        }

        $normalized = str_replace('\\', '/', ltrim($path, '/'));

        return '/storage/' . $normalized;
    }

    private function normalizedKey(mixed $explicitKey, string $fallbackName): string
    {
        $base = is_string($explicitKey) && trim($explicitKey) !== ''
            ? trim($explicitKey)
            : $fallbackName;

        return Str::of($base)->lower()->ascii()->replaceMatches('/[^a-z0-9]+/', '_')->trim('_')->value();
    }

    private function nullableTrim(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }
}