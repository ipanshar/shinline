<?php

namespace App\Http\Controllers;

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
    // Преобразуем запрос в JSON-формат
    $data = json_encode($request->all(), JSON_PRETTY_PRINT) . "\n";

    // Записываем данные в файл, добавляя их в конец
    Storage::disk('local')->append('dss_alarm_log.txt', $data);

    return response()->json(['message' => 'Запись успешно добавлена']);
}

  

}
