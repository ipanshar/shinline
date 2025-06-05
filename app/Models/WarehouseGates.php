<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WarehouseGates extends Model
{
    protected $table = 'warehouse_gates';

    protected $fillable = [
        'warehouse_id',
        'name',
        'address',
        'phone',
        'email',
        'coordinates',
        'coordinates_svg',
        'status',
        'code',
    ];

    public function warehouse()
    {
        return $this->belongsTo(Warehouse::class);
    }
    public function getCoordinatesAttribute($value)
    {
        return json_decode($value);
    }
    public function setCoordinatesAttribute($value)
    {
        $this->attributes['coordinates'] = json_encode($value);
    }
    public function getCoordinatesSvgAttribute($value)
    {
        return json_decode($value);
    }
    public function setCoordinatesSvgAttribute($value)
    {
        $this->attributes['coordinates_svg'] = json_encode($value);
    }

}
