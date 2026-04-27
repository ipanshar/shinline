<?php

namespace App\Http\Requests\GuestVisits;

class CancelGuestVisitRequest extends GuestVisitActionRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('guest_visits.cancel') ?? false;
    }
}