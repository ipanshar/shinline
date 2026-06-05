<?php

namespace App\Http\Controllers\Api\Greenlog;

use App\Http\Controllers\Controller;
use App\Http\Requests\Greenlog\ListExpensesRequest;
use App\Http\Requests\Greenlog\StoreExpenseRequest;
use App\Http\Requests\Greenlog\UpdateExpenseRequest;
use App\Models\Greenlog\Expense;
use App\Models\Greenlog\Location;
use App\Models\Greenlog\Plant;
use App\Support\Greenlog\ResolvesGreenlogCompany;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ExpenseController extends Controller
{
    use ResolvesGreenlogCompany;

    public function index(ListExpensesRequest $request): JsonResponse
    {
        $query = Expense::query()
            ->with(['plant:id,name', 'location:id,building,floor,room,factory_zone'])
            ->where('company_key', $this->companyKey($request));

        if ($request->filled('category')) {
            $query->where('category', $request->string('category')->toString());
        }

        if ($request->filled('plant_id')) {
            $query->where('plant_id', (int) $request->input('plant_id'));
        }

        if ($request->filled('location_id')) {
            $query->where('location_id', (int) $request->input('location_id'));
        }

        if ($request->filled('date_from')) {
            $query->whereDate('expense_date', '>=', $request->date('date_from'));
        }

        if ($request->filled('date_to')) {
            $query->whereDate('expense_date', '<=', $request->date('date_to'));
        }

        $expenses = $query
            ->orderByDesc('expense_date')
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'status' => true,
            'data' => $expenses,
        ]);
    }

    public function summary(ListExpensesRequest $request): JsonResponse
    {
        $query = Expense::query()->where('company_key', $this->companyKey($request));

        if ($request->filled('category')) {
            $query->where('category', $request->string('category')->toString());
        }

        if ($request->filled('plant_id')) {
            $query->where('plant_id', (int) $request->input('plant_id'));
        }

        if ($request->filled('location_id')) {
            $query->where('location_id', (int) $request->input('location_id'));
        }

        if ($request->filled('date_from')) {
            $query->whereDate('expense_date', '>=', $request->date('date_from'));
        }

        if ($request->filled('date_to')) {
            $query->whereDate('expense_date', '<=', $request->date('date_to'));
        }

        $baseQuery = clone $query;
        $byCategoryQuery = clone $query;

        $totalCount = (clone $baseQuery)->count();
        $totalAmount = (clone $baseQuery)->sum('amount');
        $byCategory = $byCategoryQuery
            ->select('category', DB::raw('COUNT(*) as count'), DB::raw('SUM(amount) as amount'))
            ->groupBy('category')
            ->orderBy('category')
            ->get();

        return response()->json([
            'status' => true,
            'data' => [
                'totalCount' => $totalCount,
                'totalAmount' => number_format((float) $totalAmount, 2, '.', ''),
                'byCategory' => $byCategory,
            ],
        ]);
    }

    public function store(StoreExpenseRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $companyKey = $this->companyKey($request);

        $this->assertScopedPlant($validated['plant_id'] ?? null, $companyKey);
        $this->assertScopedLocation($validated['location_id'] ?? null, $companyKey);

        $expense = Expense::create([
            'company_key' => $companyKey,
            'created_by_user_id' => $request->user()?->id,
            'plant_id' => $validated['plant_id'] ?? null,
            'location_id' => $validated['location_id'] ?? null,
            'category' => $validated['category'],
            'amount' => $validated['amount'],
            'expense_date' => $validated['expense_date'],
            'description' => $validated['description'],
            'document_number' => $validated['document_number'] ?? null,
        ])->load(['plant:id,name', 'location:id,building,floor,room,factory_zone']);

        return response()->json([
            'status' => true,
            'data' => $expense,
        ], 201);
    }

    public function update(UpdateExpenseRequest $request, Expense $expense): JsonResponse
    {
        $this->abortIfOutsideCompany($request, $expense);
        $validated = $request->validated();
        $companyKey = $this->companyKey($request);

        if (array_key_exists('plant_id', $validated)) {
            $this->assertScopedPlant($validated['plant_id'], $companyKey);
        }

        if (array_key_exists('location_id', $validated)) {
            $this->assertScopedLocation($validated['location_id'], $companyKey);
        }

        $expense->update($validated);

        return response()->json([
            'status' => true,
            'data' => $expense->fresh()->load(['plant:id,name', 'location:id,building,floor,room,factory_zone']),
        ]);
    }

    public function destroy(Request $request, Expense $expense): JsonResponse
    {
        $this->abortIfOutsideCompany($request, $expense);
        $expense->delete();

        return response()->json([
            'status' => true,
            'data' => null,
        ]);
    }
    private function abortIfOutsideCompany(Request $request, Expense $expense): void
    {
        abort_unless($expense->company_key === $this->companyKey($request), 404);
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

    private function assertScopedLocation(?int $locationId, string $companyKey): void
    {
        if ($locationId === null) {
            return;
        }

        abort_unless(
            Location::query()->whereKey($locationId)->where('company_key', $companyKey)->exists(),
            422,
            'Локация не найдена в рамках компании.'
        );
    }
}
