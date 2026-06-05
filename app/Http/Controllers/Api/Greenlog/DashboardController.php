<?php

namespace App\Http\Controllers\Api\Greenlog;

use App\Http\Controllers\Controller;
use App\Models\Greenlog\CareTask;
use App\Models\Greenlog\Location;
use App\Models\Greenlog\Expense;
use App\Models\Greenlog\Plant;
use App\Support\Greenlog\ResolvesGreenlogCompany;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    use ResolvesGreenlogCompany;

    public function summary(Request $request): JsonResponse
    {
        $companyKey = $this->companyKey($request);
        $todayStart = Carbon::today();
        $tomorrowStart = Carbon::tomorrow();
        $monthStart = Carbon::now()->startOfMonth();
        $monthEnd = Carbon::now()->endOfMonth();

        $plantsBaseQuery = Plant::query()->where('company_key', $companyKey);
        $locationsBaseQuery = Location::query()->where('company_key', $companyKey);
        $careTasksBaseQuery = CareTask::query()->where('company_key', $companyKey);
        $expensesBaseQuery = Expense::query()->where('company_key', $companyKey);

        $plantSpeciesCount = (clone $plantsBaseQuery)->count();
        $totalPlants = (clone $plantsBaseQuery)->sum('quantity');
        $locationsCount = (clone $locationsBaseQuery)->count();
        $fundValue = (clone $plantsBaseQuery)->sum('total_cost');
        $plantsByStatus = (clone $plantsBaseQuery)
            ->select('status', DB::raw('COUNT(*) as count'))
            ->groupBy('status')
            ->orderBy('status')
            ->get();

        $todayTasksQuery = (clone $careTasksBaseQuery)
            ->with(['plant:id,name'])
            ->whereBetween('due_at', [$todayStart, $tomorrowStart])
            ->orderBy('due_at');

        $overdueTasksQuery = (clone $careTasksBaseQuery)
            ->with(['plant:id,name'])
            ->where('status', '!=', 'done')
            ->where('due_at', '<', now())
            ->orderBy('due_at');

        $todayTasks = (clone $todayTasksQuery)->get();
        $overdueTasks = (clone $overdueTasksQuery)->get();
        $latestPlants = (clone $plantsBaseQuery)
            ->with(['location:id,building,floor,room,factory_zone'])
            ->latest()
            ->limit(5)
            ->get();

        $currentMonthExpenses = (clone $expensesBaseQuery)
            ->whereBetween('expense_date', [$monthStart, $monthEnd])
            ->sum('amount');

        return response()->json([
            'status' => true,
            'data' => [
                'plantSpeciesCount' => $plantSpeciesCount,
                'totalPlants' => (int) $totalPlants,
                'locationsCount' => $locationsCount,
                'fundValue' => (float) $fundValue,
                'plantsByStatus' => $plantsByStatus,
                'todayTasksCount' => $todayTasks->count(),
                'todayTasks' => $todayTasks,
                'overdueTasksCount' => $overdueTasks->count(),
                'overdueTasks' => $overdueTasks,
                'currentMonthExpensesTotal' => number_format((float) $currentMonthExpenses, 2, '.', ''),
                'latestPlants' => $latestPlants,
            ],
        ]);
    }
}
