<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TruckZoneHistory extends Model
{
    protected $table = 'truck_zone_history';
    
    protected $fillable = [
        'truck_id',
        'device_id',
        'zone_id',
        'task_id',
        'entry_time',
        'exit_time',
    ];

    protected $casts = [
        'entry_time' => 'datetime',
        'exit_time' => 'datetime',
    ];

    // Связи
    public function truck()
    {
        return $this->belongsTo(Truck::class);
    }

    public function device()
    {
        return $this->belongsTo(Devaice::class);
    }

    public function zone()
    {
        return $this->belongsTo(Zone::class);
    }

    public function task()
    {
        return $this->belongsTo(Task::class);
    }

    public function scopeActive($query)
    {
        return $query->whereNull('exit_time');
    }

    public function scopeForTruck($query, int $truckId)
    {
        return $query->where('truck_id', $truckId);
    }

    public function isActive(): bool
    {
        return $this->exit_time === null;
    }
}
