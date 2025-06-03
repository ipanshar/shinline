<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DssSetings extends Model
{
    protected $fillable = [
        'base_url',
        'user_name',
        'password',
        'token',
        'client_type',
        'keep_alive',
    ];
    
    public function dssApis()
    {
        return $this->hasMany(DssApi::class);
    }
}
