<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DssApi extends Model
{
   protected $fillable = [
        'api_name',
        'method',
        'request_url',
        'dss_setings_id',
    ];
}
