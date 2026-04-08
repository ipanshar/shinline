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
        'local_plateNoPicture',
        'processed_at',
        'dss_alarm_code',
        'dss_alarm_type',
        'dss_alarm_source_code',
        'dss_alarm_source_name',
        'dss_alarm_payload',
        'dss_alarm_detail_payload',
    ];

    protected $casts = [
        'processed_at' => 'datetime',
        'dss_alarm_payload' => 'array',
        'dss_alarm_detail_payload' => 'array',
    ];
}
