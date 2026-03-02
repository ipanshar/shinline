<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Zone extends Model
{
    protected $fillable = [
        'name',
        'description',
        'yard_id',
        'center_lat',
        'center_lng',
        'polygon',
        'color',
    ];

    protected $casts = [
        'polygon' => 'array',
        'center_lat' => 'float',
        'center_lng' => 'float',
    ];
}
