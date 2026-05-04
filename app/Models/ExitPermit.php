<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class ExitPermit extends Model
{
    public const STATUS_ACTIVE = 'active';
    public const STATUS_USED = 'used';
    public const STATUS_CANCELED = 'canceled';
    public const STATUS_EXPIRED = 'expired';

    protected $fillable = [
        'yard_id',
        'truck_id',
        'visitor_id',
        'plate_number',
        'status',
        'valid_from',
        'valid_until',
        'requested_by_user_id',
        'requested_by_telegram_chat_id',
        'used_at',
        'used_by_user_id',
        'used_checkpoint_exit_review_id',
        'canceled_at',
        'canceled_by_user_id',
        'comment',
    ];

    protected $casts = [
        'valid_from' => 'datetime',
        'valid_until' => 'datetime',
        'used_at' => 'datetime',
        'canceled_at' => 'datetime',
    ];

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_ACTIVE)
            ->where(function (Builder $builder) {
                $builder->whereNull('valid_from')
                    ->orWhere('valid_from', '<=', now());
            })
            ->where(function (Builder $builder) {
                $builder->whereNull('valid_until')
                    ->orWhere('valid_until', '>=', now());
            });
    }

    public function yard()
    {
        return $this->belongsTo(Yard::class);
    }

    public function truck()
    {
        return $this->belongsTo(Truck::class);
    }

    public function visitor()
    {
        return $this->belongsTo(Visitor::class);
    }

    public function requestedBy()
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function requestedByTelegramChat()
    {
        return $this->belongsTo(TelegramBotChat::class, 'requested_by_telegram_chat_id');
    }

    public function usedBy()
    {
        return $this->belongsTo(User::class, 'used_by_user_id');
    }
}
