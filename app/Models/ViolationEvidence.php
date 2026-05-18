<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ViolationEvidence extends Model
{
    use HasFactory;

    protected $table = 'violation_evidences';

    protected $fillable = [
        'incident_id',
        'media_role',
        'media_kind',
        'disk',
        'path',
        'thumbnail_path',
        'file_name',
        'mime_type',
        'file_size',
        'sha1',
        'width',
        'height',
        'duration_seconds',
        'sort_order',
        'is_primary',
        'captured_at',
        'meta',
    ];

    protected $casts = [
        'is_primary' => 'boolean',
        'captured_at' => 'datetime',
        'meta' => 'array',
    ];

    public function incident()
    {
        return $this->belongsTo(ViolationIncident::class, 'incident_id');
    }
}