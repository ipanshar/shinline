<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Visitor extends Model
{
    protected $fillable = [
        'name',
        'plate_number',
        'original_plate_number',
        'phone',
        'viche_color',
        'truck_category_id',
        'truck_brand_id',
        'company',
        'exit_date',
        'entry_date',
        'user_id',
        'status_id',
        'confirmation_status',
        'confirmed_by_user_id',
        'confirmed_at',
        'recognition_confidence',
        'yard_id',
        'truck_id',
        'task_id',
        'entrance_device_id',
        'exit_device_id',
        'entry_permit_id',
    ];

    protected $casts = [
        'entry_date' => 'datetime',
        'exit_date' => 'datetime',
        'confirmed_at' => 'datetime',
    ];

    /**
     * Константы статусов подтверждения
     */
    const CONFIRMATION_PENDING = 'pending';
    const CONFIRMATION_CONFIRMED = 'confirmed';
    const CONFIRMATION_REJECTED = 'rejected';

    /**
     * Проверка - ожидает подтверждения
     */
    public function isPending(): bool
    {
        return $this->confirmation_status === self::CONFIRMATION_PENDING;
    }

    /**
     * Проверка - подтверждён
     */
    public function isConfirmed(): bool
    {
        return $this->confirmation_status === self::CONFIRMATION_CONFIRMED;
    }

    /**
     * Scope для получения ожидающих подтверждения
     */
    public function scopePending($query)
    {
        return $query->where('confirmation_status', self::CONFIRMATION_PENDING);
    }

    /**
     * Scope для получения подтверждённых
     */
    public function scopeConfirmed($query)
    {
        return $query->where('confirmation_status', self::CONFIRMATION_CONFIRMED);
    }

    public function truckCategory()
    {
        return $this->belongsTo(TruckCategory::class);
    }

    public function truckBrand()
    {
        return $this->belongsTo(TruckBrand::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function status()
    {
        return $this->belongsTo(Status::class);
    }

    public function yard()
    {
        return $this->belongsTo(Yard::class);
    }
    
    public function truck()
    {
        return $this->belongsTo(Truck::class);
    }

    public function task()
    {
        return $this->belongsTo(Task::class);
    }

    /**
     * Получить активное разрешение на въезд для данного visitor
     * Ищем по truck_id и yard_id
     */
    public function entryPermit()
    {
        return $this->hasOne(EntryPermit::class, 'truck_id', 'truck_id')
            ->where('yard_id', $this->yard_id)
            ->where('status_id', function($query) {
                $query->select('id')
                    ->from('statuses')
                    ->where('key', 'active')
                    ->limit(1);
            })
            ->latest();
    }

    /**
     * Получить активное разрешение для visitor (метод для удобства)
     */
    public function getActivePermit()
    {
        return EntryPermit::where('truck_id', $this->truck_id)
            ->where('yard_id', $this->yard_id)
            ->whereHas('status', function($query) {
                $query->where('key', 'active');
            })
            ->orderBy('created_at', 'desc')
            ->first();
    }
}
