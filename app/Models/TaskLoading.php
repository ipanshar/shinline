<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaskLoading extends Model
{
    protected $fillable = [
        'task_id',
        'warehouse_id',
        'warehouse_gate_plan_id',
        'warehouse_gate_fact_id',
        'sort_order',
        'description',
        'barcode',
        'document',
        'comment',        
    ];
    public function task()
    {
        return $this->belongsTo(Task::class);
    }
    public function warehouse()
    {
        return $this->belongsTo(Warehouse::class);
    }


  
}
