<?php

namespace App\Models\Greenlog;

use App\Models\User;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class PlantPhoto extends Model
{
    protected $table = 'greenlog_plant_photos';

    protected $fillable = [
        'company_key',
        'created_by_user_id',
        'plant_id',
        'disk',
        'path',
        'original_name',
        'mime_type',
        'size',
        'type',
        'description',
    ];

    protected function casts(): array
    {
        return [
            'size' => 'integer',
        ];
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function plant(): BelongsTo
    {
        return $this->belongsTo(Plant::class, 'plant_id');
    }

    protected function url(): Attribute
    {
        return Attribute::get(function (mixed $value, array $attributes): ?string {
            if (empty($attributes['path'])) {
                return null;
            }

            $disk = $attributes['disk'] ?? 'public';

            return Storage::disk($disk)->url($attributes['path']);
        });
    }
}
