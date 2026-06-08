<?php

namespace App\Models\Greenlog;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CareTask extends Model
{
    protected $table = 'greenlog_care_tasks';

    protected $fillable = [
        'company_key',
        'created_by_user_id',
        'plant_id',
        'type',
        'due_at',
        'status',
        'completed_at',
        'comment',
    ];

    protected function casts(): array
    {
        return [
            'due_at' => 'datetime',
            'completed_at' => 'datetime',
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
}
