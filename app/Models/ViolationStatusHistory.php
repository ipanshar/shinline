<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ViolationStatusHistory extends Model
{
    use HasFactory;

    protected $fillable = [
        'incident_id',
        'from_status',
        'to_status',
        'source',
        'changed_by_user_id',
        'note',
        'meta',
    ];

    protected $casts = [
        'meta' => 'array',
    ];

    public function incident()
    {
        return $this->belongsTo(ViolationIncident::class, 'incident_id');
    }

    public function changedBy()
    {
        return $this->belongsTo(User::class, 'changed_by_user_id');
    }
}