<?php

use App\Http\Controllers\Api\RegionController;
use App\Http\Controllers\Api\UsersController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
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
use App\Http\Controllers\RoleController;
use App\Http\Controllers\RouteController;
use App\Http\Controllers\Settings\ProfileController;
use App\Http\Controllers\Admin\StatisticsController;
use App\Http\Controllers\Admin\TrafficStatsController;
use App\Http\Controllers\Api\EntryPermitController;
use App\Http\Controllers\WhatsAppController;

Route::get('/', function () {
    return Inertia::render('welcome');
})->name('home');
Route::post('/dss/dssalarmadd', [DssController::class, 'dssAlarmAdd']);
Route::get('/privacy', [RouteController::class, 'privacy']);
Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', function () {
        return Inertia::render('dashboard');
    })->name('dashboard');

    //Pages

Route::get('/integration_whatsapp_business', [RouteController::class, 'whatsappBusinessSettings']);
Route::get('/roles_permissions', [RouteController::class, 'rolespermissions']);//Админка
Route::get('/trucks', [RouteController::class, 'trucks']);
Route::get('/tasks', [RouteController::class, 'tasks']);
Route::get('/tasks/scheduling', [RouteController::class, 'taskHourlySchedule']);
Route::get('/tasks/operator-workplace', [RouteController::class, 'operatorWorkplace']);
Route::get('/weighing', [RouteController::class, 'weighing']);
Route::get('/check', [RouteController::class, 'check']);
Route::get('/history', [RouteController::class, 'history']);
Route::get('/warehouses', [RouteController::class, 'warehouses']);
Route::get('/integration_dss', [RouteController::class, 'integration_dss']);
Route::get('/chat', [RouteController::class, 'chat']);
Route::get('/chat/counterparty', [RouteController::class, 'chatCounterparty']);
Route::get('/statistics', [RouteController::class, 'statistics']);
route::get('/warehouses/gate', [RouteController::class, 'warehouseGate']);
route::get('/warehouses/kpp', [RouteController::class, 'warehouseKPP']);
Route::get('/integration_dss/settings', [RouteController::class, 'dssSettings']);
Route::get('/integration_dss/devices', [RouteController::class, 'dssDevices']);
Route::get('/integration_dss/zones', [RouteController::class, 'dssZones']);

// Справочники
Route::get('/references', [RouteController::class, 'references']);
Route::get('/references/empty', [RouteController::class, 'referencesEmpty']);

//whatsapp business settings API
Route::post('/whatsapp/business-settings', [WhatsAppController::class, 'whatsappBusinessSettingsCreateOrUpdate']);
Route::get('/whatsapp/business-settings', [WhatsAppController::class, 'whatsappBusinessSettingsGet']);
Route::post('/whatsapp/send-task', [WhatsAppController::class, 'getMessageTemplateNewTask']);


//Settings roles
Route::get('/roles', [RoleController::class, 'index']);
Route::post('/roles', [RoleController::class, 'store']);
Route::post('/roles/assign', [RoleController::class, 'assignRole']);
Route::post('/roles/revoke', [RoleController::class, 'revoke']);

Route::get('/profile/user', [ProfileController::class, 'getUser']);

Route::post('/yard/getyards', [YardCotroller::class,'getYards']); //Получить все дворы
Route::post('/yard/addyard', [YardCotroller::class,'addYard']); //Добавить двор
Route::post('/yard/updateyard', [YardCotroller::class,'updateYard']); //Обновить двор
Route::post('/yard/deleteyard', [YardCotroller::class,'deleteYard']); //Удалить двор

// Visitors routes
Route::post('/security/getvisitors', [VisitorsCotroller::class,'getVisitors']); //Получить всех посетителей
Route::post('/security/addvisitor', [VisitorsCotroller::class,'addVisitor']); //Добавить посетителя
Route::post('/security/updatevisitor', [VisitorsCotroller::class,'updateVisitor']); //Обновить посетителя
Route::post('/security/exitvisitor', [VisitorsCotroller::class,'exitVisitor']); //Выход посетителя
Route::post('/security/searchtruck', [VisitorsCotroller::class,'searchTruck']); //Поиск грузовика
Route::post('/security/getactivepermits', [VisitorsCotroller::class,'getActivePermits']); //Получить активные пропуска


// Status routes
Route::post('/setings/getstatus', [StatusCotroller::class,'getStatus']); //Получить все статусы
Route::post('/setings/addstatus', [StatusCotroller::class,'addStatus']); //Добавить статус
Route::post('/setings/updatestatus', [StatusCotroller::class,'updateStatus']); //Обновить статус

// Truck routes
Route::post('/trucs/gettrucks', [TruckCotroller::class,'getTrucks']); //Получить все грузовики
Route::post('/trucs/addtruck', [TruckCotroller::class,'addTruck']); //Добавить грузовик
Route::post('/trucs/updatetruck', [TruckCotroller::class,'updateTruck']); //Обновить грузовик
Route::post('/trucs/deletetruck', [TruckCotroller::class,'deleteTruck']); //Удалить грузовик

