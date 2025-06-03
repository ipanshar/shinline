<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\StatusCotroller;
use App\Http\Controllers\Api\TaskCotroller;
use App\Http\Controllers\Api\TrailerModelCotroller;
use App\Http\Controllers\Api\TrailerTypeCotroller;
use App\Http\Controllers\Api\TruckBrandCotroller;
use App\Http\Controllers\Api\TruckCotroller;
use App\Http\Controllers\Api\TruckModelCotroller;
use App\Http\Controllers\Api\VisitorsCotroller;
use App\Http\Controllers\Api\WarehouseCotroller;
use App\Http\Controllers\Api\WarehouseGateCotroller;
use App\Http\Controllers\Api\YardCotroller;
use App\Http\Controllers\DssController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');


// Authification routes

Route::post('/auth/register', [AuthController::class, 'createUser']); //Регистрация
Route::post('/auth/login', [AuthController::class, 'loginUser']); //Авторизация
Route::post('/auth/logout', [AuthController::class,'logout']); //Выход
Route::post('/auth/newpassword', [AuthController::class,'newPassword']); //Смена пароля
Route::post('/auth/logout-all-device', [AuthController::class,'deleteAllSessions']); //Выход со всех устройств
Route::post('/auth/create-recovery', [AuthController::class,'createRecoveryToken']); //Создание токена для восстановления пароля
Route::post('/auth/recovery-token', [AuthController::class,'recoveryToken']); //Проверка токена для восстановления пароля
Route::post('/auth/level', [AuthController::class,'level'])->middleware('auth:sanctum'); //Получить уровень доступа пользователя

// Yard routes
Route::post('/yard/getyards', [YardCotroller::class,'getYards'])->middleware('auth:sanctum'); //Получить все дворы
Route::post('/yard/addyard', [YardCotroller::class,'addYard'])->middleware('auth:sanctum'); //Добавить двор
Route::post('/yard/updateyard', [YardCotroller::class,'updateYard'])->middleware('auth:sanctum'); //Обновить двор
Route::post('/yard/deleteyard', [YardCotroller::class,'deleteYard'])->middleware('auth:sanctum'); //Удалить двор

// Visitors routes
Route::post('/security/getvisitors', [VisitorsCotroller::class,'getVisitors'])->middleware('auth:sanctum'); //Получить всех посетителей
Route::post('/security/addvisitor', [VisitorsCotroller::class,'addVisitor'])->middleware('auth:sanctum'); //Добавить посетителя
Route::post('/security/updatevisitor', [VisitorsCotroller::class,'updateVisitor'])->middleware('auth:sanctum'); //Обновить посетителя
Route::post('/security/exitvisitor', [VisitorsCotroller::class,'exitVisitor'])->middleware('auth:sanctum'); //Выход посетителя
Route::post('/security/searchtruck', [VisitorsCotroller::class,'searchTruck'])->middleware('auth:sanctum'); //Поиск грузовика
Route::post('/security/chattest', [VisitorsCotroller::class,'ChatTest']);

// Status routes
Route::post('/setings/getstatus', [StatusCotroller::class,'getStatuses'])->middleware('auth:sanctum'); //Получить все статусы
Route::post('/setings/addstatus', [StatusCotroller::class,'addStatus'])->middleware('auth:sanctum'); //Добавить статус
Route::post('/setings/updatestatus', [StatusCotroller::class,'updateStatus'])->middleware('auth:sanctum'); //Обновить статус

// Truck routes
Route::post('/trucs/gettrucks', [TruckCotroller::class,'getTrucks'])->middleware('auth:sanctum'); //Получить все грузовики
Route::post('/trucs/addtruck', [TruckCotroller::class,'addTruck'])->middleware('auth:sanctum'); //Добавить грузовик
Route::post('/trucs/updatetruck', [TruckCotroller::class,'updateTruck'])->middleware('auth:sanctum'); //Обновить грузовик
Route::post('/trucs/deletetruck', [TruckCotroller::class,'deleteTruck'])->middleware('auth:sanctum'); //Удалить грузовик

Route::post('/trucks/attachtruckuser', [TruckCotroller::class,'attachTruckUser'])->middleware('auth:sanctum'); //Привязать грузовик к пользователю
Route::post('/trucks/detachtruckuser', [TruckCotroller::class,'detachTruckUser'])->middleware('auth:sanctum'); //Отвязать грузовик от пользователя
Route::post('/trucks/gettruckusers', [TruckCotroller::class,'getTruckByUser'])->middleware('auth:sanctum'); //Получить грузовики пользователя

// Truck model routes
Route::post('/trucks/gettruckmodels', [TruckModelCotroller::class,'getTruckModels'])->middleware('auth:sanctum'); //Получить все модели грузовиков
Route::post('/trucks/addtruckmodel', [TruckModelCotroller::class,'addTruckModel'])->middleware('auth:sanctum'); //Добавить модель грузовика
Route::post('/trucks/updatetruckmodel', [TruckModelCotroller::class,'updateTruckModel'])->middleware('auth:sanctum'); //Обновить модель грузовика
Route::post('/trucks/deletetruckmodel', [TruckModelCotroller::class,'deleteTruckModel'])->middleware('auth:sanctum'); //Удалить модель грузовика

