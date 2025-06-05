<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use App\Models\Task;
use App\Models\TaskLoading;
use App\Models\TaskWeighing;
use App\Models\Truck;
use App\Models\User;
use App\Models\Visitor;

class StatisticsController extends Controller
{
     public function index(Request $request)
    {
        // Получаем даты из запроса или ставим дефолт за последние 7 дней
        $fromInput = $request->query('from');
        $toInput = $request->query('to');

        $from = ($fromInput && $fromInput !== '') 
            ? Carbon::createFromFormat('Y-m-d', $fromInput)->startOfDay() 
            : Carbon::now()->subDays(7)->startOfDay();

        $to = ($toInput && $toInput !== '') 
            ? Carbon::createFromFormat('Y-m-d', $toInput)->endOfDay() 
            : Carbon::now()->endOfDay();

        // Базовый запрос задач с фильтром по плановой дате
        $tasksQuery = Task::whereBetween('plan_date', [$from, $to]);

        // Задачи по статусам
        $tasksByStatus = (clone $tasksQuery)
            ->select('status_id', DB::raw('count(*) as total'), 'statuses.name')
            ->join('statuses', 'tasks.status_id', '=', 'statuses.id')
            ->groupBy('status_id', 'statuses.name')
            ->get();

        // Всего задач
        $totalTasks = (clone $tasksQuery)->count();

        // Погрузки связанные с задачами в период
        $totalLoadings = TaskLoading::whereHas('task', function ($query) use ($from, $to) {
            $query->whereBetween('plan_date', [$from, $to]);
        })->count();

        // Взвешивания связанные с задачами в период
        $weighingsQuery = TaskWeighing::whereHas('task', function ($query) use ($from, $to) {
            $query->whereBetween('plan_date', [$from, $to]);
        });

        $totalWeighings = $weighingsQuery->count();
        $averageWeight = round($weighingsQuery->avg('weight') ?? 0, 2);

        // Грузовики и водители (без фильтра по дате)
        $totalTrucks = Truck::count();
        $totalDrivers = User::has('trucks')->count();

        // Посетители по дате фильтра
        $visitorsPerDay = Visitor::select(DB::raw('DATE(entry_date) as date'), DB::raw('COUNT(*) as total'))
            ->whereBetween('entry_date', [$from, $to])
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        // Посетители сегодня, неделю, месяц — по текущим датам
        $visitorsToday = Visitor::whereDate('entry_date', Carbon::today())->count();
        $visitorsWeek = Visitor::where('entry_date', '>=', Carbon::now()->subWeek())->count();
        $visitorsMonth = Visitor::where('entry_date', '>=', Carbon::now()->subMonth())->count();

        // Топ складов по погрузкам за период
        $topWarehouses = TaskLoading::select('warehouse_id', DB::raw('count(*) as total'))
            ->whereHas('task', function ($query) use ($from, $to) {
                $query->whereBetween('plan_date', [$from, $to]);
            })
            ->groupBy('warehouse_id')
            ->orderByDesc('total')
            ->limit(5)
            ->with('warehouse:id,name')
            ->get();

        // Задачи по пользователям за период
        $tasksPerUser = Task::select('user_id', DB::raw('count(*) as total'))
            ->whereBetween('plan_date', [$from, $to])
            ->groupBy('user_id')
            ->with('user:id,name')
            ->orderByDesc('total')
            ->get();

        return response()->json([
            'total_tasks' => $totalTasks,
            'tasks_by_status' => $tasksByStatus,
            'total_loadings' => $totalLoadings,
            'total_weighings' => $totalWeighings,
            'average_weight' => $averageWeight,
            'total_trucks' => $totalTrucks,
            'total_drivers' => $totalDrivers,
            'visitors_today' => $visitorsToday,
            'visitors_week' => $visitorsWeek,
            'visitors_month' => $visitorsMonth,
            'visitors_per_day' => $visitorsPerDay,
            'top_warehouses_by_loadings' => $topWarehouses,
            'tasks_per_user' => $tasksPerUser,
        ]);
    }
    public function getLoadingStats(Request $request)
    {
        try {
            // Группируем по plan_date — плановая дата отгрузки
            // Считаем: сколько всего задач запланировано на эту дату (count)
            // И сколько из них уже отгружено (end_date не NULL и совпадает с plan_date)
           $stats = \DB::table('tasks')
                ->selectRaw('plan_date as date')
                ->selectRaw('COUNT(*) as planned')
                ->selectRaw('COUNT(CASE WHEN end_date IS NOT NULL THEN 1 END) as fact')
                ->whereNotNull('plan_date')
                ->groupBy('plan_date')
                ->orderBy('plan_date')
                ->get();


            return response()->json([
                'status' => true,
                'message' => 'Статистика погрузок получена',
                'data' => $stats,
            ], 200);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Ошибка получения статистики: ' . $e->getMessage(),
            ], 500);
        }
    }



}