Route::post('/trucs/getcategories', [TruckCotroller::class,'getCategories']); //Получить все категории грузовиков
Route::post('/trucs/addcategory', [TruckCotroller::class,'addCategory']); //Добавить категорию грузовика
Route::post('/trucs/updatecategory', [TruckCotroller::class,'updateCategory']); //Обновить категорию грузовика
Route::post('/trucs/deletecategory', [TruckCotroller::class,'deleteCategory']); //Удалить категорию грузовика

Route::get('/trucs/search',      [TruckCotroller::class, 'searchByPlate']); // Поиск по номеру ТС для добавление задач

Route::post('/trucks/attachtruckuser', [TruckCotroller::class,'attachTruckUser']); //Привязать грузовик к пользователю
Route::post('/trucks/detachtruckuser', [TruckCotroller::class,'detachTruckUser']); //Отвязать грузовик от пользователя
Route::post('/trucks/gettruckusers', [TruckCotroller::class,'getTruckByUser']); //Получить грузовики пользователя

// Truck model routes
Route::post('/trucks/gettruckmodels', [TruckModelCotroller::class,'getTruckModels']); //Получить все модели грузовиков
Route::post('/trucks/addtruckmodel', [TruckModelCotroller::class,'addTruckModel']); //Добавить модель грузовика
Route::post('/trucks/updatetruckmodel', [TruckModelCotroller::class,'updateTruckModel']); //Обновить модель грузовика
Route::post('/trucks/deletetruckmodel', [TruckModelCotroller::class,'deleteTruckModel']); //Удалить модель грузовика

// Truck brand routes
Route::post('/trucks/gettruckbrands', [TruckBrandCotroller::class,'getTruckBrands']); //Получить все марки грузовиков
Route::post('/trucks/addtruckbrand', [TruckBrandCotroller::class,'addTruckBrand']); //Добавить марку грузовика
Route::post('/trucks/updatetruckbrand', [TruckBrandCotroller::class,'updateTruckBrand']); //Обновить марку грузовика
Route::post('/trucks/deletetruckbrand', [TruckBrandCotroller::class,'deleteTruckBrand']); //Удалить марку грузовика

// Trailer type routes
Route::post('/trailer/gettrailertypes', [TrailerTypeCotroller::class,'getTrailerTypes']); //Получить все типы прицепов
Route::post('/trailer/addtrailertype', [TrailerTypeCotroller::class,'addTrailerType']); //Добавить тип прицепа
Route::post('/trailer/updatetrailertype', [TrailerTypeCotroller::class,'updateTrailerType']); //Обновить тип прицепа
Route::post('/trailer/deletetrailertype', [TrailerTypeCotroller::class,'deleteTrailerType']); //Удалить тип прицепа

// Trailer model routes
Route::post('/trailer/gettrailermodels', [TrailerModelCotroller::class,'getTrailerModels']); //Получить все модели прицепов
Route::post('/trailer/addtrailermodel', [TrailerModelCotroller::class,'addTrailerModel']); //Добавить модель прицепа
Route::post('/trailer/updatetrailermodel', [TrailerModelCotroller::class,'updateTrailerModel']); //Обновить модель прицепа
Route::post('/trailer/deletetrailermodel', [TrailerModelCotroller::class,'deleteTrailerModel']); //Удалить модель прицепа

// Warehouse routes
Route::post('/warehouse/getwarehouses', [WarehouseCotroller::class,'getWarehouses']); //Получить все склады
Route::post('/warehouse/addwarehouse', [WarehouseCotroller::class,'addWarehouse']); //Добавить склад
Route::post('/warehouse/updatewarehouse', [WarehouseCotroller::class,'updateWarehouse']); //Обновить склад
Route::post('/warehouse/deletewarehouse', [WarehouseCotroller::class,'deleteWarehouse']); //Удалить склад

// Warehouse gates routes
Route::post('/warehouse/getgates', [WarehouseGateCotroller::class,'getGates']); //Получить все ворота
Route::post('/warehouse/addgate', [WarehouseGateCotroller::class,'addGate']); //Добавить ворота
Route::post('/warehouse/updategate', [WarehouseGateCotroller::class,'updateGate']); //Обновить ворота
Route::post('/warehouse/deletegate', [WarehouseGateCotroller::class,'deleteGate']); //Удалить ворота

// Task routes
Route::post('/task/gettasks', [TaskCotroller::class,'getTasks']); //Получить все задачи
Route::post('/task/addtask', [TaskCotroller::class,'addTask']); //Добавить задачу
Route::post('/task/qrproccesing', [TaskCotroller::class,'qrProccesing']); //Обработка QR кода
Route::post('/task/processShortCode', [TaskCotroller::class,'processShortCode']); //Обработка QR кода
Route::get('/task/gate-codes', [TaskCotroller::class, 'getGateCodes']);
Route::post('/task/gettaskweihings', [TaskCotroller::class,'getTaskWeihings']); //Получить задачи все взвешивания 
Route::post('/task/updatetaskweighing', [TaskCotroller::class,'updateTaskWeighing']); //Обновить задачи взвешивание 
Route::post('/task/actual-tasks', [TaskCotroller::class, 'getActualTasks']);
Route::post('/task/updatetime', [TaskCotroller::class, 'updateTaskTime']); //Обновить время задачи


