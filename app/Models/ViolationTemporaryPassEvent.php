<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ViolationTemporaryPassEvent extends Model
{
    use HasFactory;

    protected $fillable = [
        'employee_id',
        'event_type',
        'duration_months',
        'matched_reference_key',
        'matched_similarity',
        'performed_by_user_id',
        'performed_by_name',
        'performed_by_chat_id',
        'performed_at',
        'previous_expires_at',
        'pass_issued_at',
        'pass_expires_at',
        'meta',
    ];

    protected $casts = [
        'matched_similarity' => 'decimal:4',
        'performed_at' => 'datetime',
        'previous_expires_at' => 'datetime',
        'pass_issued_at' => 'datetime',
        'pass_expires_at' => 'datetime',
        'meta' => 'array',
    ];

    public function employee()
    {
        return $this->belongsTo(ViolationEmployee::class, 'employee_id');
    }

    public function performer()
    {
        return $this->belongsTo(User::class, 'performed_by_user_id');
    }
}
