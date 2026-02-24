<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Weighing extends Model
{
    // Типы взвешивания
    public const TYPE_ENTRY = 'entry';
    public const TYPE_EXIT = 'exit';
    public const TYPE_INTERMEDIATE = 'intermediate';

    protected $fillable = [
        'yard_id',
        'plate_number',
        'weighing_type',
        'weight',
        'weighed_at',
        'visitor_id',
        'truck_id',
        'task_id',
        'requirement_id',
        'operator_user_id',
        'notes',
    ];

    protected $casts = [
        'weight' => 'decimal:2',
        'weighed_at' => 'datetime',
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

    public function operator()
    {
        return $this->belongsTo(User::class, 'operator_user_id');
    }

    public function requirement()
    {
        return $this->belongsTo(WeighingRequirement::class, 'requirement_id');
    }

    // Скоупы
    public function scopeByYard($query, $yardId)
    {
        return $query->where('yard_id', $yardId);
    }

    public function scopeByTruck($query, $truckId)
    {
        return $query->where('truck_id', $truckId);
    }

    public function scopeByVisitor($query, $visitorId)
    {
        return $query->where('visitor_id', $visitorId);
    }

    public function scopeEntryWeighings($query)
    {
        return $query->where('weighing_type', self::TYPE_ENTRY);
    }

    public function scopeExitWeighings($query)
    {
        return $query->where('weighing_type', self::TYPE_EXIT);
    }

    public function scopeToday($query)
    {
        return $query->whereDate('weighed_at', today());
    }

    // Методы
    public function isEntry(): bool
    {
        return $this->weighing_type === self::TYPE_ENTRY;
    }

    public function isExit(): bool
    {
        return $this->weighing_type === self::TYPE_EXIT;
    }

    /**
     * Получить парное взвешивание (entry <-> exit)
     */
    public function getPairedWeighing(): ?Weighing
    {
        $pairedType = $this->isEntry() ? self::TYPE_EXIT : self::TYPE_ENTRY;

        // Сначала пытаемся найти по requirement_id (самый надёжный способ)
        if ($this->requirement_id) {
            $paired = self::where('requirement_id', $this->requirement_id)
                ->where('weighing_type', $pairedType)
                ->first();
            if ($paired) return $paired;
        }

        // Затем по visitor_id
        if ($this->visitor_id) {
            $paired = self::where('visitor_id', $this->visitor_id)
                ->where('weighing_type', $pairedType)
                ->first();
            if ($paired) return $paired;
        }

        // Затем по truck_id + yard_id + сегодня
        if ($this->truck_id) {
            $paired = self::where('truck_id', $this->truck_id)
                ->where('yard_id', $this->yard_id)
                ->where('weighing_type', $pairedType)
                ->whereDate('weighed_at', $this->weighed_at->toDateString())
                ->first();
            if ($paired) return $paired;
        }

        // В крайнем случае по plate_number + yard_id + сегодня
        if ($this->plate_number) {
            return self::where('plate_number', $this->plate_number)
                ->where('yard_id', $this->yard_id)
                ->where('weighing_type', $pairedType)
                ->whereDate('weighed_at', $this->weighed_at->toDateString())
                ->first();
        }

        return null;
    }

    /**
     * Рассчитать разницу веса (для выездного взвешивания)
     */
    public function getWeightDifference(): ?float
    {
        $paired = $this->getPairedWeighing();
        
        if (!$paired) {
            return null;
        }

        if ($this->isExit()) {
            return $this->weight - $paired->weight;
        } else {
            return $paired->weight - $this->weight;
        }
    }
}