Route::get('/admin/statistics', [StatisticsController::class, 'index']); //Получить статистику 
Route::get('/admin/getloadingstats', [StatisticsController::class, 'getLoadingStats']);
Route::get('/admin/traffic-stats', [TrafficStatsController::class, 'index']);

// Dss routes
Route::post('/dss/autorization', [DssController::class, 'dssAutorization']); //Авторизация в DSS
Route::post('/dss/settings', [DssController::class, 'dssSettings']); //Получить настройки DSS
Route::post('/dss/settings/update', [DssController::class, 'dssSettingsUpdate']); //Обновить настройки DSS
Route::post('/dss/settings/create', [DssController::class, 'dssSettingsCreate']); //Создать настройки DSS
Route::post('/dss/settings/delete', [DssController::class, 'dssSettingsDelete']); //Удалить настройки DSS
Route::post('/dss/keepalive', [DssController::class, 'dssKeepAlive']); //Поддержание сессии DSS
Route::post('/dss/update-token', [DssController::class, 'dssUpdateToken']); //Обновление токена DSS
Route::post('/dss/unauthorize', [DssController::class, 'dssUnAuthorize']); //Выход из DSS  
Route::post('/dss/dssdevices', [DssController::class, 'dssDevices']); //Получить устройства DSS
Route::post('/dss/dssdevices/update', [DssController::class, 'dssDevicesUpdate']); //Обновить устройства DSS
Route::post('/dss/truck-zone-history', [DssController::class, 'getTruckZoneHistory']); //Получить историю зон грузовика
Route::post('/dss/current-truck-zone', [DssController::class, 'getCurrentTruckZone']); //Получить текущую зону грузовика



Route::post('/entrance-permit/addcheckpoint', [EntryPermitController::class, 'addCheckpoint']);
Route::post('/entrance-permit/getcheckpoint', [EntryPermitController::class, 'getCheckpoint']);
Route::post('/entrance-permit/getallcheckpoints', [EntryPermitController::class, 'getAllCheckpoints']);
Route::post('/entrance-permit/updatecheckpoint', [EntryPermitController::class, 'updateCheckpoint']);
Route::post('/entrance-permit/deletecheckpoint', [EntryPermitController::class, 'deleteCheckpoint']);

Route::get('/users/without-roles', [UsersController::class, 'getUsersWithoutRoles']);

    // Region routes
Route::post('/regions/getregions', [RegionController::class, 'getRegions']); // Получить все регионы
Route::post('/regions/createupdate', [RegionController::class, 'createUpdateRegion']); // Создать или обновить регион

//Zone routes
Route::post('/zones/getzones', [\App\Http\Controllers\ZoneController::class, 'getZones']); // Получить все зоны
Route::post('/zones/createorupdate', [\App\Http\Controllers\ZoneController::class, 'createOrUpdateZone']); // Создать или обновить зону

// Counterparty routes
Route::post('/counterparty/getcounterparties', [\App\Http\Controllers\Api\CounterpartyController::class, 'getCounterparties']); // Получить всех контрагентов
Route::post('/counterparty/addcounterparty', [\App\Http\Controllers\Api\CounterpartyController::class, 'addCounterparty']); // Добавить контрагента
Route::post('/counterparty/updatecounterparty', [\App\Http\Controllers\Api\CounterpartyController::class, 'updateCounterparty']); // Обновить контрагента
Route::post('/counterparty/deletecounterparty', [\App\Http\Controllers\Api\CounterpartyController::class, 'deleteCounterparty']); // Удалить контрагента
Route::post('/counterparty/getcounterparty', [\App\Http\Controllers\Api\CounterpartyController::class, 'getCounterparty']); // Получить контрагента по ID
Route::post('/counterparty/searchbywhatsapp', [\App\Http\Controllers\Api\CounterpartyController::class, 'searchByWhatsApp']); // Поиск по WhatsApp

// Counterparty Chat routes
Route::post('/counterparty/chat/getlists', [\App\Http\Controllers\Api\CounterpartyChatController::class, 'getChatLists']); // Получить список чатов
Route::post('/counterparty/chat/getmessages', [\App\Http\Controllers\Api\CounterpartyChatController::class, 'getChatMessages']); // Получить сообщения чата
Route::post('/counterparty/chat/sendmessage', [\App\Http\Controllers\Api\CounterpartyChatController::class, 'sendMessage']); // Отправить сообщение
Route::post('/counterparty/chat/getorcreatechat', [\App\Http\Controllers\Api\CounterpartyChatController::class, 'getOrCreateChat']); // Получить или создать чат

});

 



require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
