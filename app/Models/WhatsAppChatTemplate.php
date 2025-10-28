<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WhatsAppChatTemplate extends Model
{
    protected $fillable = ['template_name', 'template_content'];
}
