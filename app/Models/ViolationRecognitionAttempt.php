<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ViolationRecognitionAttempt extends Model
{
    use HasFactory;

    protected $fillable = [
        'incident_id',
        'evidence_id',
        'attempt_kind',
        'service_name',
        'status',
        'matched',
        'threshold',
        'best_similarity',
        'candidate_count',
        'recognized_employee_id',
        'recognized_employee_business_key',
        'recognized_full_name',
        'recognized_department',
        'selected_frame_path',
        'error_message',
        'candidates_json',
        'raw_response',
        'started_at',
        'finished_at',
    ];

    protected $casts = [
        'matched' => 'boolean',
        'threshold' => 'decimal:4',
        'best_similarity' => 'decimal:4',
        'candidates_json' => 'array',
        'raw_response' => 'array',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
    ];

    public function incident()
    {
        return $this->belongsTo(ViolationIncident::class, 'incident_id');
    }

    public function evidence()
    {
        return $this->belongsTo(ViolationEvidence::class, 'evidence_id');
    }

    public function recognizedEmployee()
    {
        return $this->belongsTo(ViolationEmployee::class, 'recognized_employee_id');
    }
}