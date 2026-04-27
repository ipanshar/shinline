<?php

namespace App\Http\Requests\GuestVisits;

class CheckOutGuestVisitRequest extends GuestVisitActionRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('guest_visits.close') ?? false;
    }
}
