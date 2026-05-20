<?php

namespace App\Services;

use App\Models\SpectechRequest;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class SpectechWeeklyReportService
{
    private const ACTIVE_FROZEN_STATUSES = [
        SpectechRequest::STATUS_NEW,
        SpectechRequest::STATUS_DEPARTURE,
        SpectechRequest::STATUS_ON_LOCATION,
        SpectechRequest::STATUS_WORK_STARTED,
    ];

    public function build(Carbon $from, Carbon $to): array
    {
        $from = $from->copy()->startOfDay();
        $to = $to->copy()->endOfDay();

        $requests = SpectechRequest::query()
            ->with(['truck', 'user.telegramApprovedChat'])
            ->where(function ($query) use ($from, $to) {
                $query
                    ->where(function ($overlapQuery) use ($from, $to) {
                        $overlapQuery
                            ->whereNotNull('requested_start')
                            ->whereNotNull('requested_end')
                            ->where('requested_start', '<=', $to)
                            ->where('requested_end', '>=', $from);
                    })
                    ->orWhere(function ($fallbackQuery) use ($from, $to) {
                        $fallbackQuery
                            ->where(function ($missingPeriodQuery) {
                                $missingPeriodQuery
                                    ->whereNull('requested_start')
                                    ->orWhereNull('requested_end');
                            })
                            ->whereBetween('created_at', [$from, $to]);
                    });
            })
            ->orderByRaw('COALESCE(requested_start, created_at) asc')
            ->get();

        $rows = $requests->map(fn (SpectechRequest $request) => $this->formatRow($request))->values();

        $summary = [
            'total_requests' => $requests->count(),
            'conflict_requests' => $requests->filter(fn (SpectechRequest $request) => !empty($request->conflict_info))->count(),
            'frozen_requests' => $requests->filter(fn (SpectechRequest $request) => $this->isFrozenProblem($request))->count(),
            'cancelled_requests' => $requests->where('status', SpectechRequest::STATUS_CANCELLED)->count(),
        ];

        $problemRequests = $requests
            ->filter(fn (SpectechRequest $request) => $this->isProblemRequest($request))
            ->values()
            ->map(fn (SpectechRequest $request) => $this->formatProblemRow($request))
            ->all();

        $analytics = $this->buildAnalytics($requests);

        return [
            'period' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'label' => $this->formatPeriodLabel($from, $to),
            ],
            'summary' => $summary,
            'problem_requests' => $problemRequests,
            'recommendations' => $analytics['recommendations'],
            'peak_hours' => $analytics['peak_hours'],
            'journal_rows' => $rows,
        ];
    }

    private function formatRow(SpectechRequest $request): array
    {
        $initiatorName = $this->initiatorName($request);
        $initiatorPhone = $this->initiatorPhone($request);
        $period = $this->formatPeriod($request);
        $location = $this->formatLocation($request);

        return [
            'id' => $request->id,
            'initiator_name' => $initiatorName,
            'initiator_phone' => $initiatorPhone,
            'equipment_name' => $request->truck?->name ?? '—',
            'plate_number' => $request->truck?->plate_number,
            'period' => $period,
            'status' => $request->status,
            'status_label' => SpectechRequest::STATUS_LABELS[$request->status] ?? $request->status,
            'has_conflict' => !empty($request->conflict_info),
            'is_frozen' => $this->isFrozenProblem($request),
            'is_cancelled' => $request->status === SpectechRequest::STATUS_CANCELLED,
            'location' => $location,
            'comment' => $request->comment ?: '—',
            'created_at' => $request->created_at?->toIso8601String(),
            'created_at_label' => $request->created_at?->format('d.m.Y H:i') ?? '—',
            'source_label' => $request->user?->telegramApprovedChat ? 'Telegram Mini App' : 'Веб-кабинет',
            'status_freeze_reason' => $request->getStatusFreezeReason(),
            'cancellation_reason' => $request->cancellation_reason,
            'cancelled_by_label' => $this->cancelledByLabel($request->cancelled_by),
            'conflict_summary' => $this->conflictSummary($request),
            'place_confirmed' => $this->placeConfirmedLabel($request),
        ];
    }

    private function formatProblemRow(SpectechRequest $request): array
    {
        if (!empty($request->conflict_info)) {
            $essence = 'Конфликт планирования';
            $solution = 'Перенести работы на свободное время либо согласовать замену техники';
        } elseif ($this->isFrozenProblem($request)) {
            $essence = 'Статус заморожено';
            $solution = 'Проверить фактическое завершение работ и закрыть заявку в системе';
        } else {
            $essence = 'Заявка отменена';
            $solution = $request->cancellation_reason
                ? 'Проверить причину отмены и при необходимости пересогласовать заявку'
                : 'Проверить причину отмены и пересогласовать заявку';
        }

        return [
            'id' => $request->id,
            'essence' => $essence,
            'solution' => $solution,
            'status_label' => SpectechRequest::STATUS_LABELS[$request->status] ?? $request->status,
            'initiator_name' => $this->initiatorName($request),
            'equipment_name' => $request->truck?->name ?? '—',
            'plate_number' => $request->truck?->plate_number,
            'location' => $this->formatLocation($request),
        ];
    }

    private function buildAnalytics(Collection $requests): array
    {
        $hourBuckets = $requests
            ->map(fn (SpectechRequest $request) => [
                'hour' => ($request->requested_start ?? $request->created_at)?->format('H'),
                'request' => $request,
            ])
            ->filter(fn (array $item) => $item['hour'] !== null)
            ->groupBy('hour')
            ->map(fn (Collection $items, string $hour) => [
                'hour' => $hour,
                'label' => sprintf('%s:00-%s:59', $hour, $hour),
                'count' => $items->count(),
            ])
            ->sortByDesc('count')
            ->values();

        $recommendations = [];

        if (($hourBuckets[0]['count'] ?? 0) > 0) {
            $recommendations[] = sprintf(
                'Пиковая нагрузка приходится на %s (%d заявок). Стоит усилить дежурство в этот интервал.',
                $hourBuckets[0]['label'] ?? 'пиковое время',
                $hourBuckets[0]['count'] ?? 0
            );
        } else {
            $recommendations[] = 'За выбранный период заявок нет, нагрузка не сформирована.';
        }

        if ($requests->filter(fn (SpectechRequest $request) => !empty($request->conflict_info))->count() > 0) {
            $recommendations[] = 'Есть конфликты планирования. Нужен контроль распределения техники в пиковые часы.';
        }

        if ($requests->filter(fn (SpectechRequest $request) => $this->isFrozenProblem($request))->count() > 0) {
            $recommendations[] = 'Есть замороженные заявки. Рекомендуется контролировать своевременное завершение работ.';
        }

        if ($requests->where('status', SpectechRequest::STATUS_CANCELLED)->count() > 0) {
            $recommendations[] = 'Есть отменённые заявки. Стоит проверить причины и повторяющиеся сценарии отказов.';
        }

        if ($requests->isNotEmpty() && count($recommendations) < 3) {
            $recommendations[] = 'Рекомендуется сверить фактическую загрузку техники с планом и заранее резервировать пиковые интервалы.';
        }

        return [
            'peak_hours' => $hourBuckets->take(3)->all(),
            'recommendations' => array_values(array_unique($recommendations)),
        ];
    }

    private function formatLocation(SpectechRequest $request): string
    {
        $parts = array_filter([
            trim((string) $request->terminal),
            trim((string) $request->zone),
            trim((string) $request->gate),
        ], fn (string $value) => $value !== '');

        $location = implode(' / ', $parts);

        $lines = [];
        if ($location !== '') {
            $lines[] = $location;
        }

        $lines[] = 'Место согласовано: ' . $this->placeConfirmedLabel($request);

        if ($request->address) {
            $lines[] = 'Адрес: ' . $request->address;
        }

        if ($request->comment) {
            $lines[] = 'Комментарий: ' . $request->comment;
        }

        return implode("\n", $lines);
    }

    private function formatPeriod(SpectechRequest $request): string
    {
        if ($request->requested_start || $request->requested_end) {
            $start = $request->requested_start?->format('d.m.Y H:i') ?? '—';
            $end = $request->requested_end?->format('d.m.Y H:i') ?? '—';

            return "{$start} — {$end}";
        }

        $start = $request->start_date?->format('d.m.Y') ?? '—';
        $end = $request->end_date?->format('d.m.Y') ?? '—';

        return "{$start} — {$end}";
    }

    private function conflictSummary(SpectechRequest $request): string
    {
        if (empty($request->conflict_info)) {
            return '—';
        }

        $chunks = [];

        foreach ($request->conflict_info as $item) {
            $truck = $item['truck_name'] ?? 'Техника';
            $plate = !empty($item['plate_number']) ? ' (' . $item['plate_number'] . ')' : '';
            $freeAt = !empty($item['free_at']) ? ' свободна с ' . $item['free_at'] : '';
            $chunks[] = $truck . $plate . $freeAt;
        }

        return implode('; ', $chunks);
    }

    private function placeConfirmedLabel(SpectechRequest $request): string
    {
        return $request->terminal && $request->zone && $request->address ? 'Да' : 'Нет';
    }

    private function isFrozenProblem(SpectechRequest $request): bool
    {
        return $request->isStatusFrozen() && in_array($request->status, self::ACTIVE_FROZEN_STATUSES, true);
    }

    private function isProblemRequest(SpectechRequest $request): bool
    {
        return !empty($request->conflict_info)
            || $this->isFrozenProblem($request)
            || $request->status === SpectechRequest::STATUS_CANCELLED;
    }

    private function initiatorName(SpectechRequest $request): string
    {
        return $request->initiator_name ?: $request->user?->name ?: '—';
    }

    private function initiatorPhone(SpectechRequest $request): string
    {
        return $request->initiator_phone ?: $request->user?->phone ?: '—';
    }

    private function cancelledByLabel(?string $value): string
    {
        return match ($value) {
            SpectechRequest::CANCELLED_BY_OPERATOR => 'Оператор',
            SpectechRequest::CANCELLED_BY_CUSTOMER => 'Заказчик',
            default => '—',
        };
    }

    private function formatPeriodLabel(Carbon $from, Carbon $to): string
    {
        return $from->format('d.m.Y') . ' - ' . $to->format('d.m.Y');
    }
}
