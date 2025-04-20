<?php

use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use App\Http\Controllers\RoleController;
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
Route::get('/roles_permissions', [RoleController::class, 'rolespermissions']);//Админка
Route::get('/productsmanagment', [RoleController::class, 'productsmanagment']);//товары
Route::get('/rate', [RoleController::class, 'rate']);//курс
Route::get('/profile/user', [ProfileController::class, 'getUser']);


require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
