<?php

namespace App\Support\Greenlog;

use App\Models\User;
use Illuminate\Http\Request;

trait ResolvesGreenlogCompany
{
    protected function companyKey(?Request $request = null): string
    {
        $user = $request?->user() ?? auth()->user();

        return $this->companyKeyForUser($user);
    }

    protected function companyKeyForUser(?User $user): string
    {
        return $user?->company ?: 'default';
    }
}
