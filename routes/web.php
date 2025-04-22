<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\RouteController;
use App\Http\Controllers\Settings\ProfileController;

Route::get('/', function () {
    return Inertia::render('welcome');
})->name('home');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', function () {
        return Inertia::render('dashboard');
    })->name('dashboard');
});

Route::get('/roles', [RoleController::class, 'index']);
Route::post('/roles', [RoleController::class, 'store']);
Route::post('/roles/assign', [RoleController::class, 'assignRole']);
Route::post('/roles/revoke', [RoleController::class, 'revoke']);

Route::get('/profile/user', [ProfileController::class, 'getUser']);
 
//Pages
Route::get('/roles_permissions', [RouteController::class, 'rolespermissions']);//Админка
Route::get('/trucks', [RouteController::class, 'trucks']);
Route::get('/tasks', [RouteController::class, 'tasks']);
Route::get('/weighing', [RouteController::class, 'weighing']);
Route::get('/check', [RouteController::class, 'check']);
Route::get('/history', [RouteController::class, 'history']);
Route::get('/warehouses', [RouteController::class, 'warehouses']);
Route::get('/integration_dss', [RouteController::class, 'integration_dss']);


require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
