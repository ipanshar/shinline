<?php
//это контроллер для работы с DSS (Distributed Security System)
// он включает в себя авторизацию, получение и обновление настроек, поддержание сессии, обновление токена и выход из системы
// также он включает в себя методы для работы с тревогами (alarms), такие как добавление тревоги в лог
// и получение настроек DSS
// он использует сервис DssService для выполнения операций с DSS
// он использует модель DssSetings для работы с настройками DSS в базе данных

namespace App\Http\Controllers;

use App\Models\Devaice;
use App\Models\DssSetings;
use App\Services\DssService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DssController extends Controller
{
    protected $dssService;
    public function __construct(DssService $dssService)
    {
        $this->dssService = $dssService;
    }

    public function dssAutorization()
    {
        $dssSeting = DssSetings::first();
        if (!$dssSeting) {
            return response()->json(['error' => 'DSS settings not found'], 404);
        }
        $username = $dssSeting->user_name;
        $password = $dssSeting->password;
        $firstLoginResponse = $this->dssService->firstLogin($username);
        if (!isset($firstLoginResponse['realm'], $firstLoginResponse['randomKey'])) {
            return response()->json(['error' => 'Ошибка первого этапа авторизации'], 401);
        }

        $secondLoginResponse = $this->dssService->secondLogin(
            $username,
            $password,
            $firstLoginResponse['realm'],
            $firstLoginResponse['randomKey']
        );
        if (!isset($secondLoginResponse['token'])) {
            return response()->json(['error' => 'Токен не получен, ошибка второго этапа авторизации'], 401);
        }
        return response()->json($secondLoginResponse);
    }

    //Получение настроек DSS
    public function dssSettings()
    {
        $dssSeting = DssSetings::first();
        if (!$dssSeting) {
            return response()->json(['error' => 'DSS settings not found'], 404);
        }
        return response()->json($dssSeting);
    }

    //Обновление настроек DSS
    public function dssSettingsUpdate(Request $request)
    {
        $dssSeting = DssSetings::where('id', $request->id)->first();
        if (!$dssSeting) {
            return response()->json(['error' => 'DSS settings not found'], 404);
        }
        $dssSeting->update($request->all());
        return response()->json($dssSeting);
    }

    //Создание настроек DSS
    public function dssSettingsCreate(Request $request)
    {
        $dssSeting = DssSetings::create($request->all());
        return response()->json($dssSeting, 201);
    }
    //удаление настроек DSS
    public function dssSettingsDelete(Request $request)
    {
        $dssSeting = DssSetings::where('id', $request->id)->first();
        if (!$dssSeting) {
            return response()->json(['error' => 'DSS settings not found'], 404);
        }
        $dssSeting->delete();
        return response()->json(['message' => 'DSS settings deleted successfully']);
    }

    //
    //Поддержание сессии DSS
    public function dssKeepAlive()
    {
        $keepAliveResponse = $this->dssService->dssKeepAlive();
        if (isset($keepAliveResponse['error'])) {
            return response()->json(['error' => $keepAliveResponse], 500);
        }
        return response()->json(['message' => 'DSS session kept alive successfully', 'data' => $keepAliveResponse]);
    }

    //Обновление токена DSS
    public function dssUpdateToken()
    {
        $updateTokenResponse = $this->dssService->dssUpdateToken();
        if (isset($updateTokenResponse['error'])) {
            return response()->json(['error' => $updateTokenResponse['error']], 500);
        }
        return response()->json(['message' => 'DSS token updated successfully']);
    }

    //Выход из DSS
    public function dssUnauthorize()
    {
        $logoutResponse = $this->dssService->dssUnauthorize();
        if (isset($logoutResponse['error'])) {
            return response()->json(['error' => $logoutResponse['error']], 500);
        }
        return response()->json(['message' => 'Logged out from DSS successfully']);
    }

    public function dssAlarmAdd(Request $request)
    {
        try {
            $data = json_encode($request->all(), JSON_PRETTY_PRINT) . "\n";
            Storage::disk('local')->append('dss_alarm_log.txt', $data);
            return response()->json(['message' => 'Запись успешно добавлена', 'data' => $request->all()], 201);
        } catch (\Exception $e) {
            return response()->json(['error' => 'Ошибка при записи в файл', 'data' => $e->getMessage()], 500);
        }
    }

    public function dssDevicesUpdate(Request $request)
    {
        $devaices = Devaice::where('id', $request->id)->get();
        if ($devaices->isEmpty()) {
            return response()->json(['error' => 'Устройства не найдены'], 404);
        }
        foreach ($devaices as $device) {
            $device->update($request->all());
        }
        return response()->json(['status' => true, 'message' => 'Устройства успешно обновлены', 'data' => $devaices], 200);
    }

    public function dssDevices(Request $request)
    {
        $devaices = Devaice::all();
        if ($devaices->isEmpty()) {
            return response()->json(['error' => 'Устройства не найдены'], 404);
        }
        return response()->json(['status' => true, 'message' => 'Устройства успешно получены', 'data' => $devaices], 200);
    }

    /**
     * Получить историю зон для грузовика
     */
    public function getTruckZoneHistory(Request $request)
    {
        $validated = $request->validate([
            'truck_id' => 'required|integer|exists:trucks,id',
            'limit' => 'integer|min:1|max:500',
        ]);

        $limit = $validated['limit'] ?? 100; // По умолчанию 100 последних записей

        $history = \App\Models\TruckZoneHistory::where('truck_id', $validated['truck_id'])
            ->with(['zone', 'device', 'task'])
            ->orderBy('entry_time', 'desc')
            ->limit($limit)
            ->get()
            ->map(function ($item) {
                return [
                    'id' => $item->id,
                    'truck_id' => $item->truck_id,
                    'zone_id' => $item->zone_id,
                    'zone_name' => $item->zone->name ?? null,
                    'device_id' => $item->device_id,
                    'device_name' => $item->device->channelName ?? null,
                    'device_type' => $item->device->type ?? null,
                    'task_id' => $item->task_id,
                    'task_name' => $item->task->name ?? null,
                    'entry_time' => $item->entry_time,
                    'exit_time' => $item->exit_time,
                    'duration' => $item->exit_time ? $item->entry_time->diffInMinutes($item->exit_time) : null,
                    'created_at' => $item->created_at,
                ];
            });

        return response()->json([
            'status' => true,
            'message' => 'История зон успешно получена',
            'data' => $history
        ], 200);
    }

    /**
     * Получить текущую зону грузовика
     */
    public function getCurrentTruckZone(Request $request)
    {
        $validated = $request->validate([
            'truck_id' => 'required|integer|exists:trucks,id',
        ]);

        $currentZone = \App\Models\TruckZoneHistory::where('truck_id', $validated['truck_id'])
            ->whereNull('exit_time')
            ->with(['zone', 'device'])
            ->orderBy('entry_time', 'desc')
            ->first();

        if (!$currentZone) {
            return response()->json([
                'status' => true,
                'message' => 'Грузовик не находится ни в одной зоне',
                'data' => null
            ], 200);
        }

        return response()->json([
            'status' => true,
            'message' => 'Текущая зона найдена',
            'data' => [
                'zone_id' => $currentZone->zone_id,
                'zone_name' => $currentZone->zone->name ?? null,
                'device_name' => $currentZone->device->channelName ?? null,
                'entry_time' => $currentZone->entry_time,
                'duration_minutes' => now()->diffInMinutes($currentZone->entry_time),
            ]
        ], 200);
    }
}
