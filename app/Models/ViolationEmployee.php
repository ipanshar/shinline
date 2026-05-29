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
        'person_kind',
        'external_ref',
        'iin',
        'full_name',
        'normalized_full_name',
        'department',
        'position',
        'employment_status',
        'temporary_pass_status',
        'temporary_pass_issued_at',
        'temporary_pass_expires_at',
        'temporary_pass_duration_months',
        'temporary_pass_created_by_user_id',
        'temporary_pass_created_by_name',
        'temporary_pass_last_extended_at',
        'is_active',
        'face_reference_count',
        'face_reference_state',
        'last_face_sync_at',
        'imported_at',
        'meta',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'temporary_pass_issued_at' => 'datetime',
        'temporary_pass_expires_at' => 'datetime',
        'temporary_pass_last_extended_at' => 'datetime',
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

    public function faceReferences()
    {
        return $this->hasMany(ViolationEmployeeFaceReference::class, 'employee_id')->orderByDesc('is_primary')->orderBy('id');
    }

    public function primaryFaceReference()
    {
        return $this->hasOne(ViolationEmployeeFaceReference::class, 'employee_id')
            ->where('is_active', true)
            ->orderByDesc('is_primary')
            ->orderBy('id');
    }

    public function temporaryPassCreator()
    {
        return $this->belongsTo(User::class, 'temporary_pass_created_by_user_id');
    }

    public function temporaryPassEvents()
    {
        return $this->hasMany(ViolationTemporaryPassEvent::class, 'employee_id')->latest('performed_at')->latest('id');
    }
}
