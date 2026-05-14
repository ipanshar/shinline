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
        self::STATUS_REVIEWING => 'На рассмотрении',
        self::STATUS_APPROVED => 'Одобрена',
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
            ['title' => 'На рассмотрении', 'time' => now()->toIso8601String()],
            ['title' => 'Одобрена', 'time' => null],
            ['title' => 'Отклонена', 'time' => null],
        ];
    }

    public static function normalizeWorkflowStatus(?string $status): string
    {
        return match ($status) {
            self::STATUS_APPROVED,
            self::STATUS_IN_PROGRESS,
            self::STATUS_COMPLETED => self::STATUS_APPROVED,
            self::STATUS_REJECTED => self::STATUS_REJECTED,
            default => self::STATUS_REVIEWING,
        };
    }

    public static function labelFor(?string $status): string
    {
        $normalizedStatus = self::normalizeWorkflowStatus($status);

        return self::STATUS_LABELS[$normalizedStatus] ?? $normalizedStatus;
    }
}
