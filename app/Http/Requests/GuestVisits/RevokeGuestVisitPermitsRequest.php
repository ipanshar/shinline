<?php

namespace App\Http\Requests\GuestVisits;

class RevokeGuestVisitPermitsRequest extends GuestVisitActionRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('guest_visits.issue_permits') ?? false;
    }
}