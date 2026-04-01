<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Truck extends Model
{
    protected $fillable = [
        'name',
            'user_id',
            'counterparty_id',
            'truck_brand_id',
            'truck_category_id',
            'vin',
            'own',
            'vip_level',
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

    public static function normalizePlateNumber(?string $plateNumber): ?string
    {
        if ($plateNumber === null) {
            return null;
        }

        $normalized = preg_replace('/[\s-]+/u', '', trim($plateNumber));

        if ($normalized === null || $normalized === '') {
            return null;
        }

        return mb_strtoupper($normalized, 'UTF-8');
    }

    public function setPlateNumberAttribute($value): void
    {
        $this->attributes['plate_number'] = self::normalizePlateNumber($value);
    }

    public function setTrailerNumberAttribute($value): void
    {
        $this->attributes['trailer_number'] = self::normalizePlateNumber($value);
    }

    public function user()
    {
        return $this->belongsToMany(User::class, 'truck_user', 'user_id', 'truck_id')->withPivot('assigned_date');
    }

    public function counterparty()
    {
        return $this->belongsTo(Counterparty::class);
    }

    public function truckCategory()
    {
        return $this->belongsTo(TruckCategory::class);
    }
}
