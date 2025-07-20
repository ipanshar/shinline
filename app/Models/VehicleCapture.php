<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VehicleCapture extends Model
{
   
     protected $fillable = [
        'devaice_id',
        'truck_id',
        'plateNo',
        'capturePicture',
        'plateNoPicture',
        'vehicleBrandName',
        'captureTime',
        'vehicleColorName',
        'vehicleModelName',
        'views',
        'imageDownload',
    ];        
}
