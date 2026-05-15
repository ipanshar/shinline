<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

class SpectechRequest extends Model
{
    protected $fillable = [
        'user_id',
        'truck_id',
        'driver_name',
        'driver_phone',
        'start_date',
        'end_date',
        'terminal',
        'zone',
        'gate',
        'address',
        'comment',
        'status',
        'photos',
        'timeline',
        'schedule_id',
        'requested_start',
        'requested_end',
        'from_scheduling',
        'conflict_info',
        'cancellation_reason',
        'cancelled_by',
    ];

    protected $casts = [
        'photos'         => 'array',
        'timeline'       => 'array',
        'conflict_info'  => 'array',
        'start_date'     => 'date',
        'end_date'       => 'date',
        'requested_start' => 'datetime',
        'requested_end'  => 'datetime',
        'from_scheduling' => 'boolean',
    ];

    // Статусы
    const STATUS_NEW          = 'new';
    const STATUS_DEPARTURE    = 'departure';
    const STATUS_ON_LOCATION  = 'on_location';
    const STATUS_WORK_STARTED = 'work_started';
    const STATUS_COMPLETED    = 'completed';
    const STATUS_RETURNED     = 'returned';
    const STATUS_CANCELLED    = 'cancelled';

    const CANCELLED_BY_CUSTOMER = 'customer';
    const CANCELLED_BY_OPERATOR = 'operator';

    const STATUS_LABELS = [
        'new'          => 'Новая',
        'departure'    => 'Выезд',
        'on_location'  => 'На объекте',
        'work_started' => 'Работы начаты',
        'completed'    => 'Выполнено',
        'returned'     => 'Возврат',
        'cancelled'    => 'Отменена',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function truck(): BelongsTo
    {
        return $this->belongsTo(Truck::class);
    }

    public function schedule(): BelongsTo
    {
        return $this->belongsTo(SpectechSchedule::class);
    }

    public static function scheduleStatusForRequestStatus(string $status): ?string
    {
        return match ($status) {
            self::STATUS_NEW,
            self::STATUS_DEPARTURE,
            self::STATUS_ON_LOCATION => SpectechSchedule::STATUS_PENDING,
            self::STATUS_WORK_STARTED => SpectechSchedule::STATUS_IN_PROGRESS,
            self::STATUS_COMPLETED,
            self::STATUS_RETURNED => SpectechSchedule::STATUS_DONE,
            self::STATUS_CANCELLED => SpectechSchedule::STATUS_CANCELLED,
            default => null,
        };
    }

    public function syncScheduleStatus(): void
    {
        if (! $this->schedule_id) {
            return;
        }

        $scheduleStatus = self::scheduleStatusForRequestStatus($this->status);
        if ($scheduleStatus === null) {
            return;
        }

        $schedule = $this->relationLoaded('schedule')
            ? $this->schedule
            : $this->schedule()->first();

        if ($schedule && $schedule->status !== $scheduleStatus) {
            $schedule->update(['status' => $scheduleStatus]);
        }
    }

    public function getEffectiveEndAt(): ?Carbon
    {
        if ($this->requested_end instanceof Carbon) {
            return $this->requested_end->copy();
        }

        if ($this->end_date instanceof Carbon) {
            return $this->end_date->copy()->endOfDay();
        }

        return null;
    }

    public function isStatusFrozen(): bool
    {
        $effectiveEndAt = $this->getEffectiveEndAt();

        if (!$effectiveEndAt) {
            return false;
        }

        return now()->greaterThan($effectiveEndAt);
    }

    public function getStatusFreezeReason(): ?string
    {
        return $this->isStatusFrozen()
            ? 'Время заявки истекло'
            : null;
    }

    /**
     * Сформировать начальный timeline при создании заявки.
     */
    public static function buildInitialTimeline(): array
    {
        return [
            ['title' => 'Заявка принята', 'time' => now()->toIso8601String()],
            ['title' => 'Выезд',          'time' => null],
            ['title' => 'На объекте',     'time' => null],
            ['title' => 'Работы начаты',  'time' => null],
            ['title' => 'Выполнено',      'time' => null],
            ['title' => 'Возврат',        'time' => null],
        ];
    }
}
