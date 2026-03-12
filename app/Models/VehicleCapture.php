<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VehicleCapture extends Model
{
   
     protected $fillable = [
        'devaice_id',
        'truck_id',
        'plateNo',
        'capture_direction',
        'capture_key',
        'capturePicture',
        'plateNoPicture',
        'vehicleBrandName',
        'captureTime',
        'vehicleColorName',
        'vehicleModelName',
        'views',
        'imageDownload',
        'local_capturePicture',
        'processed_at',
    ];

    protected $casts = [
        'processed_at' => 'datetime',
    ];
}
