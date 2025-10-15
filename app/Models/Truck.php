<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Truck extends Model
{
    protected $fillable = [
        'name',
            'user_id',
            'truck_brand_id',
            'truck_category_id',
            'vin',
            'own',
            'plate_number',
            'truck_model_id',
            'color',
            'trailer_model_id',
            'trailer_type_id',
            'trailer_number',
            'trailer_height',
            'trailer_width',
            'trailer_length',
            'trailer_load_capacity'

    ];

    public function user()
    {
        return $this->belongsToMany(User::class, 'truck_user', 'user_id', 'truck_id')->withPivot('assigned_date');
    }
}
