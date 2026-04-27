<?php

namespace App\Services;

use App\Models\GuestVisit;
use App\Models\GuestVisitPermit;
use App\Models\Visitor;

class GuestVisitVisitorFlowService
{
    public function __construct(
        private GuestVisitPermitService $permitService,
    ) {
    }

    public function attachToVisitor(Visitor $visitor): ?GuestVisit
    {
        $guestVisit = $this->resolveGuestVisitForVisitor($visitor, true);

        if (!$guestVisit) {
            return null;
        }

        $entryTime = $visitor->entry_date ?? now();
        $visitorChanged = false;

        if ((int) $visitor->guest_visit_id !== (int) $guestVisit->id) {
            $visitor->guest_visit_id = $guestVisit->id;
            $visitorChanged = true;
        }

        if ($visitorChanged) {
            $visitor->save();
        }

        if ($guestVisit->last_entry_at === null || $entryTime->gt($guestVisit->last_entry_at)) {
            $guestVisit->forceFill([
                'last_entry_at' => $entryTime,
            ])->save();
        }

        return $guestVisit->fresh(['vehicles', 'permitLinks.entryPermit.status']);
    }

    public function handleVisitorExit(Visitor $visitor, $exitTime = null): ?GuestVisit
    {
        $guestVisit = $this->resolveGuestVisitForVisitor($visitor, false);

        if (!$guestVisit) {
            return null;
        }

        $exitTime ??= $visitor->exit_date ?? now();

        if ((int) $visitor->guest_visit_id !== (int) $guestVisit->id) {
            $visitor->guest_visit_id = $guestVisit->id;
            $visitor->save();
        }

        if ($guestVisit->last_exit_at === null || $exitTime->gt($guestVisit->last_exit_at)) {
            $guestVisit->forceFill([
                'last_exit_at' => $exitTime,
            ])->save();
        }

        $hasOpenVisitors = $guestVisit->visitors()
            ->whereNull('exit_date')
            ->exists();

        if (
            !$hasOpenVisitors
            && $guestVisit->workflow_status === GuestVisit::STATUS_ACTIVE
            && $guestVisit->permit_kind === GuestVisit::PERMIT_KIND_ONE_TIME
        ) {
            $this->permitService->revokePermits($guestVisit->loadMissing(['permitLinks.entryPermit', 'vehicles']));

            $guestVisit->forceFill([
                'workflow_status' => GuestVisit::STATUS_CLOSED,
                'closed_at' => $guestVisit->closed_at ?? $exitTime,
            ])->save();
        }

        return $guestVisit->fresh(['vehicles', 'permitLinks.entryPermit.status']);
    }

    private function resolveGuestVisitForVisitor(Visitor $visitor, bool $onlyActive): ?GuestVisit
    {
        if ($visitor->guest_visit_id) {
            $query = GuestVisit::query()->whereKey($visitor->guest_visit_id);

            if ($onlyActive) {
                $query->where('workflow_status', GuestVisit::STATUS_ACTIVE);
            }

            return $query->first();
        }

        if ($visitor->entry_permit_id) {
            $permitLink = GuestVisitPermit::query()
                ->with('guestVisit')
                ->where('entry_permit_id', $visitor->entry_permit_id)
                ->where('permit_subject_type', 'vehicle')
                ->orderByDesc('created_at')
                ->orderByDesc('id')
                ->first();

            if ($permitLink?->guestVisit && (!$onlyActive || $permitLink->guestVisit->workflow_status === GuestVisit::STATUS_ACTIVE)) {
                return $permitLink->guestVisit;
            }
        }

        if (!$visitor->yard_id) {
            return null;
        }

        $moment = $visitor->entry_date ?? $visitor->exit_date ?? now();

        $query = GuestVisit::query()
            ->where('yard_id', $visitor->yard_id)
            ->when($onlyActive, function ($builder) {
                $builder->where('workflow_status', GuestVisit::STATUS_ACTIVE);
            })
            ->where('visit_starts_at', '<=', $moment)
            ->where(function ($builder) use ($moment) {
                $builder->whereNull('visit_ends_at')
                    ->orWhere('visit_ends_at', '>=', $moment);
            });

        $personMatchedGuestVisit = $this->resolveGuestVisitByPersonData(clone $query, $visitor);

        if ($personMatchedGuestVisit) {
            return $personMatchedGuestVisit;
        }

        if ($visitor->truck_id) {
            $query->whereHas('vehicles', function ($builder) use ($visitor) {
                $builder->where('truck_id', $visitor->truck_id);
            });
        } else {
            $normalizedPlate = $this->normalizePlate((string) $visitor->plate_number);

            if ($normalizedPlate === '') {
                return null;
            }

            $query->whereHas('vehicles', function ($builder) use ($normalizedPlate) {
                $builder->whereRaw(
                    "REPLACE(REPLACE(LOWER(plate_number), ' ', ''), '-', '') = ?",
                    [$normalizedPlate]
                );
            });
        }

        return $query
            ->orderByDesc('visit_starts_at')
            ->orderByDesc('id')
            ->first();
    }

    private function normalizePlate(string $plateNumber): string
    {
        return strtolower(str_replace([' ', '-'], '', $plateNumber));
    }

    private function resolveGuestVisitByPersonData($query, Visitor $visitor): ?GuestVisit
    {
        $normalizedName = $this->normalizeText((string) ($visitor->name ?? ''));

        if ($normalizedName === '') {
            return null;
        }

        $normalizedPhone = $this->normalizePhone((string) ($visitor->phone ?? ''));
        $normalizedCompany = $this->normalizeText((string) ($visitor->company ?? ''));

        $query
            ->where(function ($builder) {
                $builder->where('has_vehicle', false)
                    ->orWhereDoesntHave('vehicles');
            })
            ->whereRaw(
                "REPLACE(REPLACE(REPLACE(LOWER(guest_full_name), ' ', ''), '-', ''), '.', '') = ?",
                [$normalizedName]
            );

        if ($normalizedPhone !== '') {
            $query->whereRaw(
                "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(guest_phone, ' ', ''), '-', ''), '(', ''), ')', ''), '+', '') = ?",
                [$normalizedPhone]
            );
        } elseif ($normalizedCompany !== '') {
            $query->whereRaw(
                "REPLACE(REPLACE(REPLACE(LOWER(COALESCE(guest_company_name, '')), ' ', ''), '-', ''), '.', '') = ?",
                [$normalizedCompany]
            );
        } else {
            return null;
        }

        $matches = $query
            ->orderByDesc('visit_starts_at')
            ->orderByDesc('id')
            ->limit(2)
            ->get();

        return $matches->count() === 1 ? $matches->first() : null;
    }

    private function normalizeText(string $value): string
    {
        return strtolower(str_replace([' ', '-', '.'], '', trim($value)));
    }

    private function normalizePhone(string $value): string
    {
        return preg_replace('/\D+/', '', $value) ?? '';
    }
}