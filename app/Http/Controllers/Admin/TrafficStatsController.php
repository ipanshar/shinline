<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class TrafficStatsController extends Controller
{
    public function index(Request $request)
    {
        try {
            $groupBy = $request->query('group_by', 'day');

            $format = match ($groupBy) {
                'week' => '%Y-%W',      // неделя
                'month' => '%Y-%m',     // месяц
                default => '%Y-%m-%d',  // день
            };

            $visits = DB::table('visitors')
                ->selectRaw("strftime(?, entry_date) as period, COUNT(*) as count", [$format])
                ->whereNotNull('entry_date')
                ->groupBy('period')
                ->orderBy('period')
                ->get();

            return response()->json($visits);
        } catch (\Exception $e) {
            \Log::error('Ошибка получения статистики посещений: ' . $e->getMessage());
            return response()->json(['error' => 'Internal Server Error'], 500);
        }
    }

}
