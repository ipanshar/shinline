<?php

namespace App\Services;

use App\Models\EntryPermit;
use App\Models\GuestVisit;
use App\Models\GuestVisitPermit;
use App\Models\GuestVisitVehicle;
use App\Models\Status;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class GuestVisitPermitService
{
    public function __construct(
        private EntryPermitReplacementService $permitReplacementService,
        private DssPermitVehicleService $permitVehicleService,
    ) {
    }

    public function issuePermits(GuestVisit $guestVisit, int $userId): array
    {
        if ($guestVisit->workflow_status !== GuestVisit::STATUS_ACTIVE) {
            throw ValidationException::withMessages([
                'id' => 'Выпускать пропуска можно только для активного гостевого визита.',
            ]);
        }

        $personPermit = $this->issuePersonPermit($guestVisit);
        $vehiclePermits = [];

        foreach ($guestVisit->vehicles as $vehicle) {
            $vehiclePermits[] = $this->issueVehiclePermit($guestVisit, $vehicle, $userId);
        }

        return [
            'status' => 'issued',
            'message' => 'Пропуска для гостевого визита выпущены.',
            'guest_visit_id' => $guestVisit->id,
            'person_permit' => $personPermit,
            'vehicle_permits' => $vehiclePermits,
        ];
    }

    public function revokePermits(GuestVisit $guestVisit): array
    {
        $personRevoked = $this->revokePersonPermit($guestVisit);
        $vehicleRevocations = [];

        $guestVisit->loadMissing(['permitLinks.entryPermit', 'vehicles']);

        foreach ($guestVisit->permitLinks->where('permit_subject_type', 'vehicle') as $permitLink) {
            $vehicleRevocations[] = $this->revokeVehiclePermit($permitLink);
        }

        return [
            'status' => 'revoked',
            'message' => 'Пропуска гостевого визита отозваны.',
            'guest_visit_id' => $guestVisit->id,
            'person_permit_revoked' => $personRevoked,
            'vehicle_permits_revoked' => $vehicleRevocations,
        ];
    }

    public function revokeVehiclePermitsForVehicle(GuestVisitVehicle $vehicle): array
    {
        $vehicle->loadMissing(['permitLinks.entryPermit']);

        $revocations = [];

        foreach ($vehicle->permitLinks->where('permit_subject_type', 'vehicle') as $permitLink) {
            $revocations[] = $this->revokeVehiclePermit($permitLink);
        }

        return $revocations;
    }

    private function issuePersonPermit(GuestVisit $guestVisit): GuestVisitPermit
    {
        $guestVisit->loadMissing('permitLinks');

        $permitLink = $guestVisit->permitLinks()
            ->where('permit_subject_type', 'person')
            ->whereNull('guest_visit_vehicle_id')
            ->first();

        if ($permitLink) {
            if ($permitLink->revoked_at !== null) {
                $permitLink->revoked_at = null;
                $permitLink->save();
            }

            return $permitLink->fresh();
        }

        return $guestVisit->permitLinks()->create([
            'entry_permit_id' => null,
            'permit_subject_type' => 'person',
            'guest_visit_vehicle_id' => null,
            'created_at' => now(),
            'revoked_at' => null,
        ]);
    }

    private function issueVehiclePermit(GuestVisit $guestVisit, GuestVisitVehicle $vehicle, int $userId): array
    {
        if (!$vehicle->truck_id) {
            throw ValidationException::withMessages([
                'vehicles' => 'Для выдачи пропуска на ТС нужна связанная запись trucks.',
            ]);
        }

        $activeStatus = Status::where('key', 'active')->first();

        if (!$activeStatus) {
            throw ValidationException::withMessages([
                'status' => 'Не найден статус active для выпуска пропуска.',
            ]);
        }

        $permit = null;
        $replacementResult = ['permits' => collect(), 'dss_results' => collect()];

        DB::transaction(function () use ($guestVisit, $vehicle, $userId, $activeStatus, &$permit, &$replacementResult) {
            $replacementResult = $this->permitReplacementService->deactivateExistingActivePermits(
                $vehicle->truck_id,
                $guestVisit->yard_id
            );

            $permit = EntryPermit::create([
                'truck_id' => $vehicle->truck_id,
                'yard_id' => $guestVisit->yard_id,
                'user_id' => null,
                'granted_by_user_id' => $userId,
                'task_id' => null,
                'one_permission' => $guestVisit->permit_kind === GuestVisit::PERMIT_KIND_ONE_TIME,
                'weighing_required' => null,
                'begin_date' => $guestVisit->visit_starts_at,
                'end_date' => $guestVisit->visit_ends_at,
                'status_id' => $activeStatus->id,
                'comment' => $guestVisit->comment,
                'is_guest' => true,
                'guest_name' => $guestVisit->guest_full_name,
                'guest_company' => $guestVisit->guest_company_name,
                'guest_destination' => $guestVisit->host_name,
                'guest_purpose' => 'Телефон встречающего: ' . $guestVisit->host_phone,
                'guest_phone' => $guestVisit->guest_phone,
            ]);

            $permitLink = $guestVisit->permitLinks()
                ->where('permit_subject_type', 'vehicle')
                ->where('guest_visit_vehicle_id', $vehicle->id)
                ->first();

            if ($permitLink) {
                $permitLink->update([
                    'entry_permit_id' => $permit->id,
                    'revoked_at' => null,
                ]);
            } else {
                $guestVisit->permitLinks()->create([
                    'entry_permit_id' => $permit->id,
                    'permit_subject_type' => 'vehicle',
                    'guest_visit_vehicle_id' => $vehicle->id,
                    'created_at' => now(),
                    'revoked_at' => null,
                ]);
            }
        });

        if (!$permit instanceof EntryPermit) {
            throw ValidationException::withMessages([
                'permit' => 'Не удалось создать пропуск на ТС для гостевого визита.',
            ]);
        }

        $dssVehicleSync = $this->permitVehicleService->syncPermitVehicleSafely($permit);

        return [
            'vehicle_id' => $vehicle->id,
            'entry_permit_id' => $permit->id,
            'replaced_permits_count' => $replacementResult['permits']->count(),
            'dss_replaced_permits' => $replacementResult['dss_results']->values()->all(),
            'dss_vehicle_sync' => $dssVehicleSync,
        ];
    }

    private function revokePersonPermit(GuestVisit $guestVisit): bool
    {
        $personPermit = $guestVisit->permitLinks()
            ->where('permit_subject_type', 'person')
            ->whereNull('guest_visit_vehicle_id')
            ->whereNull('revoked_at')
            ->first();

        if (!$personPermit) {
            return false;
        }

        $personPermit->revoked_at = now();
        $personPermit->save();

        return true;
    }

    private function revokeVehiclePermit(GuestVisitPermit $permitLink): array
    {
        if ($permitLink->revoked_at !== null) {
            return [
                'guest_visit_permit_id' => $permitLink->id,
                'status' => 'already_revoked',
            ];
        }

        $permit = $permitLink->entryPermit;
        $dssVehicleRevoke = null;

        if ($permit) {
            $inactiveStatus = Status::where('key', 'not_active')->first();
            $shouldRevokeInDss = false;

            if ($inactiveStatus && (int) $permit->status_id !== (int) $inactiveStatus->id) {
                $permit->update([
                    'status_id' => $inactiveStatus->id,
                    'end_date' => now(),
                ]);

                $shouldRevokeInDss = true;
            }

            if ($shouldRevokeInDss) {
                $dssVehicleRevoke = $this->permitVehicleService->revokePermitVehicleSafely($permit->fresh());
            }
        }

        $permitLink->revoked_at = now();
        $permitLink->save();

        return [
            'guest_visit_permit_id' => $permitLink->id,
            'entry_permit_id' => $permit?->id,
            'status' => 'revoked',
            'dss_vehicle_revoke' => $dssVehicleRevoke,
        ];
    }
}