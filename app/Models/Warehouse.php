<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Warehouse extends Model
{
    protected $table = 'warehouses';

    protected $fillable = [
        'name',
        'address',
        'phone',
        'email',
        'coordinates',
        'yard_id',
        'barcode',
    ];

    public function gates()
    {
        return $this->hasMany(WarehouseGates::class);
    }

    public function getCoordinatesAttribute($value)
    {
        return json_decode($value);
    }

    public function setCoordinatesAttribute($value)
    {
        $this->attributes['coordinates'] = json_encode($value);
    }
}
