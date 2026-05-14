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

    const STATUS_LABELS = [
        'new'          => 'Новая',
        'departure'    => 'Выезд',
        'on_location'  => 'На объекте',
        'work_started' => 'Работы начаты',
        'completed'    => 'Выполнено',
        'returned'     => 'Возврат',
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
