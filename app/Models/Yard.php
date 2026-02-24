<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Yard extends Model
{
    protected $fillable = [
        'name',
        'strict_mode', // Строгий режим: запрет въезда без разрешения
        'weighing_required', // Требуется ли взвешивание на этом дворе
    ];

    protected $casts = [
        'strict_mode' => 'boolean',
        'weighing_required' => 'boolean',
    ];
}
