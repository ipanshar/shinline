<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Role;
use Illuminate\Http\Request;
use Inertia\Inertia;

class RoleController extends Controller
{
    public function index()
    {
        $roles = Role::all();
        $users = User::with('roles')->get();

        return response()->json([
            'roles' => $roles,
            'users' => $users,
        ]);
    }

    public function store(Request $request)
    {
        $request->validate(['name' => 'required|string|unique:roles']);

        $role = Role::create(['name' => $request->name]);

        return response()->json(['message' => 'Роль создана успешно!', 'role' => $role]);
    }

    public function assignRole(Request $request)
    {
        $request->validate([
            'user_id' => 'required|exists:users,id',
            'role_id' => 'required|exists:roles,id',
        ]);

        $user = User::find($request->user_id);
        $user->roles()->syncWithoutDetaching([$request->role_id]);

        return response()->json(['message' => 'Роль успешно назначена!']);
    }

    public function rolespermissions(){
        return Inertia::render('settings/rolespermissions');
    }
    public function productsmanagment(){
        return Inertia::render('settings/products-managment');
    }
    public function rate(){
        return Inertia::render('settings/rate');
    }


    /**
     * Отменить роль у пользователя.
     */
    public function revoke(Request $request)
    {
        // Валидация входных данных
        $validatedData = $request->validate([
            'user_id' => 'required|exists:users,id',
            'role_id' => 'required|exists:roles,id',
        ]);

        // Найти пользователя и роль
        $user = User::find($validatedData['user_id']);
        $role = Role::find($validatedData['role_id']);

        if (!$user || !$role) {
            return response()->json([
                'message' => 'Пользователь или роль не найдены.',
            ], 404);
        }

        // Отменить (удалить) роль у пользователя
        if ($user->roles()->detach($role->id)) {
            return response()->json([
                'message' => 'Роль успешно отменена.',
            ], 200);
        } else {
            return response()->json([
                'message' => 'Не удалось отменить роль.',
            ], 500);
        }
    }

}

