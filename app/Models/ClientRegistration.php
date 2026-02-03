<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class ClientRegistration extends Model
{
    use HasFactory;

    protected $table = 'client_registrations';

    protected $fillable = [
        'full_name',
        'iin',
        'birth_date',
        'phone',
        'address',
    ];

    protected $casts = [
        'birth_date' => 'date',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
