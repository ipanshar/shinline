<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;

class UsersController extends Controller
{
    public function getUsersWithoutRoles()
    {
        $users = User::doesntHave('roles')  // пользователи без ролей
            ->select(['id', 'name as user_name', 'login', 'phone as user_phone'])
            ->get();

        return response()->json($users);
    }
}
