<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DssParkingPermit extends Model
{
    protected $fillable = [
        'entry_permit_id',
        'truck_id',
        'yard_id',
        'plate_number',
        'remote_vehicle_id',
        'status',
        'person_id',
        'parking_lot_ids',
        'entrance_group_ids',
        'request_payload',
        'response_payload',
        'error_message',
        'synced_at',
        'revoked_at',
    ];

    protected $casts = [
        'parking_lot_ids' => 'array',
        'entrance_group_ids' => 'array',
        'request_payload' => 'array',
        'response_payload' => 'array',
        'synced_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public function entryPermit()
    {
        return $this->belongsTo(EntryPermit::class);
    }

    public function truck()
    {
        return $this->belongsTo(Truck::class);
    }

    public function yard()
    {
        return $this->belongsTo(Yard::class);
    }
}