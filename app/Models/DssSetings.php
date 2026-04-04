<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DssSetings extends Model
{
    protected $fillable = [
        'base_url',
        'user_name',
        'password',
        'user_id',
        'user_group_id',
        'token',
        'credential',
        'secret_key',
        'secret_vector',
        'terminal_public_key',
        'terminal_private_key',
        'platform_public_key',
        'client_type',
        'keepalive',
        'update_token',
        'update_token_count',
        'subhour'
    ];

    protected $hidden = [
        'terminal_private_key',
    ];
    
    public function dssApis()
    {
        return $this->hasMany(DssApi::class);
    }
}
