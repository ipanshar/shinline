<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Сounterparty extends Model
{
    protected $table = 'сounterparties';

    protected $fillable = [
        'name',
        'inn',
        'address',
        'phone',
        'whatsapp',
        'email',
        'supervisor',
        'contact_person',
        'carrier_type',
    ];
}
