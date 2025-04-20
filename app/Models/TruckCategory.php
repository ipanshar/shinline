<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TruckCategory extends Model
{
    protected $fillable = [
        'name',
        'ru_name',
    ];

    public function trucks()
    {
        return $this->hasMany(Truck::class);
    }
}
