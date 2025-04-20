<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TruckModel extends Model
{
        protected $fillable = [
        'name',
        'truck_brand_id',
        'truck_category_id',
        
    ];
    public function trucks()
    {
        return $this->hasMany(Truck::class);
    }


}
