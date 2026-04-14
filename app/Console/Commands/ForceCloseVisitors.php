<?php

namespace App\Console\Commands;

use App\Models\EntryPermit;
use App\Models\Task;
use App\Models\Visitor;
use App\Services\DssStatusCacheService;
use App\Services\DssVisitorFlowService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class ForceCloseVisitors extends Command
{
    private DssVisitorFlowService $visitorFlowService;
    private DssStatusCacheService $statusCache;

    protected $signature = 'dss:force-close-visitors
                            {--visitor-id=* : ID визита(ов) для принудительного закрытия}
                            {--truck-id=* : ID ТС для обработки}
                            {--plate=* : Номер ТС или его часть}
                            {--yard-id= : ID двора}
                            {--hours= : Закрыть визиты старше указанного числа часов}
                            {--entered-before= : Закрыть визиты, въехавшие раньше указанной даты/времени}
                            {--exit-time= : Время выезда, которое будет проставлено в закрытых визитах}
                            {--limit=200 : Максимальное число визитов за один запуск}
                            {--note= : Дополнительная пометка в комментарии визита}
                            {--all : Разрешить обработку всех активных подтверждённых визитов}
                            {--dry-run : Только показать, что будет закрыто}
                            {--force : Выполнить без подтверждения}';

    protected $description = 'Временно закрывает зависшие активные визиты, выводит ТС с территории и завершает связанные задания';

    public function handle(DssVisitorFlowService $visitorFlowService, DssStatusCacheService $statusCache): int
    {
        $this->visitorFlowService = $visitorFlowService;
        $this->statusCache = $statusCache;

        if (!$this->hasScopeFilters()) {
            $this->error('Укажите хотя бы один фильтр (--visitor-id, --truck-id, --plate, --yard-id, --hours, --entered-before) или явно подтвердите массовую обработку через --all.');

            return self::FAILURE;
        }

        try {
            $exitAt = $this->resolveExitTime();
        } catch (\Throwable $exception) {
            $this->error('Некорректное значение --exit-time: ' . $exception->getMessage());

            return self::FAILURE;
        }

        $limit = max(1, (int) $this->option('limit'));
        $visitors = $this->buildVisitorQuery()
            ->orderBy('entry_date')
            ->orderBy('id')
            ->limit($limit)
            ->get();

        if ($visitors->isEmpty()) {
            $this->info('Подходящие активные визиты не найдены.');

            return self::SUCCESS;
        }

        $this->info('Найдено визитов: ' . $visitors->count());
        $this->info('Время выезда: ' . $exitAt->format('Y-m-d H:i:s'));

        $previewRows = $visitors
            ->map(fn (Visitor $visitor) => $this->makePreviewRow($visitor))
            ->all();

        $this->table(
            ['Visitor ID', 'ТС', 'Двор', 'Въезд', 'Task', 'Permit', 'Комментарий'],
            array_slice($previewRows, 0, 50)
        );

        if ($visitors->count() > 50) {
            $this->line('Показаны первые 50 записей из ' . $visitors->count() . '.');
        }

        if ($this->option('dry-run')) {
            $this->warn('Dry-run: изменения не применялись.');

            return self::SUCCESS;
        }

        if (!$this->option('force') && !$this->confirm('Подтвердить принудительное закрытие найденных визитов?')) {
            $this->info('Операция отменена.');

            return self::SUCCESS;
        }

        $completedStatusId = $this->statusCache->getId('completed');
        $inactiveStatusId = $this->statusCache->getId('not_active');
        $summary = [
            'processed' => 0,
            'tasks_completed' => 0,
            'permits_deactivated' => 0,
            'failed' => [],
        ];

        foreach ($visitors as $visitor) {
            try {
                DB::transaction(function () use ($visitor, $exitAt, $completedStatusId, $inactiveStatusId, &$summary): void {
                    $visitor->refresh();

                    if ($visitor->exit_date !== null) {
                        return;
                    }

                    $task = $this->resolveTaskForVisitor($visitor);
                    $activePermitIds = $this->resolveActiveOneTimePermitIds($visitor);
                    $effectiveExitAt = $this->normalizeExitTimeForVisitor($visitor, $exitAt);

                    $this->visitorFlowService->closeVisitorExit($visitor, null, $effectiveExitAt);

                    $visitor->refresh();
                    $this->appendManualComment($visitor, $effectiveExitAt);

                    $summary['processed']++;

                    if ($task && $completedStatusId !== null) {
                        $task->refresh();
                        if ((int) $task->status_id === (int) $completedStatusId && $task->end_date !== null) {
                            $summary['tasks_completed']++;
                        }
                    }

                    if ($inactiveStatusId !== null && !empty($activePermitIds)) {
                        $summary['permits_deactivated'] += EntryPermit::query()
                            ->whereIn('id', $activePermitIds)
                            ->where('status_id', $inactiveStatusId)
                            ->count();
                    }
                });
            } catch (\Throwable $exception) {
                $summary['failed'][] = [
                    'visitor_id' => $visitor->id,
                    'plate_number' => $visitor->plate_number,
                    'message' => $exception->getMessage(),
                ];

                Log::error('ForceCloseVisitors failed', [
                    'visitor_id' => $visitor->id,
                    'message' => $exception->getMessage(),
                ]);
            }
        }

        $this->newLine();
        $this->info('Обработано визитов: ' . $summary['processed']);
        $this->info('Завершено задач: ' . $summary['tasks_completed']);
        $this->info('Деактивировано разовых пропусков: ' . $summary['permits_deactivated']);

        if (!empty($summary['failed'])) {
            $this->newLine();
            $this->error('Не удалось обработать ' . count($summary['failed']) . ' визит(ов):');
            foreach ($summary['failed'] as $failed) {
                $this->line('#' . $failed['visitor_id'] . ' [' . ($failed['plate_number'] ?: 'UNKNOWN') . '] ' . $failed['message']);
            }

            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    private function hasScopeFilters(): bool
    {
        return (bool) $this->option('all')
            || !empty(array_filter($this->asIntArray($this->option('visitor-id'))))
            || !empty(array_filter($this->asIntArray($this->option('truck-id'))))
            || !empty(array_filter($this->asStringArray($this->option('plate'))))
            || filled($this->option('yard-id'))
            || filled($this->option('hours'))
            || filled($this->option('entered-before'));
    }

    private function buildVisitorQuery()
    {
        $query = Visitor::query()
            ->with(['yard', 'truck'])
            ->whereNull('exit_date')
            ->where('confirmation_status', Visitor::CONFIRMATION_CONFIRMED);

        $onTerritoryStatusId = $this->statusCache->getId('on_territory');
        if ($onTerritoryStatusId !== null) {
            $query->where('status_id', $onTerritoryStatusId);
        }

        $visitorIds = $this->asIntArray($this->option('visitor-id'));
        if (!empty($visitorIds)) {
            $query->whereIn('id', $visitorIds);
        }

        $truckIds = $this->asIntArray($this->option('truck-id'));
        if (!empty($truckIds)) {
            $query->whereIn('truck_id', $truckIds);
        }

        $plates = $this->asStringArray($this->option('plate'));
        if (!empty($plates)) {
            $query->where(function ($builder) use ($plates): void {
                foreach ($plates as $plate) {
                    $builder->orWhere('plate_number', 'like', '%' . $plate . '%')
                        ->orWhere('original_plate_number', 'like', '%' . $plate . '%');
                }
            });
        }

        if (filled($this->option('yard-id'))) {
            $query->where('yard_id', (int) $this->option('yard-id'));
        }

        if (filled($this->option('hours'))) {
            $query->where('entry_date', '<=', now()->subHours((int) $this->option('hours')));
        }

        if (filled($this->option('entered-before'))) {
            $query->where('entry_date', '<=', Carbon::parse((string) $this->option('entered-before')));
        }

        return $query;
    }

    private function resolveExitTime(): Carbon
    {
        $rawExitTime = $this->option('exit-time');

        return $rawExitTime
            ? Carbon::parse((string) $rawExitTime)
            : now();
    }

    private function normalizeExitTimeForVisitor(Visitor $visitor, Carbon $exitAt): Carbon
    {
        if ($visitor->entry_date instanceof Carbon && $exitAt->lessThan($visitor->entry_date)) {
            return $visitor->entry_date->copy();
        }

        return $exitAt->copy();
    }

    private function appendManualComment(Visitor $visitor, Carbon $effectiveExitAt): void
    {
        $manualNote = '[MANUAL] Визит закрыт командой dss:force-close-visitors ' . $effectiveExitAt->format('d.m.Y H:i');
        $extraNote = trim((string) $this->option('note'));
        if ($extraNote !== '') {
            $manualNote .= ' | ' . $extraNote;
        }

        $currentComment = trim((string) $visitor->comment);
        $visitor->comment = $currentComment !== ''
            ? $currentComment . PHP_EOL . $manualNote
            : $manualNote;
        $visitor->save();
    }

    private function makePreviewRow(Visitor $visitor): array
    {
        $task = $this->resolveTaskForVisitor($visitor);
        $permit = $this->resolvePermitForVisitor($visitor);

        return [
            $visitor->id,
            $visitor->plate_number ?: ($visitor->truck?->plate_number ?? 'UNKNOWN'),
            $visitor->yard?->name ?? ('#' . $visitor->yard_id),
            optional($visitor->entry_date)->format('Y-m-d H:i:s') ?? '-',
            $task?->id ? '#' . $task->id : '-',
            $permit?->id ? '#' . $permit->id : '-',
            mb_strimwidth(trim((string) $visitor->comment) ?: '-', 0, 60, '...'),
        ];
    }

    private function resolveTaskForVisitor(Visitor $visitor): ?Task
    {
        if ($visitor->task_id) {
            return Task::find($visitor->task_id);
        }

        return $this->resolvePermitForVisitor($visitor)?->task;
    }

    private function resolvePermitForVisitor(Visitor $visitor): ?EntryPermit
    {
        if ($visitor->entry_permit_id) {
            return EntryPermit::query()->with('task')->find($visitor->entry_permit_id);
        }

        if (!$visitor->truck_id || !$visitor->yard_id) {
            return null;
        }

        return EntryPermit::query()
            ->with('task')
            ->where('truck_id', $visitor->truck_id)
            ->where('yard_id', $visitor->yard_id)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->first();
    }

    private function resolveActiveOneTimePermitIds(Visitor $visitor): array
    {
        $activeStatusId = $this->statusCache->getId('active');
        if ($activeStatusId === null || !$visitor->truck_id || !$visitor->yard_id) {
            return [];
        }

        return EntryPermit::query()
            ->where('truck_id', $visitor->truck_id)
            ->where('yard_id', $visitor->yard_id)
            ->where('one_permission', true)
            ->where('status_id', $activeStatusId)
            ->pluck('id')
            ->all();
    }

    private function asIntArray(mixed $value): array
    {
        return Collection::wrap($value)
            ->map(static fn ($item) => (int) $item)
            ->filter(static fn (int $item) => $item > 0)
            ->values()
            ->all();
    }

    private function asStringArray(mixed $value): array
    {
        return Collection::wrap($value)
            ->map(static fn ($item) => trim((string) $item))
            ->filter()
            ->values()
            ->all();
    }
}