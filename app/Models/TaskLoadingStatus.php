<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaskLoadingStatus extends Model
{
    protected $fillable = [
        'task_loading_id',
        'status_id'
    ];
    public function taskLoading()
    {
        return $this->belongsTo(TaskLoading::class);
    }
    public function status()
    {
        return $this->belongsTo(Status::class);
    }
    public function scopeWithStatus($query, $statusId)
    {
        return $query->where('status_id', $statusId);
    }
    public function scopeWithTaskLoading($query, $taskLoadingId)
    {
        return $query->where('task_loading_id', $taskLoadingId);
    }

}
