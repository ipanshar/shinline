<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class TelegramBotChat extends Model
{
    public const APPROVAL_NONE = 'none';
    public const APPROVAL_AWAITING_REVIEW = 'awaiting_review';
    public const APPROVAL_APPROVED = 'approved';
    public const APPROVAL_REJECTED = 'rejected';
    public const APPROVAL_BLOCKED = 'blocked';

    protected $fillable = [
        'chat_id',
        'user_id',
        'username',
        'first_name',
        'last_name',
        'state',
        'state_payload',
        'last_interaction_at',
        'approval_status',
        'display_full_name',
        'display_phone',
        'approved_user_id',
        'approved_by',
        'approved_at',
        'rejection_reason',
    ];

    protected $casts = [
        'state_payload' => 'array',
        'last_interaction_at' => 'datetime',
        'approved_at' => 'datetime',
    ];

    protected $attributes = [
        'approval_status' => self::APPROVAL_NONE,
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function approvedUser()
    {
        return $this->belongsTo(User::class, 'approved_user_id');
    }

    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function yards()
    {
        return $this->belongsToMany(Yard::class, 'telegram_chat_yards', 'telegram_bot_chat_id', 'yard_id')
            ->withTimestamps();
    }

    public function scopeApproved(Builder $query): Builder
    {
        return $query->where('approval_status', self::APPROVAL_APPROVED);
    }

    public function scopePending(Builder $query): Builder
    {
        return $query->where('approval_status', self::APPROVAL_AWAITING_REVIEW);
    }

    public function isApproved(): bool
    {
        return $this->approval_status === self::APPROVAL_APPROVED;
    }
}