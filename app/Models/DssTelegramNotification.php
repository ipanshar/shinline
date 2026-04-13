<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DssTelegramNotification extends Model
{
    protected $fillable = [
        'dss_setings_id',
        'telegram_chat_id',
        'event_key',
        'is_enabled',
        'send_silently',
        'cooldown_minutes',
        'last_sent_at',
        'last_error',
        'last_error_at',
    ];

    protected $casts = [
        'is_enabled' => 'boolean',
        'send_silently' => 'boolean',
        'cooldown_minutes' => 'integer',
        'last_sent_at' => 'datetime',
        'last_error_at' => 'datetime',
    ];

    public function dssSettings()
    {
        return $this->belongsTo(DssSetings::class, 'dss_setings_id');
    }

    public function chat()
    {
        return $this->belongsTo(DssTelegramChat::class, 'telegram_chat_id');
    }
}