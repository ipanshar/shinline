<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\User;
use App\Models\Task;
use App\Models\Warehouse;
use App\Models\WarehouseGates;

class TaskLoading extends Model
{
    protected $fillable = [
        'task_id',
        'warehouse_id',
        'warehouse_gate_plan_id',
        'warehouse_gate_fact_id',
        'plane_date',
        'fact_date',
        'arrival_at',
        'departure_at',
        'arrival_user_id',
        'departure_user_id',
        'sort_order',
        'description',
        'barcode',
        'document',
        'comment',        
    ];

    /**
     * Приведение типов для дат
     */
    protected $casts = [
        'plane_date' => 'datetime',
        'fact_date' => 'datetime',
        'arrival_at' => 'datetime',
        'departure_at' => 'datetime',
    ];

    /**
     * Связь с задачей
     */
    public function task(): BelongsTo
    {
        return $this->belongsTo(Task::class);
    }

    /**
     * Связь со складом
     */
    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    /**
     * Связь с плановыми воротами
     */
    public function planGate(): BelongsTo
    {
        return $this->belongsTo(WarehouseGates::class, 'warehouse_gate_plan_id');
    }

    /**
     * Связь с фактическими воротами
     */
    public function factGate(): BelongsTo
    {
        return $this->belongsTo(WarehouseGates::class, 'warehouse_gate_fact_id');
    }

    /**
     * Пользователь, зафиксировавший прибытие
     */
    public function arrivalUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'arrival_user_id');
    }

    /**
     * Пользователь, зафиксировавший убытие
     */
    public function departureUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'departure_user_id');
    }

    /**
     * Проверяет, прибыло ли ТС на склад
     */
    public function hasArrived(): bool
    {
        return $this->arrival_at !== null;
    }

    /**
     * Проверяет, убыло ли ТС со склада
     */
    public function hasDeparted(): bool
    {
        return $this->departure_at !== null;
    }

    /**
     * Вычисляет время нахождения на складе в минутах
     */
    public function getDurationInMinutes(): ?int
    {
        if (!$this->arrival_at || !$this->departure_at) {
            return null;
        }
        
        return $this->arrival_at->diffInMinutes($this->departure_at);
    }

    /**
     * Форматированное время нахождения на складе
     */
    public function getFormattedDuration(): ?string
    {
        $minutes = $this->getDurationInMinutes();
        
        if ($minutes === null) {
            return null;
        }

        $hours = intdiv($minutes, 60);
        $mins = $minutes % 60;

        if ($hours > 0) {
            return sprintf('%d ч %d мин', $hours, $mins);
        }

        return sprintf('%d мин', $mins);
    }

    /**
     * Scope для получения записей с прибытием за период
     */
    public function scopeArrivedBetween($query, $from, $to)
    {
        return $query->whereBetween('arrival_at', [$from, $to]);
    }

    /**
     * Scope для получения записей без убытия (ТС на складе)
     */
    public function scopeCurrentlyAtWarehouse($query)
    {
        return $query->whereNotNull('arrival_at')->whereNull('departure_at');
    }
}

