<?php

namespace App\Services;

use App\Models\GuestVisit;
use App\Models\GuestVisitVehicle;
use App\Models\User;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class GuestVisitService
{
    public function __construct(
        private GuestVisitVehicleService $vehicleService,
        private GuestVisitPermitService $permitService,
        private GuestVisitTelegramNotifier $telegramNotifier,
    ) {
    }

    public function paginate(array $filters): LengthAwarePaginator
    {
        $perPage = min(max((int) ($filters['per_page'] ?? 20), 1), 100);

        return GuestVisit::query()
            ->with(['yard:id,name', 'createdBy:id,name', 'vehicles', 'permitLinks.entryPermit.status'])
            ->when(!empty($filters['yard_id']), function ($query) use ($filters) {
                $query->where('yard_id', $filters['yard_id']);
            })
            ->when(!empty($filters['workflow_status']) && $filters['workflow_status'] !== 'all', function ($query) use ($filters) {
                $query->where('workflow_status', $filters['workflow_status']);
            })
            ->when(!empty($filters['permit_kind']) && $filters['permit_kind'] !== 'all', function ($query) use ($filters) {
                $query->where('permit_kind', $filters['permit_kind']);
            })
            ->when(array_key_exists('has_vehicle', $filters) && $filters['has_vehicle'] !== 'all', function ($query) use ($filters) {
                $query->where('has_vehicle', filter_var($filters['has_vehicle'], FILTER_VALIDATE_BOOLEAN));
            })
            ->when(!empty($filters['search']), function ($query) use ($filters) {
                $search = '%' . trim((string) $filters['search']) . '%';
                $query->where(function ($nested) use ($search) {
                    $nested->where('guest_full_name', 'like', $search)
                        ->orWhere('guest_iin', 'like', $search)
                        ->orWhere('guest_company_name', 'like', $search)
                        ->orWhere('host_name', 'like', $search)
                        ->orWhere('host_phone', 'like', $search);
                });
            })
            ->when(!empty($filters['date_from']), function ($query) use ($filters) {
                $query->whereDate('visit_starts_at', '>=', $filters['date_from']);
            })
            ->when(!empty($filters['date_to']), function ($query) use ($filters) {
                $query->whereDate('visit_starts_at', '<=', $filters['date_to']);
            })
            ->orderByDesc('created_at')
            ->paginate($perPage);
    }

    public function create(array $data, User $user): GuestVisit
    {
        $this->ensureNoOverlap($data);

        return DB::transaction(function () use ($data, $user) {
            $guestVisit = GuestVisit::create($this->buildPayload($data, $user));

            $this->vehicleService->syncVehicles($guestVisit, $data['vehicles'] ?? [], $user->id);

            return $guestVisit->load(['yard:id,name', 'createdBy:id,name', 'vehicles']);
        });
    }

    public function update(GuestVisit $guestVisit, array $data, User $user): GuestVisit
    {
        $this->ensureMutable($guestVisit);
        $this->ensureNoOverlap($data, $guestVisit);

        return DB::transaction(function () use ($guestVisit, $data, $user) {
            $guestVisit->update($this->buildPayload($data, $user, $guestVisit));
            $this->vehicleService->syncVehicles($guestVisit, $data['vehicles'] ?? [], $user->id);

            return $guestVisit->load(['yard:id,name', 'createdBy:id,name', 'vehicles']);
        });
    }

    public function show(GuestVisit $guestVisit): GuestVisit
    {
        return $guestVisit->load(['yard:id,name', 'createdBy:id,name', 'approvedBy:id,name', 'cancelledBy:id,name', 'vehicles', 'permitLinks.entryPermit.status']);
    }

    public function markArrived(GuestVisit $guestVisit, $arrivedAt = null, $visitor = null): GuestVisit
    {
        $arrivedAt ??= now();

        if ($guestVisit->last_entry_at !== null && !$arrivedAt->gt($guestVisit->last_entry_at)) {
            return $this->show($guestVisit);
        }

        $guestVisit->forceFill([
            'last_entry_at' => $arrivedAt,
        ])->save();

        $guestVisit = $guestVisit->fresh();
        $this->telegramNotifier->notifyArrival($guestVisit, $visitor);

        return $this->show($guestVisit);
    }

    public function cancel(GuestVisit $guestVisit, User $user): GuestVisit
    {
        if ($guestVisit->workflow_status === GuestVisit::STATUS_CLOSED) {
            throw ValidationException::withMessages([
                'id' => 'Закрытый визит нельзя отменить.',
            ]);
        }

        if ($guestVisit->workflow_status === GuestVisit::STATUS_CANCELED) {
            return $this->show($guestVisit);
        }

        DB::transaction(function () use ($guestVisit, $user) {
            $guestVisit->loadMissing(['permitLinks.entryPermit', 'vehicles']);
            $this->permitService->revokePermits($guestVisit);

            $guestVisit->update([
                'workflow_status' => GuestVisit::STATUS_CANCELED,
                'cancelled_by_user_id' => $user->id,
                'closed_at' => $guestVisit->closed_at ?? now(),
            ]);
        });

        return $this->show($guestVisit->fresh());
    }

    public function close(GuestVisit $guestVisit): GuestVisit
    {
        if ($guestVisit->workflow_status === GuestVisit::STATUS_CANCELED) {
            throw ValidationException::withMessages([
                'id' => 'Отменённый визит нельзя закрыть.',
            ]);
        }

        if ($guestVisit->workflow_status === GuestVisit::STATUS_CLOSED) {
            return $this->show($guestVisit);
        }

        DB::transaction(function () use ($guestVisit) {
            $guestVisit->loadMissing(['permitLinks.entryPermit', 'vehicles']);
            $this->permitService->revokePermits($guestVisit);

            $guestVisit->update([
                'workflow_status' => GuestVisit::STATUS_CLOSED,
                'closed_at' => $guestVisit->closed_at ?? now(),
            ]);
        });

        return $this->show($guestVisit->fresh());
    }

    private function buildPayload(array $data, User $user, ?GuestVisit $guestVisit = null): array
    {
        $vehicles = array_values(array_filter($data['vehicles'] ?? [], static fn ($vehicle) => is_array($vehicle) && !empty($vehicle['plate_number'])));

        return [
            'yard_id' => $data['yard_id'],
            'guest_full_name' => $data['guest_full_name'],
            'guest_iin' => $data['guest_iin'] ?? null,
            'guest_company_name' => $data['guest_company_name'] ?? null,
            'guest_position' => $data['guest_position'],
            'guest_phone' => $data['guest_phone'],
            'host_name' => $data['host_name'],
            'host_phone' => $data['host_phone'],
            'visit_starts_at' => $data['visit_starts_at'],
            'visit_ends_at' => $data['visit_ends_at'] ?? null,
            'permit_kind' => $data['permit_kind'],
            'has_vehicle' => !empty($vehicles),
            'comment' => $data['comment'] ?? null,
            'source' => $data['source'] ?? ($guestVisit?->source ?? GuestVisit::SOURCE_OPERATOR),
            'created_by_user_id' => $guestVisit?->created_by_user_id ?? $user->id,
        ];
    }

    private function ensureMutable(GuestVisit $guestVisit): void
    {
        if (in_array($guestVisit->workflow_status, [GuestVisit::STATUS_CLOSED, GuestVisit::STATUS_CANCELED], true)) {
            throw ValidationException::withMessages([
                'id' => 'Закрытый или отменённый визит нельзя редактировать.',
            ]);
        }
    }

    private function ensureNoOverlap(array $data, ?GuestVisit $except = null): void
    {
        $yardId = $data['yard_id'];
        $activeQuery = GuestVisit::query()
            ->where('yard_id', $yardId)
            ->where('workflow_status', GuestVisit::STATUS_ACTIVE);

        if ($except !== null) {
            $activeQuery->where('id', '!=', $except->id);
        }

        // --- 1. Проверка по гостю (ИИН или ФИО+телефон) ---
        $iin = trim((string) ($data['guest_iin'] ?? ''));
        $name = trim((string) ($data['guest_full_name'] ?? ''));
        $phone = trim((string) ($data['guest_phone'] ?? ''));

        $guestQuery = (clone $activeQuery);

        if ($iin !== '') {
            $guestQuery->where('guest_iin', $iin);
        } else {
            $guestQuery->where('guest_full_name', $name)
                ->where('guest_phone', $phone);
        }

        if ($guestQuery->exists()) {
            throw ValidationException::withMessages([
                'guest_iin' => 'Для этого гостя уже существует активный визит на данном объекте.',
            ]);
        }

        // --- 2. Проверка по номерам ТС ---
        $plates = collect($data['vehicles'] ?? [])
            ->filter(fn ($v) => is_array($v) && !empty($v['plate_number']))
            ->pluck('plate_number')
            ->map(fn ($p) => mb_strtoupper(preg_replace('/\s+/', '', (string) $p)))
            ->filter()
            ->values()
            ->toArray();

        if (empty($plates)) {
            return;
        }

        $activeVisitIds = (clone $activeQuery)->pluck('id');

        if ($activeVisitIds->isEmpty()) {
            return;
        }

        $duplicatePlate = GuestVisitVehicle::query()
            ->whereIn('guest_visit_id', $activeVisitIds)
            ->whereIn(DB::raw('UPPER(REPLACE(plate_number, " ", ""))'), $plates)
            ->value('plate_number');

        if ($duplicatePlate !== null) {
            throw ValidationException::withMessages([
                'vehicles' => "Транспортное средство «{$duplicatePlate}» уже включено в активный визит на данном объекте.",
            ]);
        }
    }
}