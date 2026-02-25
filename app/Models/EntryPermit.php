<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EntryPermit extends Model
{
    protected $fillable = [
        'truck_id',
        'yard_id',
        'user_id',           // ID водителя
        'granted_by_user_id', // Кто выдал разрешение (null если из 1С)
        'task_id',
        'one_permission',    // true = разовое, false = постоянное
        'weighing_required', // Требуется ли взвешивание по этому разрешению
        'begin_date',
        'end_date',
        'status_id',
        'comment',
        // Гостевые поля
        'is_guest',
        'guest_name',
        'guest_company',
        'guest_destination',
        'guest_purpose',
        'guest_phone',
    ];

    protected $casts = [
        'one_permission' => 'boolean',
        'weighing_required' => 'boolean',
        'is_guest' => 'boolean',
        'begin_date' => 'datetime',
        'end_date' => 'datetime',
    ];

    // Связь с ТС
    public function truck()
    {
        return $this->belongsTo(Truck::class);
    }

    // Связь с двором
    public function yard()
    {
        return $this->belongsTo(Yard::class);
    }

    // Связь с водителем
    public function driver()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    // Связь с тем, кто выдал разрешение
    public function grantedBy()
    {
        return $this->belongsTo(User::class, 'granted_by_user_id');
    }

    // Связь с заданием
    public function task()
    {
        return $this->belongsTo(Task::class);
    }

    // Связь со статусом
    public function status()
    {
        return $this->belongsTo(Status::class);
    }
}
