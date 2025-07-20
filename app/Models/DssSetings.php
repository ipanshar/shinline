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
        'credential',
        'client_type',
        'keepalive',
        'update_token',
        'update_token_count'
    ];
    
    public function dssApis()
    {
        return $this->hasMany(DssApi::class);
    }
}
