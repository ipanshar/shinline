<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SpectechRequest extends Model
{
    protected $fillable = [
        'user_id',
        'truck_id',
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
    ];

    protected $casts = [
        'photos'     => 'array',
        'timeline'   => 'array',
        'start_date' => 'date',
        'end_date'   => 'date',
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

    /**
     * Сформировать начальный timeline при создании заявки
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

