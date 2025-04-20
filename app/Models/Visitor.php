<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Visitor extends Model
{
    protected $fillable = [
        'name',
        'plate_number',
        'phone',
        'viche_color',
        'truck_category_id',
        'truck_brand_id',
        'company',
        'exit_date',
        'entry_date',
        'user_id',
        'status_id',
        'yard_id',
        'truck_id',
        'task_id',
    ];

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
}
