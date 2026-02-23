<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Yard extends Model
{
    protected $fillable = [
        'name',
        'strict_mode', // Строгий режим: запрет въезда без разрешения
    ];

    protected $casts = [
        'strict_mode' => 'boolean',
    ];
}
