<?php

namespace App\Services;

use App\Models\EntryPermit;
use App\Models\Status;
use Illuminate\Support\Collection;

class EntryPermitReplacementService
{
    public function deactivateExistingActivePermits(int $truckId, int $yardId, ?int $excludePermitId = null): Collection
    {
        $activeStatusId = Status::where('key', 'active')->value('id');
        $inactiveStatusId = Status::where('key', 'not_active')->value('id');

        if (!$activeStatusId || !$inactiveStatusId) {
            return collect();
        }

        $permits = EntryPermit::query()
            ->where('truck_id', $truckId)
            ->where('yard_id', $yardId)
            ->where('status_id', $activeStatusId)
            ->when($excludePermitId, fn ($query) => $query->whereKeyNot($excludePermitId))
            ->orderBy('created_at', 'desc')
            ->get();

        if ($permits->isEmpty()) {
            return collect();
        }

        $deactivatedAt = now();

        foreach ($permits as $permit) {
            $permit->update([
                'status_id' => $inactiveStatusId,
                'end_date' => $deactivatedAt,
            ]);

            $permit->status_id = $inactiveStatusId;
            $permit->end_date = $deactivatedAt;
        }

        return $permits;
    }
}