<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ViolationEmployee extends Model
{
    use HasFactory;

    protected $fillable = [
        'business_key',
        'source_system',
        'external_ref',
        'iin',
        'full_name',
        'normalized_full_name',
        'department',
        'position',
        'employment_status',
        'is_active',
        'face_reference_count',
        'face_reference_state',
        'last_face_sync_at',
        'imported_at',
        'meta',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'last_face_sync_at' => 'datetime',
        'imported_at' => 'datetime',
        'meta' => 'array',
    ];

    public function incidents()
    {
        return $this->hasMany(ViolationIncident::class, 'employee_id');
    }

    public function recognizedIncidents()
    {
        return $this->hasMany(ViolationIncident::class, 'recognition_employee_id');
    }
}