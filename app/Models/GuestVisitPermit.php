<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GuestVisitPermit extends Model
{
    use HasFactory;

    public $timestamps = false;

    protected $fillable = [
        'guest_visit_id',
        'entry_permit_id',
        'permit_subject_type',
        'guest_visit_vehicle_id',
        'created_at',
        'revoked_at',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public function isRevoked(): bool
    {
        return $this->revoked_at !== null;
    }

    public function guestVisit()
    {
        return $this->belongsTo(GuestVisit::class);
    }

    public function entryPermit()
    {
        return $this->belongsTo(EntryPermit::class);
    }

    public function vehicle()
    {
        return $this->belongsTo(GuestVisitVehicle::class, 'guest_visit_vehicle_id');
    }
}