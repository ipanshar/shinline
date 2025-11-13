<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WhatsAppChatMessages extends Model
{
    protected $fillable = ['chat_list_id', 'message', 'message_id', 'type', 'user_id', 'status', 'error_code', 'error_message', 'has_response', 'response_to_message_id', 'direction'];
}
