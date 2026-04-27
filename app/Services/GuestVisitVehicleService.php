<?php

namespace App\Services;

use App\Models\GuestVisit;
use App\Models\GuestVisitVehicle;
use App\Models\Truck;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class GuestVisitVehicleService
{
    public function __construct(
        private GuestVisitPermitService $permitService,
    ) {
    }

    public function syncVehicles(GuestVisit $guestVisit, array $vehicles, int $userId): Collection
    {
        $normalizedVehicles = $this->normalizeVehiclesPayload($vehicles);
        $keepIds = [];

        foreach ($normalizedVehicles as $vehicleData) {
            $vehicle = null;

            if (!empty($vehicleData['id'])) {
                $vehicle = $guestVisit->vehicles()->whereKey($vehicleData['id'])->first();

                if (!$vehicle) {
                    throw ValidationException::withMessages([
                        'vehicles' => 'Указано несуществующее ТС для выбранного гостевого визита.',
                    ]);
                }
            }

            $payload = [
                'truck_id' => $this->resolveTruckId($vehicleData, $userId),
                'plate_number' => Truck::normalizePlateNumber($vehicleData['plate_number']) ?? $vehicleData['plate_number'],
                'brand' => $vehicleData['brand'] ?? null,
                'model' => $vehicleData['model'] ?? null,
                'color' => $vehicleData['color'] ?? null,
                'comment' => $vehicleData['comment'] ?? null,
            ];

            if ($vehicle) {
                $vehicle->update($payload);
            } else {
                $vehicle = $guestVisit->vehicles()->create($payload);
            }

            $keepIds[] = $vehicle->id;
        }

        if ($keepIds === []) {
            $guestVisit->vehicles()->get()->each(function (GuestVisitVehicle $vehicle) use ($guestVisit) {
                $this->deleteVehicle($guestVisit, $vehicle);
            });

            $guestVisit->forceFill(['has_vehicle' => false])->save();

            return collect();
        }

        $guestVisit->vehicles()
            ->whereNotIn('id', $keepIds)
            ->get()
            ->each(function (GuestVisitVehicle $vehicle) use ($guestVisit) {
                $this->deleteVehicle($guestVisit, $vehicle);
            });

        $guestVisit->forceFill(['has_vehicle' => true])->save();

        return $guestVisit->vehicles()->get();
    }

    public function addVehicle(GuestVisit $guestVisit, array $vehicleData, int $userId): GuestVisitVehicle
    {
        $vehicles = $this->normalizeVehiclesPayload([$vehicleData]);

        if ($vehicles === []) {
            throw ValidationException::withMessages([
                'vehicle' => 'Не удалось распознать данные ТС.',
            ]);
        }

        $payload = $vehicles[0];

        $vehicle = $guestVisit->vehicles()->create([
            'truck_id' => $this->resolveTruckId($payload, $userId),
            'plate_number' => Truck::normalizePlateNumber($payload['plate_number']) ?? $payload['plate_number'],
            'brand' => $payload['brand'] ?? null,
            'model' => $payload['model'] ?? null,
            'color' => $payload['color'] ?? null,
            'comment' => $payload['comment'] ?? null,
        ]);

        $guestVisit->forceFill(['has_vehicle' => true])->save();

        return $vehicle;
    }

    public function removeVehicle(GuestVisit $guestVisit, GuestVisitVehicle $vehicle): void
    {
        if ((int) $vehicle->guest_visit_id !== (int) $guestVisit->id) {
            throw ValidationException::withMessages([
                'vehicle_id' => 'ТС не принадлежит выбранному гостевому визиту.',
            ]);
        }

        $this->deleteVehicle($guestVisit, $vehicle);

        $guestVisit->forceFill([
            'has_vehicle' => $guestVisit->vehicles()->exists(),
        ])->save();
    }

    private function deleteVehicle(GuestVisit $guestVisit, GuestVisitVehicle $vehicle): void
    {
        DB::transaction(function () use ($guestVisit, $vehicle) {
            if ((int) $vehicle->guest_visit_id !== (int) $guestVisit->id) {
                throw ValidationException::withMessages([
                    'vehicle_id' => 'ТС не принадлежит выбранному гостевому визиту.',
                ]);
            }

            $this->permitService->revokeVehiclePermitsForVehicle($vehicle);
            $vehicle->delete();
        });
    }

    private function normalizeVehiclesPayload(array $vehicles): array
    {
        $normalized = [];

        foreach ($vehicles as $vehicle) {
            if (!is_array($vehicle)) {
                continue;
            }

            $plateNumber = Truck::normalizePlateNumber($vehicle['plate_number'] ?? null);
            $vehicleId = isset($vehicle['id']) ? (int) $vehicle['id'] : null;

            if ($plateNumber === null && !$vehicleId) {
                continue;
            }

            $normalized[] = [
                'id' => $vehicleId,
                'plate_number' => $plateNumber,
                'brand' => $vehicle['brand'] ?? null,
                'model' => $vehicle['model'] ?? null,
                'color' => $vehicle['color'] ?? null,
                'comment' => $vehicle['comment'] ?? null,
            ];
        }

        return $normalized;
    }

    private function resolveTruckId(array $vehicleData, int $userId): ?int
    {
        $plateNumber = Truck::normalizePlateNumber($vehicleData['plate_number'] ?? null);

        if ($plateNumber === null) {
            return null;
        }

        $truck = Truck::firstOrCreate(
            ['plate_number' => $plateNumber],
            [
                'name' => $plateNumber,
                'user_id' => $userId,
                'color' => $vehicleData['color'] ?? null,
            ]
        );

        if (($truck->color === null || $truck->color === '') && !empty($vehicleData['color'])) {
            $truck->color = $vehicleData['color'];
            $truck->save();
        }

        return $truck->id;
    }
}