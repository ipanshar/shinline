<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\GuestVisits\AddGuestVisitVehicleRequest;
use App\Http\Requests\GuestVisits\CancelGuestVisitRequest;
use App\Http\Requests\GuestVisits\CheckInGuestVisitRequest;
use App\Http\Requests\GuestVisits\CheckOutGuestVisitRequest;
use App\Http\Requests\GuestVisits\CloseGuestVisitRequest;
use App\Http\Requests\GuestVisits\CreateGuestVisitRequest;
use App\Http\Requests\GuestVisits\GuestVisitListRequest;
use App\Http\Requests\GuestVisits\IssueGuestVisitPermitsRequest;
use App\Http\Requests\GuestVisits\RemoveGuestVisitVehicleRequest;
use App\Http\Requests\GuestVisits\RevokeGuestVisitPermitsRequest;
use App\Http\Requests\GuestVisits\ShowGuestVisitRequest;
use App\Http\Requests\GuestVisits\UpdateGuestVisitRequest;
use App\Models\GuestVisit;
use App\Models\GuestVisitVehicle;
use App\Services\GuestVisitPermitService;
use App\Services\GuestVisitService;
use App\Services\GuestVisitVehicleService;

class GuestVisitController extends Controller
{
    public function list(GuestVisitListRequest $request, GuestVisitService $service)
    {
        $paginated = $service->paginate($request->validated());

        return response()->json([
            'status' => true,
            'data' => $paginated->items(),
            'pagination' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
                'from' => $paginated->firstItem(),
                'to' => $paginated->lastItem(),
            ],
        ]);
    }

    public function create(CreateGuestVisitRequest $request, GuestVisitService $service)
    {
        $guestVisit = $service->create($request->validated(), $request->user());

        return response()->json([
            'status' => true,
            'message' => 'Гостевой визит создан',
            'data' => $guestVisit,
        ]);
    }

    public function update(UpdateGuestVisitRequest $request, GuestVisitService $service)
    {
        $guestVisit = GuestVisit::findOrFail($request->integer('id'));
        $guestVisit = $service->update($guestVisit, $request->validated(), $request->user());

        return response()->json([
            'status' => true,
            'message' => 'Гостевой визит обновлён',
            'data' => $guestVisit,
        ]);
    }

    public function show(ShowGuestVisitRequest $request, GuestVisitService $service)
    {
        $guestVisit = GuestVisit::findOrFail($request->integer('id'));

        return response()->json([
            'status' => true,
            'data' => $service->show($guestVisit),
        ]);
    }

    public function cancel(CancelGuestVisitRequest $request, GuestVisitService $service)
    {
        $guestVisit = GuestVisit::findOrFail($request->integer('id'));

        return response()->json([
            'status' => true,
            'message' => 'Гостевой визит отменён',
            'data' => $service->cancel($guestVisit, $request->user()),
        ]);
    }

    public function close(CloseGuestVisitRequest $request, GuestVisitService $service)
    {
        $guestVisit = GuestVisit::findOrFail($request->integer('id'));

        return response()->json([
            'status' => true,
            'message' => 'Гостевой визит закрыт',
            'data' => $service->close($guestVisit),
        ]);
    }

    public function addVehicle(AddGuestVisitVehicleRequest $request, GuestVisitVehicleService $service, GuestVisitService $guestVisitService)
    {
        $guestVisit = GuestVisit::findOrFail($request->integer('guest_visit_id'));
        $service->addVehicle($guestVisit, $request->validated(), $request->user()->id);

        return response()->json([
            'status' => true,
            'message' => 'ТС добавлено к гостевому визиту',
            'data' => $guestVisitService->show($guestVisit->fresh()),
        ]);
    }

    public function removeVehicle(RemoveGuestVisitVehicleRequest $request, GuestVisitVehicleService $service, GuestVisitService $guestVisitService)
    {
        $guestVisit = GuestVisit::findOrFail($request->integer('guest_visit_id'));
        $vehicle = GuestVisitVehicle::findOrFail($request->integer('vehicle_id'));
        $service->removeVehicle($guestVisit, $vehicle);

        return response()->json([
            'status' => true,
            'message' => 'ТС удалено из гостевого визита',
            'data' => $guestVisitService->show($guestVisit->fresh()),
        ]);
    }

    public function checkIn(CheckInGuestVisitRequest $request, GuestVisitService $service)
    {
        $guestVisit = GuestVisit::findOrFail($request->integer('id'));
        $guestVisit->forceFill([
            'last_exit_at'  => null,
        ])->save();
        $guestVisit = $service->markArrived($guestVisit, now());

        return response()->json([
            'status'  => true,
            'message' => 'Приход гостя отмечен',
            'data'    => $guestVisit,
        ]);
    }

    public function checkOut(CheckOutGuestVisitRequest $request, GuestVisitService $service)
    {
        $guestVisit = GuestVisit::findOrFail($request->integer('id'));

        $now = now();

        $guestVisit->forceFill(['last_exit_at' => $now])->save();

        // Для разовых визитов — автоматически закрываем
        if (
            $guestVisit->workflow_status === GuestVisit::STATUS_ACTIVE
            && $guestVisit->permit_kind === GuestVisit::PERMIT_KIND_ONE_TIME
        ) {
            $service->close($guestVisit->fresh());
        }

        return response()->json([
            'status'  => true,
            'message' => 'Уход гостя отмечен',
            'data'    => $service->show($guestVisit->fresh()),
        ]);
    }

    public function issuePermits(IssueGuestVisitPermitsRequest $request, GuestVisitPermitService $permitService, GuestVisitService $guestVisitService)
    {
        $guestVisit = GuestVisit::findOrFail($request->integer('id'));
        $guestVisit->loadMissing('vehicles');
        $result = $permitService->issuePermits($guestVisit, $request->user()->id);

        return response()->json([
            'status' => true,
            'message' => 'Пропуска выпущены',
            'result' => $result,
            'data' => $guestVisitService->show($guestVisit->fresh()),
        ]);
    }

    public function revokePermits(RevokeGuestVisitPermitsRequest $request, GuestVisitPermitService $permitService, GuestVisitService $guestVisitService)
    {
        $guestVisit = GuestVisit::findOrFail($request->integer('id'));
        $guestVisit->loadMissing(['permitLinks.entryPermit', 'vehicles']);
        $result = $permitService->revokePermits($guestVisit);

        return response()->json([
            'status' => true,
            'message' => 'Пропуска отозваны',
            'result' => $result,
            'data' => $guestVisitService->show($guestVisit->fresh()),
        ]);
    }
}