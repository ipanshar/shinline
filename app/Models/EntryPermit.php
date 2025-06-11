<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EntryPermit extends Model
{
    protected $fillable = [
        'truck_id',
        'yard_id',
        'user_id',
        'task_id',
        'one_permission',
        'begin_date',
        'end_date',
        'status_id',
    ];
}
