<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Task extends Model
{
    protected $fillable = [
        'name',
        'user_id',
        'status_id',
        'truck_id',
        'avtor',
        'description',
        'address',
        'phone',
        'plan_date',
        'begin_date',
        'end_date',
        'yard_id',
        'create_user_id',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function status()
    {
        return $this->belongsTo(Status::class);
    }

    public function truck()
    {
        return $this->belongsTo(Truck::class);
    }
    
}
