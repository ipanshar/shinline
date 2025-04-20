<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\StatusCotroller;
use App\Http\Controllers\Api\TrailerModelCotroller;
use App\Http\Controllers\Api\TrailerTypeCotroller;
use App\Http\Controllers\Api\TruckBrandCotroller;
use App\Http\Controllers\Api\TruckCotroller;
use App\Http\Controllers\Api\TruckModelCotroller;
use App\Http\Controllers\Api\VisitorsCotroller;
use App\Http\Controllers\Api\WarehouseCotroller;
use App\Http\Controllers\Api\WarehouseGateCotroller;
use App\Http\Controllers\Api\YardCotroller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

Route::post('/login', function (Request $request) {
    return "json";
});

// Authification routes

Route::post('/auth/register', [AuthController::class, 'createUser']);
Route::post('/auth/login', [AuthController::class, 'loginUser']);
Route::post('/auth/logout', [AuthController::class,'logout']);
Route::post('/auth/newpassword', [AuthController::class,'newPassword']);
Route::post('/auth/logout-all-device', [AuthController::class,'deleteAllSessions']);
Route::post('/auth/create-recovery', [AuthController::class,'createRecoveryToken']);
Route::post('/auth/recovery-token', [AuthController::class,'recoveryToken']);
Route::post('/auth/level', [AuthController::class,'level'])->middleware('auth:sanctum');

// Yard routes
Route::post('/yard/getyards', [YardCotroller::class,'getYards'])->middleware('auth:sanctum');
Route::post('/yard/addyard', [YardCotroller::class,'addYard'])->middleware('auth:sanctum');
Route::post('/yard/updateyard', [YardCotroller::class,'updateYard'])->middleware('auth:sanctum');
Route::post('/yard/deleteyard', [YardCotroller::class,'deleteYard'])->middleware('auth:sanctum');

// Visitors routes
Route::post('/security/getvisitors', [VisitorsCotroller::class,'getVisitors'])->middleware('auth:sanctum');
Route::post('/security/addvisitor', [VisitorsCotroller::class,'addVisitor'])->middleware('auth:sanctum');
Route::post('/security/updatevisitor', [VisitorsCotroller::class,'updateVisitor'])->middleware('auth:sanctum');
Route::post('/security/exitvisitor', [VisitorsCotroller::class,'exitVisitor'])->middleware('auth:sanctum');

// Status routes
Route::post('/setings/getstatus', [StatusCotroller::class,'getStatus'])->middleware('auth:sanctum');
Route::post('/setings/addstatus', [StatusCotroller::class,'addStatus'])->middleware('auth:sanctum');
Route::post('/setings/updatestatus', [StatusCotroller::class,'updateStatus'])->middleware('auth:sanctum');

// Truck routes
Route::post('/trucs/gettrucks', [TruckCotroller::class,'getTrucks'])->middleware('auth:sanctum');
Route::post('/trucs/addtruck', [TruckCotroller::class,'addTruck'])->middleware('auth:sanctum');
Route::post('/trucs/updatetruck', [TruckCotroller::class,'updateTruck'])->middleware('auth:sanctum');
Route::post('/trucs/deletetruck', [TruckCotroller::class,'deleteTruck'])->middleware('auth:sanctum');

// Truck model routes
Route::post('/trucks/gettruckmodels', [TruckModelCotroller::class,'getTruckModels'])->middleware('auth:sanctum');
Route::post('/trucks/addtruckmodel', [TruckModelCotroller::class,'addTruckModel'])->middleware('auth:sanctum');
Route::post('/trucks/updatetruckmodel', [TruckModelCotroller::class,'updateTruckModel'])->middleware('auth:sanctum');
Route::post('/trucks/deletetruckmodel', [TruckModelCotroller::class,'deleteTruckModel'])->middleware('auth:sanctum');

// Truck brand routes
Route::post('/trucks/gettruckbrands', [TruckBrandCotroller::class,'getTruckBrands'])->middleware('auth:sanctum');
Route::post('/trucks/addtruckbrand', [TruckBrandCotroller::class,'addTruckBrand'])->middleware('auth:sanctum');
Route::post('/trucks/updatetruckbrand', [TruckBrandCotroller::class,'updateTruckBrand'])->middleware('auth:sanctum');
Route::post('/trucks/deletetruckbrand', [TruckBrandCotroller::class,'deleteTruckBrand'])->middleware('auth:sanctum');

// Trailer type routes
Route::post('/trailer/gettrailertypes', [TrailerTypeCotroller::class,'getTrailerTypes'])->middleware('auth:sanctum');
Route::post('/trailer/addtrailertype', [TrailerTypeCotroller::class,'addTrailerType'])->middleware('auth:sanctum');
Route::post('/trailer/updatetrailertype', [TrailerTypeCotroller::class,'updateTrailerType'])->middleware('auth:sanctum');
Route::post('/trailer/deletetrailertype', [TrailerTypeCotroller::class,'deleteTrailerType'])->middleware('auth:sanctum');

// Trailer model routes
Route::post('/trailer/gettrailermodels', [TrailerModelCotroller::class,'getTrailerModels'])->middleware('auth:sanctum');
Route::post('/trailer/addtrailermodel', [TrailerModelCotroller::class,'addTrailerModel'])->middleware('auth:sanctum');
Route::post('/trailer/updatetrailermodel', [TrailerModelCotroller::class,'updateTrailerModel'])->middleware('auth:sanctum');
Route::post('/trailer/deletetrailermodel', [TrailerModelCotroller::class,'deleteTrailerModel'])->middleware('auth:sanctum');

// Warehouse routes
Route::post('/warehouse/getwarehouses', [WarehouseCotroller::class,'getWarehouses'])->middleware('auth:sanctum');
Route::post('/warehouse/addwarehouse', [WarehouseCotroller::class,'addWarehouse'])->middleware('auth:sanctum');
Route::post('/warehouse/updatewarehouse', [WarehouseCotroller::class,'updateWarehouse'])->middleware('auth:sanctum');
Route::post('/warehouse/deletewarehouse', [WarehouseCotroller::class,'deleteWarehouse'])->middleware('auth:sanctum');

// Warehouse gates routes
Route::post('/warehouse/getgates', [WarehouseGateCotroller::class,'getGates'])->middleware('auth:sanctum');
Route::post('/warehouse/addgate', [WarehouseGateCotroller::class,'addGate'])->middleware('auth:sanctum');
Route::post('/warehouse/updategate', [WarehouseGateCotroller::class,'updateGate'])->middleware('auth:sanctum');
Route::post('/warehouse/deletegate', [WarehouseGateCotroller::class,'deleteGate'])->middleware('auth:sanctum');