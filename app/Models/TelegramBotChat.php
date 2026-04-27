<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TelegramBotChat extends Model
{
    protected $fillable = [
        'chat_id',
        'user_id',
        'username',
        'first_name',
        'last_name',
        'state',
        'state_payload',
        'last_interaction_at',
    ];

    protected $casts = [
        'state_payload' => 'array',
        'last_interaction_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}