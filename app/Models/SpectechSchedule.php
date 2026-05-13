<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class SpectechSchedule extends Model
{
    protected $fillable = [
        'user_id',
        'truck_id',
        'equipment_type_key',
        'equipment_type_label',
        'assigned_truck_name',
        'scheduled_start',
        'scheduled_end',
        'purpose',
        'address',
        'notes',
        'status',
        'conflict_info',
    ];

    protected $casts = [
        'scheduled_start' => 'datetime',
        'scheduled_end'   => 'datetime',
        'conflict_info'   => 'array',
    ];

    const STATUS_PENDING     = 'pending';
    const STATUS_CONFIRMED   = 'confirmed';
    const STATUS_IN_PROGRESS = 'in_progress';
    const STATUS_DONE        = 'done';
    const STATUS_CANCELLED   = 'cancelled';

    const STATUS_LABELS = [
        'pending'     => 'Ожидает',
        'confirmed'   => 'Подтверждено',
        'in_progress' => 'В работе',
        'done'        => 'Выполнено',
        'cancelled'   => 'Отменено',
    ];

    const ACTIVE_STATUSES = ['pending', 'confirmed', 'in_progress'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function truck(): BelongsTo
    {
        return $this->belongsTo(Truck::class);
    }

    public function spectechRequest(): HasOne
    {
        return $this->hasOne(SpectechRequest::class, 'schedule_id');
    }

    /**
     * Проверить, не пересекается ли данная техника с запрошенным периодом
     */
    public static function isTruckOccupied(int $truckId, string $start, string $end, ?int $excludeId = null): bool
    {
        return self::where('truck_id', $truckId)
            ->whereIn('status', self::ACTIVE_STATUSES)
            ->where('scheduled_start', '<', $end)
            ->where('scheduled_end', '>', $start)
            ->when($excludeId, fn($q) => $q->where('id', '!=', $excludeId))
            ->exists();
    }

    /**
     * Получить ближайшее окончание занятости для техники
     */
    public static function getNextFreeAt(int $truckId, string $start, string $end, ?int $excludeId = null): ?string
    {
        $overlap = self::where('truck_id', $truckId)
            ->whereIn('status', self::ACTIVE_STATUSES)
            ->where('scheduled_start', '<', $end)
            ->where('scheduled_end', '>', $start)
            ->when($excludeId, fn($q) => $q->where('id', '!=', $excludeId))
            ->orderBy('scheduled_end', 'desc')
            ->first();

        return $overlap?->scheduled_end?->toIso8601String();
    }
}
