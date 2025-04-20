<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TrailerModel extends Model
{
    protected $fillable = [
        'name',
        'trailer_type_id',
    ];
    public function trailerType()
    {
        return $this->belongsTo(Truck::class);
    }
    public function truks()
    {
        return $this->hasMany(Truck::class);
    }


}
