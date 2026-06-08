<?php

namespace App\Models\Greenlog;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PlantSpecies extends Model
{
    protected $table = 'greenlog_plant_species';

    protected $fillable = [
        'name',
        'category',
        'description',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function plants(): HasMany
    {
        return $this->hasMany(Plant::class, 'species_id');
    }
}

