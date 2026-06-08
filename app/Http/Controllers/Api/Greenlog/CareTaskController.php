<?php

namespace App\Http\Controllers\Api\Greenlog;

use App\Http\Controllers\Controller;
use App\Http\Requests\Greenlog\CompleteCareTaskRequest;
use App\Http\Requests\Greenlog\ListCareTasksRequest;
use App\Http\Requests\Greenlog\StoreCareTaskRequest;
use App\Http\Requests\Greenlog\UpdateCareTaskRequest;
use App\Models\Greenlog\CareTask;
use App\Models\Greenlog\Plant;
use App\Support\Greenlog\ResolvesGreenlogCompany;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class CareTaskController extends Controller
{
    use ResolvesGreenlogCompany;

    public function index(ListCareTasksRequest $request): JsonResponse
    {
        $query = CareTask::query()
            ->with(['plant:id,name'])
            ->where('company_key', $this->companyKey($request));

        if ($request->filled('plant_id')) {
            $query->where('plant_id', (int) $request->input('plant_id'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status')->toString());
        }

        if ($request->filled('type')) {
            $query->where('type', $request->string('type')->toString());
        }

        $tasks = $query
            ->orderBy('due_at')
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'status' => true,
            'data' => $tasks,
        ]);
    }

    public function today(Request $request): JsonResponse
    {
        $start = Carbon::today();
        $end = Carbon::tomorrow();

        $tasks = CareTask::query()
            ->with(['plant:id,name'])
            ->where('company_key', $this->companyKey($request))
            ->whereBetween('due_at', [$start, $end])
            ->orderBy('due_at')
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'status' => true,
            'data' => $tasks,
        ]);
    }

    public function store(StoreCareTaskRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $companyKey = $this->companyKey($request);

        $this->assertScopedPlant($validated['plant_id'] ?? null, $companyKey);

        $task = CareTask::create([
            'company_key' => $companyKey,
            'created_by_user_id' => $request->user()?->id,
            'plant_id' => $validated['plant_id'] ?? null,
            'type' => $validated['type'],
            'due_at' => $validated['due_at'],
            'status' => $validated['status'] ?? 'pending',
            'completed_at' => $validated['completed_at'] ?? null,
            'comment' => $validated['comment'] ?? null,
        ])->load(['plant:id,name']);

        return response()->json([
            'status' => true,
            'data' => $task,
        ], 201);
    }

    public function update(UpdateCareTaskRequest $request, CareTask $careTask): JsonResponse
    {
        $this->abortIfOutsideCompany($request, $careTask);
        $validated = $request->validated();

        if (array_key_exists('plant_id', $validated)) {
            $this->assertScopedPlant($validated['plant_id'], $this->companyKey($request));
        }

        $careTask->update($validated);

        return response()->json([
            'status' => true,
            'data' => $careTask->fresh()->load(['plant:id,name']),
        ]);
    }

    public function complete(CompleteCareTaskRequest $request, CareTask $careTask): JsonResponse
    {
        $this->abortIfOutsideCompany($request, $careTask);

        $careTask->update([
            'status' => 'done',
            'completed_at' => now(),
            'comment' => $request->validated('comment') ?? $careTask->comment,
        ]);

        return response()->json([
            'status' => true,
            'data' => $careTask->fresh()->load(['plant:id,name']),
        ]);
    }

    public function destroy(Request $request, CareTask $careTask): JsonResponse
    {
        $this->abortIfOutsideCompany($request, $careTask);
        $careTask->delete();

        return response()->json([
            'status' => true,
            'data' => null,
        ]);
    }
    private function abortIfOutsideCompany(Request $request, CareTask $careTask): void
    {
        abort_unless($careTask->company_key === $this->companyKey($request), 404);
    }

    private function assertScopedPlant(?int $plantId, string $companyKey): void
    {
        if ($plantId === null) {
            return;
        }

        abort_unless(
            Plant::query()->whereKey($plantId)->where('company_key', $companyKey)->exists(),
            422,
            'Растение не найдено в рамках компании.'
        );
    }
}
