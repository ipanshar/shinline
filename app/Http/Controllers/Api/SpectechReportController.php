<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SpectechReportExportService;
use App\Services\SpectechWeeklyReportService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Throwable;

class SpectechReportController extends Controller
{
    public function weekly(Request $request, SpectechWeeklyReportService $service): JsonResponse
    {
        [$from, $to] = $this->resolvePeriod($request);

        return response()->json([
            'status' => true,
            'data' => $service->build($from, $to),
        ]);
    }

    public function exportWeekly(
        Request $request,
        SpectechWeeklyReportService $service,
        SpectechReportExportService $exporter
    ): BinaryFileResponse {
        [$from, $to] = $this->resolvePeriod($request);
        $report = $service->build($from, $to);
        try {
            $filePath = $exporter->export($report);
        } catch (Throwable $exception) {
            report($exception);

            abort(500, 'Не удалось сформировать Excel-отчёт. Проверьте зависимости Composer и права на storage/app/reports.');
        }

        $filename = sprintf(
            'spectech-weekly-report_%s_%s.xlsx',
            $from->format('Y-m-d'),
            $to->format('Y-m-d')
        );

        return response()->download($filePath, $filename)->deleteFileAfterSend(true);
    }

    /**
     * @return array{0: Carbon, 1: Carbon}
     */
    private function resolvePeriod(Request $request): array
    {
        $today = Carbon::now();
        $defaultFrom = $today->copy()->startOfWeek(Carbon::MONDAY);
        $defaultTo = $today->copy()->endOfWeek(Carbon::SUNDAY);

        $from = $request->filled('from') ? Carbon::parse($request->string('from')) : $defaultFrom;
        $to = $request->filled('to') ? Carbon::parse($request->string('to')) : $defaultTo;

        if ($from->greaterThan($to)) {
            [$from, $to] = [$to, $from];
        }

        return [$from, $to];
    }
}
