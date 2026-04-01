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
use App\Services\DssAuthService;
use App\Services\DssObservabilityService;
use App\Services\DssParkingService;
use App\Services\DssPersonService;
use App\Services\DssZoneHistoryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class DssController extends Controller
{
    public function __construct(
        protected DssAuthService $authService,
        protected DssPersonService $personService,
        protected DssParkingService $parkingService,
        protected DssZoneHistoryService $zoneHistoryService,
        protected DssObservabilityService $observabilityService,
    ) {
    }

    private function settingsRules(bool $isUpdate = false): array
    {
        $baseRules = [
            'base_url' => ['required', 'string', 'max:2048', 'url:http,https'],
            'user_name' => ['required', 'string', 'min:1', 'max:255'],
            'password' => ['required', 'string', 'min:1', 'max:255'],
            'subhour' => ['nullable', 'integer', 'min:0', 'max:8760'],
            'client_type' => ['nullable', 'string', Rule::in(['WINPC_V2'])],
        ];

        if ($isUpdate) {
            return array_merge([
                'id' => ['required', 'integer', 'exists:dss_setings,id'],
            ], $baseRules);
        }

        return $baseRules;
    }

    private function successResponse(string $message, array $data = [], int $status = 200)
    {
        return response()->json([
            'status' => true,
            'message' => $message,
            'data' => $data,
        ], $status);
    }

    private function errorResponse(string $message, $details = null, int $status = 400)
    {
        $payload = [
            'status' => false,
            'error' => $message,
        ];

        if ($details !== null) {
            $payload['details'] = $details;
        }

        return response()->json($payload, $status);
    }

    public function dssAutorization()
    {
        $authorizationResult = $this->authService->dssAutorize();

        if (isset($authorizationResult['error'])) {
            return $this->errorResponse($authorizationResult['error'], $authorizationResult, 400);
        }

        return $this->successResponse('Авторизация DSS выполнена успешно', $authorizationResult);
    }

    //Получение настроек DSS
    public function dssSettings()
    {
        $dssSeting = DssSetings::first();
        if (!$dssSeting) {
            return response()->json(['status' => false, 'error' => 'DSS settings not found'], 404);
        }

        return response()->json([
            'status' => true,
            'data' => $dssSeting,
        ]);
    }

    //Обновление настроек DSS
    public function dssSettingsUpdate(Request $request)
    {
        $validated = $request->validate($this->settingsRules(true));

        $dssSeting = DssSetings::find($validated['id']);
        if (!$dssSeting) {
            return response()->json(['status' => false, 'error' => 'DSS settings not found'], 404);
        }

        $dssSeting->update([
            'base_url' => $validated['base_url'],
            'user_name' => $validated['user_name'],
            'password' => $validated['password'],
            'subhour' => $validated['subhour'] ?? 0,
            'client_type' => $validated['client_type'] ?? $dssSeting->client_type,
        ]);

        return response()->json([
            'status' => true,
            'message' => 'DSS settings updated successfully',
            'data' => $dssSeting->fresh(),
        ]);
    }

    //Создание настроек DSS
    public function dssSettingsCreate(Request $request)
    {
        if (DssSetings::exists()) {
            return response()->json([
                'status' => false,
                'error' => 'DSS settings already exist. Use update instead.',
            ], 409);
        }

        $validated = $request->validate($this->settingsRules());

        $dssSeting = DssSetings::create([
            'base_url' => $validated['base_url'],
            'user_name' => $validated['user_name'],
            'password' => $validated['password'],
            'subhour' => $validated['subhour'] ?? 0,
            'client_type' => $validated['client_type'] ?? 'WINPC_V2',
        ]);

        return response()->json([
            'status' => true,
            'message' => 'DSS settings created successfully',
            'data' => $dssSeting,
        ], 201);
    }
    //удаление настроек DSS
    public function dssSettingsDelete(Request $request)
    {
        $validated = $request->validate([
            'id' => ['required', 'integer', 'exists:dss_setings,id'],
        ]);

        $dssSeting = DssSetings::find($validated['id']);
        if (!$dssSeting) {
            return response()->json(['status' => false, 'error' => 'DSS settings not found'], 404);
        }

        $dssSeting->delete();

        return response()->json(['status' => true, 'message' => 'DSS settings deleted successfully']);
    }

    //
    //Поддержание сессии DSS
    public function dssKeepAlive()
    {
        $keepAliveResponse = $this->authService->dssKeepAlive();
        if (isset($keepAliveResponse['error'])) {
            return $this->errorResponse($keepAliveResponse['error'], $keepAliveResponse, 500);
        }

        return $this->successResponse('DSS session kept alive successfully', $keepAliveResponse);
    }

    //Обновление токена DSS
    public function dssUpdateToken()
    {
        $updateTokenResponse = $this->authService->dssUpdateToken();
        if (isset($updateTokenResponse['error'])) {
            return $this->errorResponse($updateTokenResponse['error'], $updateTokenResponse, 500);
        }

        return $this->successResponse('DSS token updated successfully', $updateTokenResponse);
    }

    //Выход из DSS
    public function dssUnauthorize()
    {
        $logoutResponse = $this->authService->dssUnauthorize();
        if (isset($logoutResponse['error'])) {
            return $this->errorResponse($logoutResponse['error'], $logoutResponse, 500);
        }

        return $this->successResponse('Logged out from DSS successfully');
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
        $validated = $request->validate([
            'id' => ['required', 'integer', 'exists:devaices,id'],
            'channelName' => ['required', 'string', 'max:255'],
            'checkpoint_id' => ['nullable', 'integer', 'exists:checkpoints,id'],
            'type' => ['required', 'string', Rule::in(['Entry', 'Exit'])],
            'zone_id' => ['nullable', 'integer', 'exists:zones,id'],
            'barrier_channel_id' => ['nullable', 'string', 'max:255'],
        ]);

        $devaices = Devaice::where('id', $validated['id'])->get();
        if ($devaices->isEmpty()) {
            return response()->json(['error' => 'Устройства не найдены'], 404);
        }

        foreach ($devaices as $device) {
            $device->update([
                'channelName' => $validated['channelName'],
                'checkpoint_id' => $validated['checkpoint_id'] ?? null,
                'type' => $validated['type'],
                'zone_id' => $validated['zone_id'] ?? null,
                'barrier_channel_id' => $validated['barrier_channel_id'] ?? null,
            ]);
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

    public function syncBarrierChannelsFromParkingLots()
    {
        $result = $this->parkingService->syncBarrierChannelsToDevices();

        if (isset($result['error'])) {
            return $this->errorResponse($result['error'], $result['details'] ?? $result, 500);
        }

        return $this->successResponse('channelId шлагбаумов загружены из DSS', $result);
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
                    'is_active' => $item->isActive(),
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

        $currentZone = $this->zoneHistoryService->getCurrentZoneForTruck($validated['truck_id']);

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

    public function technicalOverview(Request $request)
    {
        $validated = $request->validate([
            'period_minutes' => 'nullable|integer|min:5|max:1440',
        ]);

        $overview = $this->observabilityService->getOverview((int) ($validated['period_minutes'] ?? 60));

        return response()->json([
            'status' => true,
            'message' => 'Технический обзор DSS успешно получен',
            'data' => $overview,
        ]);
    }

    public function eventsJournal(Request $request)
    {
        $validated = $request->validate([
            'limit' => 'nullable|integer|min:1|max:500',
            'level' => 'nullable|string|in:info,warning,error,critical',
        ]);

        $journal = $this->observabilityService->getJournal(
            (int) ($validated['limit'] ?? 100),
            $validated['level'] ?? null,
        );

        return response()->json([
            'status' => true,
            'message' => 'Журнал DSS успешно получен',
            'data' => $journal,
        ]);
    }

    /**
     * Добавить нового пользователя в DSS
     * 
     * Ожидаемые данные в запросе:
     * {
     *   "firstName": "Сергей",
     *   "lastName": "Иванов",
     *   "gender": 1,              // 1 - мужской, 2 - женский
     *   "iin": "010405599456",     // номер паспорта/ИИН
     *   "data": "1995-12-06",      // дата рождения в формате Y-m-d
     *   "foto": "BASE64_IMAGE_DATA" // фото в BASE64 (может быть массив)
     * }
     */
    public function dssAddPerson(Request $request)
    {
        try {
            // Валидация входных данных
            $validated = $request->validate([
                'firstName' => 'required|string|max:255',
                'lastName' => 'required|string|max:255',
                'gender' => 'required|integer|in:1,2', // 1 - мужской, 2 - женский
                'iin' => 'required|string|max:50',
                'data' => 'required|date_format:Y-m-d',
                'foto' => 'required', // может быть строка или массив
            ]);

            // Вызываем метод сервиса для добавления пользователя
            $result = $this->personService->dssAddPerson($validated);

            // Проверяем результат
            if (isset($result['error'])) {
                return response()->json([
                    'status' => false,
                    'message' => 'Ошибка при добавлении пользователя в DSS',
                    'error' => $result['error'],
                    'details' => $result['data'] ?? ($result['response'] ?? null)
                ], 400);
            }

            return response()->json([
                'status' => true,
                'message' => 'Пользователь успешно добавлен в DSS',
                'data' => $result['data'] ?? null
            ], 201);

        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'status' => false,
                'message' => 'Ошибка валидации данных',
                'errors' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Внутренняя ошибка сервера',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}
