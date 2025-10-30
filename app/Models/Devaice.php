<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Devaice extends Model
{
     protected $fillable = [
        'channelId',
        'channelName',
        'checkpoint_id',
        'type',
        'zone_id',
    ];

    // Связь с зоной
    public function zone()
    {
        return $this->belongsTo(Zone::class);
    }
}
