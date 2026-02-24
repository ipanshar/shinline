<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WeighingRequirement extends Model
{
    // Типы требований
    public const TYPE_ENTRY = 'entry';
    public const TYPE_EXIT = 'exit';
    public const TYPE_BOTH = 'both';

    // Причины требования
    public const REASON_YARD_POLICY = 'yard_policy';
    public const REASON_TRUCK_CATEGORY = 'truck_category';
    public const REASON_TRUCK_FLAG = 'truck_flag';
    public const REASON_PERMIT = 'permit';
    public const REASON_TASK = 'task';
    public const REASON_MANUAL = 'manual';

    // Статусы
    public const STATUS_PENDING = 'pending';
    public const STATUS_ENTRY_DONE = 'entry_done';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_SKIPPED = 'skipped';

    protected $fillable = [
        'yard_id',
        'visitor_id',
        'truck_id',
        'task_id',
        'plate_number',
        'required_type',
        'reason',
        'status',
        'entry_weighing_id',
        'exit_weighing_id',
        'skipped_reason',
        'skipped_by_user_id',
        'skipped_at',
    ];

    protected $casts = [
        'skipped_at' => 'datetime',
    ];

    // Связи
    public function yard()
    {
        return $this->belongsTo(Yard::class);
    }

    public function visitor()
    {
        return $this->belongsTo(Visitor::class);
    }

    public function truck()
    {
        return $this->belongsTo(Truck::class);
    }

    public function task()
    {
        return $this->belongsTo(Task::class);
    }

    public function entryWeighing()
    {
        return $this->belongsTo(Weighing::class, 'entry_weighing_id');
    }

    public function exitWeighing()
    {
        return $this->belongsTo(Weighing::class, 'exit_weighing_id');
    }

    public function skippedByUser()
    {
        return $this->belongsTo(User::class, 'skipped_by_user_id');
    }

    // Скоупы
    public function scopePending($query)
    {
        return $query->where('status', self::STATUS_PENDING);
    }

    public function scopeEntryDone($query)
    {
        return $query->where('status', self::STATUS_ENTRY_DONE);
    }

    public function scopeNeedsEntry($query)
    {
        return $query->where('status', self::STATUS_PENDING)
            ->whereIn('required_type', [self::TYPE_ENTRY, self::TYPE_BOTH]);
    }

    public function scopeNeedsExit($query)
    {
        return $query->whereIn('status', [self::STATUS_PENDING, self::STATUS_ENTRY_DONE])
            ->whereIn('required_type', [self::TYPE_EXIT, self::TYPE_BOTH]);
    }

    public function scopeByYard($query, $yardId)
    {
        return $query->where('yard_id', $yardId);
    }

    // Методы
    public function isPending(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }

    public function isCompleted(): bool
    {
        return $this->status === self::STATUS_COMPLETED;
    }

    public function isSkipped(): bool
    {
        return $this->status === self::STATUS_SKIPPED;
    }

    public function needsEntryWeighing(): bool
    {
        return $this->status === self::STATUS_PENDING 
            && in_array($this->required_type, [self::TYPE_ENTRY, self::TYPE_BOTH]);
    }

    public function needsExitWeighing(): bool
    {
        return in_array($this->status, [self::STATUS_PENDING, self::STATUS_ENTRY_DONE])
            && in_array($this->required_type, [self::TYPE_EXIT, self::TYPE_BOTH]);
    }

    /**
     * Записать въездное взвешивание
     */
    public function recordEntryWeighing(Weighing $weighing): void
    {
        $this->entry_weighing_id = $weighing->id;
        
        if ($this->required_type === self::TYPE_ENTRY) {
            $this->status = self::STATUS_COMPLETED;
        } else {
            $this->status = self::STATUS_ENTRY_DONE;
        }
        
        $this->save();
    }

    /**
     * Записать выездное взвешивание
     */
    public function recordExitWeighing(Weighing $weighing): void
    {
        $this->exit_weighing_id = $weighing->id;
        $this->status = self::STATUS_COMPLETED;
        $this->save();
    }

    /**
     * Пропустить взвешивание
     */
    public function skip(int $userId, string $reason): void
    {
        $this->status = self::STATUS_SKIPPED;
        $this->skipped_by_user_id = $userId;
        $this->skipped_reason = $reason;
        $this->skipped_at = now();
        $this->save();
    }

    /**
     * Получить текст причины
     */
    public function getReasonText(): string
    {
        return match ($this->reason) {
            self::REASON_YARD_POLICY => 'Политика двора',
            self::REASON_TRUCK_CATEGORY => 'Категория ТС',
            self::REASON_TRUCK_FLAG => 'Флаг ТС',
            self::REASON_PERMIT => 'По разрешению',
            self::REASON_TASK => 'По заданию',
            self::REASON_MANUAL => 'Вручную',
            default => 'Неизвестно',
        };
    }

    /**
     * Рассчитать разницу веса
     */
    public function getWeightDifference(): ?float
    {
        if (!$this->entry_weighing_id || !$this->exit_weighing_id) {
            return null;
        }

        $entry = $this->entryWeighing;
        $exit = $this->exitWeighing;

        if (!$entry || !$exit) {
            return null;
        }

        return $exit->weight - $entry->weight;
    }
}
