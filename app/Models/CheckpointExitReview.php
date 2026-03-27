<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CheckpointExitReview extends Model
{
    protected $fillable = [
        'vehicle_capture_id',
        'device_id',
        'checkpoint_id',
        'yard_id',
        'truck_id',
        'plate_number',
        'normalized_plate',
        'recognition_confidence',
        'capture_time',
        'status',
        'note',
        'resolved_at',
        'resolved_by_user_id',
        'resolved_visitor_id',
    ];

    protected $casts = [
        'capture_time' => 'datetime',
        'resolved_at' => 'datetime',
        'recognition_confidence' => 'float',
    ];
}
