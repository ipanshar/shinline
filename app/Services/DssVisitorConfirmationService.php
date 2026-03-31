<?php

namespace App\Services;

use App\Models\EntryPermit;
use App\Models\Status;
use App\Models\Truck;
use App\Models\Visitor;
use App\Models\Yard;

class DssVisitorConfirmationService
{
    public function __construct(private DssStatusCacheService $statusCache)
    {
    }

    public function resolve(?Yard $yard, ?Truck $truck, ?EntryPermit $permit = null): array
    {
        $isStrictMode = (bool) ($yard?->strict_mode ?? false);
        $truckFound = $truck !== null;
        $permitFound = $permit !== null;
        $autoConfirm = $truckFound && ($permitFound || !$isStrictMode);

        return [
            'status' => $autoConfirm ? Visitor::CONFIRMATION_CONFIRMED : Visitor::CONFIRMATION_PENDING,
            'auto_confirm' => $autoConfirm,
            'reason' => $this->resolveReason($isStrictMode, $truckFound, $permitFound),
            'strict_mode' => $isStrictMode,
            'truck_found' => $truckFound,
            'permit_found' => $permitFound,
        ];
    }

    public function hasActivePermitForTruck(int $truckId, int $yardId): bool
    {
        $activeStatusId = $this->statusCache->getId('active');

        if (!$activeStatusId) {
            return false;
        }

        return EntryPermit::where('truck_id', $truckId)
            ->where('yard_id', $yardId)
            ->where('status_id', $activeStatusId)
            ->where(function ($query) {
                $query->whereNull('end_date')
                    ->orWhere('end_date', '>=', now()->startOfDay());
            })
            ->exists();
    }

    private function resolveReason(bool $isStrictMode, bool $truckFound, bool $permitFound): string
    {
        if (!$truckFound) {
            return '🚫 ТС не найдено в базе';
        }

        if ($isStrictMode && !$permitFound) {
            return '🔒 Нет разрешения (строгий режим)';
        }

        if ($permitFound) {
            return '✅ Найдено активное разрешение';
        }

        if (!$isStrictMode) {
            return '✅ Известное ТС (свободный режим)';
        }

        return '👁️ Требуется проверка оператором КПП';
    }
}