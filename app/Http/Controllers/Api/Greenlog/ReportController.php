<?php

namespace App\Http\Controllers\Api\Greenlog;

use App\Http\Controllers\Controller;
use App\Models\Greenlog\Expense;
use App\Models\Greenlog\Plant;
use App\Services\GreenlogReportExportService;
use App\Support\Greenlog\ResolvesGreenlogCompany;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Throwable;

class ReportController extends Controller
{
    use ResolvesGreenlogCompany;

    public function plantsInventory(Request $request): JsonResponse
    {
        $plants = $this->buildPlantsInventoryQuery($request)
            ->orderBy('name')
            ->get();

        $totalCost = (float) $plants->sum(fn (Plant $plant) => (float) ($plant->total_cost ?? 0));

        $byLocation = $plants
            ->groupBy('location_id')
            ->map(function ($group, $locationId): array {
                $firstPlant = $group->first();

                return [
                    'location_id' => $locationId ? (int) $locationId : null,
                    'label' => $this->locationLabel($firstPlant?->location),
                    'count' => $group->count(),
                    'totalCost' => number_format((float) $group->sum(fn (Plant $plant) => (float) ($plant->total_cost ?? 0)), 2, '.', ''),
                ];
            })
            ->sortByDesc(fn (array $item) => (float) $item['totalCost'])
            ->values();

        $byCategory = $plants
            ->groupBy('category')
            ->map(function ($group, $category): array {
                return [
                    'category' => (string) $category,
                    'label' => $this->plantCategoryLabel((string) $category),
                    'count' => $group->count(),
                    'totalCost' => number_format((float) $group->sum(fn (Plant $plant) => (float) ($plant->total_cost ?? 0)), 2, '.', ''),
                ];
            })
            ->sortByDesc(fn (array $item) => (float) $item['totalCost'])
            ->values();

        return response()->json([
            'status' => true,
            'data' => [
                'items' => $plants,
                'totalCount' => $plants->count(),
                'totalCost' => number_format($totalCost, 2, '.', ''),
                'byLocation' => $byLocation,
                'byCategory' => $byCategory,
            ],
        ]);
    }

    public function expensesFinancial(Request $request): JsonResponse
    {
        $query = $this->buildExpensesFinancialQuery($request);

        $items = (clone $query)
            ->orderByDesc('expense_date')
            ->orderByDesc('created_at')
            ->get();

        $summary = (clone $query)
            ->select('category', DB::raw('COUNT(*) as count'), DB::raw('SUM(amount) as amount'))
            ->groupBy('category')
            ->orderBy('category')
            ->get();

        return response()->json([
            'status' => true,
            'data' => [
                'items' => $items,
                'totalCount' => $items->count(),
                'totalAmount' => number_format((float) $items->sum('amount'), 2, '.', ''),
                'byCategory' => $summary,
            ],
        ]);
    }

    public function exportPlantsInventory(Request $request, GreenlogReportExportService $exportService): BinaryFileResponse
    {
        $plants = $this->buildPlantsInventoryQuery($request)
            ->orderBy('name')
            ->get();

        try {
            $filePath = $exportService->exportPlantsInventory($plants);
        } catch (Throwable $exception) {
            report($exception);

            abort(500, 'Не удалось сформировать Excel-ведомость растений.');
        }

        return response()
            ->download($filePath, 'greenlog_plants_inventory_' . now()->format('Y-m-d_H-i') . '.xlsx')
            ->deleteFileAfterSend(true);
    }

    public function exportExpensesSummary(Request $request, GreenlogReportExportService $exportService): BinaryFileResponse
    {
        $expenses = $this->buildExpensesFinancialQuery($request)
            ->orderByDesc('expense_date')
            ->orderByDesc('created_at')
            ->get();

        try {
            $filePath = $exportService->exportExpensesSummary($expenses);
        } catch (Throwable $exception) {
            report($exception);

            abort(500, 'Не удалось сформировать Excel-финансовый отчет.');
        }

        return response()
            ->download($filePath, 'greenlog_expenses_summary_' . now()->format('Y-m-d_H-i') . '.xlsx')
            ->deleteFileAfterSend(true);
    }

    private function buildPlantsInventoryQuery(Request $request)
    {
        $validated = $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'category' => ['nullable', 'string'],
            'location_id' => ['nullable', 'integer'],
            'plant_id' => ['nullable', 'integer'],
            'status' => ['nullable', 'string'],
        ]);

        $query = Plant::query()
            ->with(['location:id,building,floor,room,factory_zone'])
            ->where('company_key', $this->companyKey($request));

        if (! empty($validated['date_from'])) {
            $query->whereDate('created_at', '>=', $validated['date_from']);
        }

        if (! empty($validated['date_to'])) {
            $query->whereDate('created_at', '<=', $validated['date_to']);
        }

        if (! empty($validated['category'])) {
            $query->where('category', $validated['category']);
        }

        if (! empty($validated['location_id'])) {
            $query->where('location_id', $validated['location_id']);
        }

        if (! empty($validated['plant_id'])) {
            $query->whereKey($validated['plant_id']);
        }

        if (! empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        return $query;
    }

    private function buildExpensesFinancialQuery(Request $request)
    {
        $validated = $request->validate([
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'category' => ['nullable', 'string'],
            'location_id' => ['nullable', 'integer'],
            'plant_id' => ['nullable', 'integer'],
            'status' => ['nullable', 'string'],
        ]);

        $query = Expense::query()
            ->with([
                'plant:id,name,status',
                'location:id,building,floor,room,factory_zone',
            ])
            ->where('company_key', $this->companyKey($request));

        if (! empty($validated['date_from'])) {
            $query->whereDate('expense_date', '>=', $validated['date_from']);
        }

        if (! empty($validated['date_to'])) {
            $query->whereDate('expense_date', '<=', $validated['date_to']);
        }

        if (! empty($validated['category'])) {
            $query->where('category', $validated['category']);
        }

        if (! empty($validated['location_id'])) {
            $query->where('location_id', $validated['location_id']);
        }

        if (! empty($validated['plant_id'])) {
            $query->where('plant_id', $validated['plant_id']);
        }

        if (! empty($validated['status'])) {
            $query->whereHas('plant', function ($plantQuery) use ($validated) {
                $plantQuery->where('status', $validated['status']);
            });
        }

        return $query;
    }

    private function locationLabel(?object $location): string
    {
        if ($location === null) {
            return 'Без локации';
        }

        return collect([
            $location->building ?? null,
            $location->floor ?? null,
            $location->room ?? null,
            $location->factory_zone ?? null,
        ])->filter()->implode(' / ') ?: 'Без локации';
    }

    private function plantCategoryLabel(string $category): string
    {
        return match ($category) {
            'indoor' => 'Комнатное',
            'outdoor' => 'Уличное',
            'office' => 'Офисное',
            'room' => 'Комнатное',
            'conifer' => 'Хвойное',
            'flower/shrub' => 'Цветы / кустарники',
            'tree' => 'Дерево',
            'fruit_tree' => 'Плодовое дерево',
            'shrub' => 'Кустарник',
            'flower' => 'Цветок',
            default => $category,
        };
    }
}
