<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UtilizationRequest extends Model
{
    public const STATUS_NEW = 'new';
    public const STATUS_REVIEWING = 'reviewing';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_IN_PROGRESS = 'in_progress';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_REJECTED = 'rejected';

    public const STATUS_LABELS = [
        self::STATUS_NEW => 'Новая',
        self::STATUS_REVIEWING => 'На рассмотрении',
        self::STATUS_APPROVED => 'Одобрена',
        self::STATUS_IN_PROGRESS => 'В работе',
        self::STATUS_COMPLETED => 'Выполнена',
        self::STATUS_REJECTED => 'Отклонена',
    ];

    protected $fillable = [
        'user_id',
        'truck_id',
        'driver_name',
        'requested_start',
        'requested_end',
        'terminal',
        'zone',
        'gate',
        'address',
        'comment',
        'status',
        'photos',
        'timeline',
        'source',
        'meta',
    ];

    protected $casts = [
        'requested_start' => 'datetime',
        'requested_end' => 'datetime',
        'photos' => 'array',
        'timeline' => 'array',
        'meta' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function truck(): BelongsTo
    {
        return $this->belongsTo(Truck::class);
    }

    public static function buildInitialTimeline(): array
    {
        return [
            ['title' => 'Заявка принята', 'time' => now()->toIso8601String()],
            ['title' => 'На рассмотрении', 'time' => null],
            ['title' => 'Одобрена', 'time' => null],
            ['title' => 'В работе', 'time' => null],
            ['title' => 'Выполнена', 'time' => null],
        ];
    }
}
