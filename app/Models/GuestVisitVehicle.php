<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GuestVisitVehicle extends Model
{
    use HasFactory;

    protected $fillable = [
        'guest_visit_id',
        'truck_id',
        'plate_number',
        'brand',
        'model',
        'color',
        'comment',
    ];

    public function guestVisit()
    {
        return $this->belongsTo(GuestVisit::class);
    }

    public function truck()
    {
        return $this->belongsTo(Truck::class);
    }

    public function permitLinks()
    {
        return $this->hasMany(GuestVisitPermit::class);
    }
}