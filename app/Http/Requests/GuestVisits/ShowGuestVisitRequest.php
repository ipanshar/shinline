<?php

namespace App\Http\Requests\GuestVisits;

class ShowGuestVisitRequest extends GuestVisitActionRequest
{
    public function authorize(): bool
    {
        return $this->user()?->hasPermission('guest_visits.view') ?? false;
    }
}