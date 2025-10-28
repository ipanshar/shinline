<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WhatsAppChatMessages extends Model
{
    protected $fillable = ['chat_list_id', 'message', 'message_id', 'type', 'user_id'];
}
