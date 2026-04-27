<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GuestVisit extends Model
{
    use HasFactory;

    public const STATUS_ACTIVE = 'active';
    public const STATUS_CLOSED = 'closed';
    public const STATUS_CANCELED = 'canceled';

    public const PERMIT_KIND_ONE_TIME = 'one_time';
    public const PERMIT_KIND_MULTI_TIME = 'multi_time';

    public const SOURCE_OPERATOR = 'operator';
    public const SOURCE_INTEGRATION = 'integration';
    public const SOURCE_IMPORT = 'import';

    protected $fillable = [
        'yard_id',
        'guest_full_name',
        'guest_iin',
        'guest_company_name',
        'guest_position',
        'guest_phone',
        'host_name',
        'host_phone',
        'visit_starts_at',
        'visit_ends_at',
        'permit_kind',
        'workflow_status',
        'has_vehicle',
        'comment',
        'last_entry_at',
        'last_exit_at',
        'closed_at',
        'source',
        'created_by_user_id',
        'approved_by_user_id',
        'cancelled_by_user_id',
    ];

    protected $casts = [
        'has_vehicle' => 'boolean',
        'visit_starts_at' => 'datetime',
        'visit_ends_at' => 'datetime',
        'last_entry_at' => 'datetime',
        'last_exit_at' => 'datetime',
        'closed_at' => 'datetime',
    ];

    public function yard()
    {
        return $this->belongsTo(Yard::class);
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }

    public function cancelledBy()
    {
        return $this->belongsTo(User::class, 'cancelled_by_user_id');
    }

    public function vehicles()
    {
        return $this->hasMany(GuestVisitVehicle::class);
    }

    public function permitLinks()
    {
        return $this->hasMany(GuestVisitPermit::class);
    }

    public function activePermitLinks()
    {
        return $this->hasMany(GuestVisitPermit::class)->whereNull('revoked_at');
    }

    public function visitors()
    {
        return $this->hasMany(Visitor::class);
    }
}