<?php

namespace App\Models\Greenlog;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Location extends Model
{
    protected $table = 'greenlog_locations';

    protected $appends = [
        'map_x',
        'map_y',
    ];

    protected $fillable = [
        'company_key',
        'created_by_user_id',
        'building',
        'floor',
        'room',
        'factory_zone',
        'sector',
        'description',
        'map_x',
        'map_y',
        'position_x',
        'position_y',
        'type',
        'map_image_path',
        'marker_size',
        'map_shape',
        'map_style',
        'map_width',
        'map_height',
        'map_polygon',
        'parent_id',
    ];

    protected function casts(): array
    {
        return [
            'position_x' => 'float',
            'position_y' => 'float',
            'marker_size' => 'integer',
            'map_style' => 'array',
            'map_width' => 'float',
            'map_height' => 'float',
            'map_polygon' => 'array',
        ];
    }

    public function getMapXAttribute(): ?float
    {
        return $this->position_x;
    }

    public function getMapYAttribute(): ?float
    {
        return $this->position_y;
    }

    public function setMapXAttribute(float | int | string | null $value): void
    {
        $this->attributes['position_x'] = $value;
    }

    public function setMapYAttribute(float | int | string | null $value): void
    {
        $this->attributes['position_y'] = $value;
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function plants(): HasMany
    {
        return $this->hasMany(Plant::class, 'location_id');
    }

    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class, 'location_id');
    }
}
