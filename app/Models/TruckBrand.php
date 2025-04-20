<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TruckBrand extends Model
{
    protected $fillable = [
        'name',
    ];

    public function trucks()
    {
        return $this->hasMany(Truck::class);
    }
    public function truckModels()
    {
        return $this->hasMany(TruckModel::class);
    }
}
