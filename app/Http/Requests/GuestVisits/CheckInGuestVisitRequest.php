<?php

namespace App\Http\Requests\GuestVisits;

class CheckInGuestVisitRequest extends GuestVisitActionRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('guest_visits.close') ?? false;
    }
}
