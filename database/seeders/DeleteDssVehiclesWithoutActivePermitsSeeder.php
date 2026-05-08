<?php

namespace Database\Seeders;

use App\Models\DssParkingPermit;
use App\Models\EntryPermit;
use App\Models\Status;
use App\Services\DssPermitVehicleService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class DeleteDssVehiclesWithoutActivePermitsSeeder extends Seeder
{
    public function run(): void
    {
        $activeStatusId = Status::where('key', 'active')->value('id');

        if (!$activeStatusId) {
            $this->command?->warn("Статус 'active' не найден. Seeder остановлен.");

            return;
        }

        /** @var DssPermitVehicleService $permitVehicleService */
        $permitVehicleService = app(DssPermitVehicleService::class);

        $summary = [
            'checked' => 0,
            'deleted' => 0,
            'failed' => 0,
            'skipped' => 0,
            'active_skipped' => 0,
            'duplicate_remote_ids' => 0,
        ];
        $processedRemoteVehicleIds = [];

        $parkingPermits = DssParkingPermit::query()
            ->with('entryPermit')
            ->whereHas('entryPermit')
            ->whereNotNull('remote_vehicle_id')
            ->where('remote_vehicle_id', '!=', '')
            ->orderByRaw("CASE WHEN status = 'deleted' THEN 1 ELSE 0 END")
            ->orderByDesc('synced_at')
            ->orderByDesc('id')
            ->get();

        foreach ($parkingPermits as $parkingPermit) {
            $summary['checked']++;

            $remoteVehicleId = trim((string) $parkingPermit->remote_vehicle_id);
            if ($remoteVehicleId === '') {
                $summary['skipped']++;

                continue;
            }

            if (isset($processedRemoteVehicleIds[$remoteVehicleId])) {
                $summary['duplicate_remote_ids']++;

                continue;
            }

            $processedRemoteVehicleIds[$remoteVehicleId] = true;

            $permit = $parkingPermit->entryPermit;
            if (!$permit instanceof EntryPermit) {
                $summary['skipped']++;

                continue;
            }

            if ($this->isPermitEffectivelyActive($permit, $activeStatusId)) {
                $summary['active_skipped']++;

                continue;
            }

            $result = $permitVehicleService->revokePermitVehicleSafely($permit->fresh());

            if (!empty($result['success'])) {
                $summary['deleted']++;

                continue;
            }

            if (isset($result['error'])) {
                $summary['failed']++;

                continue;
            }

            $summary['skipped']++;
        }

        $this->command?->info('Удаление ТС из DSS без активных разрешений завершено.');
        $this->command?->table(
            ['checked', 'deleted', 'failed', 'skipped', 'active_skipped', 'duplicate_remote_ids'],
            [[
                $summary['checked'],
                $summary['deleted'],
                $summary['failed'],
                $summary['skipped'],
                $summary['active_skipped'],
                $summary['duplicate_remote_ids'],
            ]]
        );
    }

    private function isPermitEffectivelyActive(EntryPermit $permit, int $activeStatusId): bool
    {
        if ((int) $permit->status_id !== $activeStatusId) {
            return false;
        }

        return !$permit->end_date || Carbon::parse($permit->end_date)->greaterThanOrEqualTo(now()->startOfDay());
    }
}