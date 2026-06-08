<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class ViolationIncident extends Model
{
    use HasFactory;

    public const STATUS_DRAFT_PROCESSING = 'draft_processing';
    public const STATUS_PENDING_REVIEW = 'pending_review';
    public const STATUS_RECOGNIZED_CONFIRMED = 'recognized_confirmed';
    public const STATUS_UNKNOWN_MANUAL = 'unknown_manual';
    public const STATUS_ESCALATED = 'escalated';
    public const STATUS_CLOSED = 'closed';
    public const STATUS_REJECTED = 'rejected';

    public const WORKFLOW_STATUSES = [
        self::STATUS_DRAFT_PROCESSING,
        self::STATUS_PENDING_REVIEW,
        self::STATUS_RECOGNIZED_CONFIRMED,
        self::STATUS_UNKNOWN_MANUAL,
        self::STATUS_ESCALATED,
        self::STATUS_CLOSED,
        self::STATUS_REJECTED,
    ];

    public const RECOGNITION_PENDING = 'pending';
    public const RECOGNITION_MATCHED = 'matched';
    public const RECOGNITION_UNKNOWN = 'unknown';
    public const RECOGNITION_FAILED = 'failed';
    public const RECOGNITION_MANUAL = 'manual';

    public const RECOGNITION_STATUSES = [
        self::RECOGNITION_PENDING,
        self::RECOGNITION_MATCHED,
        self::RECOGNITION_UNKNOWN,
        self::RECOGNITION_FAILED,
        self::RECOGNITION_MANUAL,
    ];

    protected $fillable = [
        'incident_uid',
        'source',
        'workflow_status',
        'recognition_status',
        'identity_source',
        'occurred_at',
        'reported_at',
        'reviewed_at',
        'closed_at',
        'reported_by_user_id',
        'reviewed_by_user_id',
        'reported_by_chat_id',
        'reported_by_name',
        'category_id',
        'type_id',
        'category_key',
        'category_name',
        'type_key',
        'type_name',
        'description',
        'yard_id',
        'zone_id',
        'location_label',
        'employee_id',
        'employee_business_key',
        'employee_iin',
        'employee_full_name',
        'employee_normalized_full_name',
        'employee_department',
        'employee_position',
        'employee_status',
        'is_manual_identity',
        'recognition_employee_id',
        'recognition_employee_business_key',
        'recognition_employee_full_name',
        'recognition_employee_department',
        'recognition_attempts_count',
        'recognition_candidate_count',
        'recognition_similarity',
        'recognition_threshold',
        'recognition_error',
        'evidence_total_count',
        'evidence_photo_count',
        'evidence_video_count',
        'primary_evidence_kind',
        'primary_evidence_path',
        'disciplinary_due_at',
        'disciplinary_expires_at',
        'sanction_state',
        'review_note',
        'rejection_reason',
        'meta',
    ];

    protected $casts = [
        'occurred_at' => 'datetime',
        'reported_at' => 'datetime',
        'reviewed_at' => 'datetime',
        'closed_at' => 'datetime',
        'disciplinary_due_at' => 'datetime',
        'disciplinary_expires_at' => 'datetime',
        'is_manual_identity' => 'boolean',
        'recognition_similarity' => 'decimal:4',
        'recognition_threshold' => 'decimal:4',
        'meta' => 'array',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $incident): void {
            if (! $incident->incident_uid) {
                $incident->incident_uid = (string) Str::ulid();
            }

            if (! $incident->reported_at) {
                $incident->reported_at = now();
            }
        });
    }

    public function reporter()
    {
        return $this->belongsTo(User::class, 'reported_by_user_id');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by_user_id');
    }

    public function yard()
    {
        return $this->belongsTo(Yard::class);
    }

    public function category()
    {
        return $this->belongsTo(ViolationCategory::class, 'category_id');
    }

    public function type()
    {
        return $this->belongsTo(ViolationType::class, 'type_id');
    }

    public function zone()
    {
        return $this->belongsTo(Zone::class);
    }

    public function employee()
    {
        return $this->belongsTo(ViolationEmployee::class, 'employee_id');
    }

    public function recognitionEmployee()
    {
        return $this->belongsTo(ViolationEmployee::class, 'recognition_employee_id');
    }

    public function evidences()
    {
        return $this->hasMany(ViolationEvidence::class, 'incident_id')->orderBy('sort_order');
    }

    public function recognitionAttempts()
    {
        return $this->hasMany(ViolationRecognitionAttempt::class, 'incident_id')->latest('id');
    }

    public function statusHistory()
    {
        return $this->hasMany(ViolationStatusHistory::class, 'incident_id')->latest('id');
    }
}