// Truck brand routes
Route::post('/trucks/gettruckbrands', [TruckBrandCotroller::class,'getTruckBrands'])->middleware('auth:sanctum'); //Получить все марки грузовиков
Route::post('/trucks/addtruckbrand', [TruckBrandCotroller::class,'addTruckBrand'])->middleware('auth:sanctum'); //Добавить марку грузовика
Route::post('/trucks/updatetruckbrand', [TruckBrandCotroller::class,'updateTruckBrand'])->middleware('auth:sanctum'); //Обновить марку грузовика
Route::post('/trucks/deletetruckbrand', [TruckBrandCotroller::class,'deleteTruckBrand'])->middleware('auth:sanctum'); //Удалить марку грузовика

// Trailer type routes
Route::post('/trailer/gettrailertypes', [TrailerTypeCotroller::class,'getTrailerTypes'])->middleware('auth:sanctum'); //Получить все типы прицепов
Route::post('/trailer/addtrailertype', [TrailerTypeCotroller::class,'addTrailerType'])->middleware('auth:sanctum'); //Добавить тип прицепа
Route::post('/trailer/updatetrailertype', [TrailerTypeCotroller::class,'updateTrailerType'])->middleware('auth:sanctum'); //Обновить тип прицепа
Route::post('/trailer/deletetrailertype', [TrailerTypeCotroller::class,'deleteTrailerType'])->middleware('auth:sanctum'); //Удалить тип прицепа

// Trailer model routes
Route::post('/trailer/gettrailermodels', [TrailerModelCotroller::class,'getTrailerModels'])->middleware('auth:sanctum'); //Получить все модели прицепов
Route::post('/trailer/addtrailermodel', [TrailerModelCotroller::class,'addTrailerModel'])->middleware('auth:sanctum'); //Добавить модель прицепа
Route::post('/trailer/updatetrailermodel', [TrailerModelCotroller::class,'updateTrailerModel'])->middleware('auth:sanctum'); //Обновить модель прицепа
Route::post('/trailer/deletetrailermodel', [TrailerModelCotroller::class,'deleteTrailerModel'])->middleware('auth:sanctum'); //Удалить модель прицепа

// Warehouse routes
Route::post('/warehouse/getwarehouses', [WarehouseCotroller::class,'getWarehouses'])->middleware('auth:sanctum'); //Получить все склады
Route::post('/warehouse/addwarehouse', [WarehouseCotroller::class,'addWarehouse'])->middleware('auth:sanctum'); //Добавить склад
Route::post('/warehouse/updatewarehouse', [WarehouseCotroller::class,'updateWarehouse'])->middleware('auth:sanctum'); //Обновить склад
Route::post('/warehouse/deletewarehouse', [WarehouseCotroller::class,'deleteWarehouse'])->middleware('auth:sanctum'); //Удалить склад

// Warehouse gates routes
Route::post('/warehouse/getgates', [WarehouseGateCotroller::class,'getGates'])->middleware('auth:sanctum'); //Получить все ворота
Route::post('/warehouse/addgate', [WarehouseGateCotroller::class,'addGate'])->middleware('auth:sanctum'); //Добавить ворота
Route::post('/warehouse/updategate', [WarehouseGateCotroller::class,'updateGate'])->middleware('auth:sanctum'); //Обновить ворота
Route::post('/warehouse/deletegate', [WarehouseGateCotroller::class,'deleteGate'])->middleware('auth:sanctum'); //Удалить ворота

// Task routes
Route::post('/task/gettasks', [TaskCotroller::class,'getTasks'])->middleware('auth:sanctum'); //Получить все задачи
Route::post('/task/addtask', [TaskCotroller::class,'addTask'])->middleware('auth:sanctum'); //Добавить задачу
Route::post('/task/addapitask', [TaskCotroller::class,'addApiTask']); //Добавить задачу через API
Route::post('/task/qrproccesing', [TaskCotroller::class,'qrProccesing'])->middleware('auth:sanctum'); //Обработка QR кода
Route::post('/task/processShortCode', [TaskCotroller::class,'processShortCode'])->middleware('auth:sanctum'); //Обработка QR кода
Route::get('/task/gate-codes', [TaskCotroller::class, 'getGateCodes']);
Route::post('/task/gettaskweihings', [TaskCotroller::class,'getTaskWeihings'])->middleware('auth:sanctum'); //Получить задачи все взвешивания 
Route::post('/task/updatetaskweighing', [TaskCotroller::class,'updateTaskWeighing'])->middleware('auth:sanctum'); //Обновить задачи взвешивание 
Route::post('/task/actual-tasks', [TaskCotroller::class, 'getActualTasks']);

//Dss routes
Route::post('/dss/autorization', [DssController::class, 'dssAutorization'])->middleware('auth:sanctum'); //Авторизация в DSS
Route::post('/dss/settings', [DssController::class, 'dssSettings'])->middleware('auth:sanctum'); //Получить настройки DSS
Route::post('/dss/settings/update', [DssController::class, 'dssSettingsUpdate'])->middleware('auth:sanctum'); //Обновить настройки DSS
Route::post('/dss/settings/create', [DssController::class, 'dssSettingsCreate'])->middleware('auth:sanctum'); //Создать настройки DSS
Route::post('/dss/settings/delete', [DssController::class, 'dssSettingsDelete'])->middleware('auth:sanctum'); //Удалить настройки DSS
Route::post('/dss/keepalive', [DssController::class, 'dssKeepAlive'])->middleware('auth:sanctum'); //Поддержание сессии DSS
Route::post('/dss/update-token', [DssController::class, 'dssUpdateToken'])->middleware('auth:sanctum'); //Обновление токена DSS
Route::post('/dss/unauthorize', [DssController::class, 'dssUnAuthorize'])->middleware('auth:sanctum'); //Выход из DSS  