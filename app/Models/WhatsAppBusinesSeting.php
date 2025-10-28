<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WhatsAppBusinesSeting extends Model
{
    protected $fillable = [
        'phone_number_id',
        'waba_id',
        'business_account_id',
        'bearer_token',
        'host',
        'version',
    ];

}
