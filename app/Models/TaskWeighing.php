<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaskWeighing extends Model
{
        protected $fillable = [
        'task_id',
        'weight',
        'description',
        'sort_order',
        'statuse_weighing_id',
        'user_id',
        'yard_id',
    ];
    public function task()
    {
        return $this->belongsTo(Task::class);
    }
    public function statuseWeighing()
    {
        return $this->belongsTo(StatuseWeighing::class);
    }
    public function user()
    {
        return $this->belongsTo(User::class);
    }
    public function scopeFilter($query, array $filters)
    {
        $query->when($filters['search'] ?? false, function ($query, $search) {
            $query->where('name', 'like', '%' . $search . '%');
        });
    }
    public function scopeFilterByUser($query, $userId)
    {
        return $query->where('user_id', $userId);
    }
    public function scopeFilterByTask($query, $taskId)
    {
        return $query->where('task_id', $taskId);
    }
    public function scopeFilterByStatuseWeighing($query, $statuseWeighingId)
    {
        return $query->where('statuse_weighing_id', $statuseWeighingId);
    }
    public function scopeFilterByWeight($query, $weight)
    {
        return $query->where('weight', $weight);
    }
}
