<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ViolationEmployeeFaceReference extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id',
        'source_system',
        'source',
        'external_ref',
        'source_image_id',
        'group_key',
        'disk',
        'path',
        'file_name',
        'mime_type',
        'file_size',
        'sha1',
        'is_primary',
        'is_active',
        'imported_at',
        'last_synced_at',
        'meta',
    ];

    protected $casts = [
        'is_primary' => 'boolean',
        'is_active' => 'boolean',
        'imported_at' => 'datetime',
        'last_synced_at' => 'datetime',
        'meta' => 'array',
    ];

    public function employee()
    {
        return $this->belongsTo(ViolationEmployee::class, 'employee_id');
    }
}