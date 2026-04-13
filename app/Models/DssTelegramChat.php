<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DssTelegramChat extends Model
{
    protected $fillable = [
        'dss_setings_id',
        'name',
        'chat_id',
        'description',
        'message_thread_id',
        'is_enabled',
        'send_silently_default',
        'sort_order',
    ];

    protected $casts = [
        'is_enabled' => 'boolean',
        'send_silently_default' => 'boolean',
        'message_thread_id' => 'integer',
        'sort_order' => 'integer',
    ];

    public function dssSettings()
    {
        return $this->belongsTo(DssSetings::class, 'dss_setings_id');
    }

    public function notifications()
    {
        return $this->hasMany(DssTelegramNotification::class, 'telegram_chat_id');
    }
}