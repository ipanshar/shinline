<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RbacController extends Controller
{
    /**
     * Получить все данные для RBAC панели
     */
    public function index()
    {
        $roles = Role::with('permissions')->orderBy('level', 'desc')->get();
        $permissions = Permission::orderBy('group')->orderBy('name')->get();
        $permissionGroups = Permission::select('group')->distinct()->pluck('group');

        return response()->json([
            'roles' => $roles,
            'permissions' => $permissions,
            'permissionGroups' => $permissionGroups,
        ]);
    }

    /**
     * Получить пользователей с пагинацией и фильтрами
     */
    public function getUsers(Request $request)
    {
        $query = User::with('roles');

        // Поиск
        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%")
                  ->orWhere('login', 'like', "%{$search}%");
            });
        }

        // Фильтр по роли
        if ($request->filled('role_id')) {
            $roleId = $request->role_id;
            $query->whereHas('roles', function ($q) use ($roleId) {
                $q->where('roles.id', $roleId);
            });
        }

        // Фильтр "без роли"
        if ($request->boolean('no_role')) {
            $query->doesntHave('roles');
        }

        $perPage = $request->get('per_page', 25);
        $users = $query->orderBy('name')->paginate($perPage);

        return response()->json($users);
    }

    /**
     * Обновить роли пользователя
     */
    public function updateUserRoles(Request $request, User $user)
    {
        $request->validate([
            'role_ids' => 'array',
            'role_ids.*' => 'exists:roles,id',
        ]);

        $user->roles()->sync($request->role_ids ?? []);

        return response()->json([
            'status' => true,
            'message' => 'Роли пользователя обновлены',
            'user' => $user->load('roles'),
        ]);
    }

    /**
     * Создать новую роль
     */
    public function createRole(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255|unique:roles,name',
            'level' => 'required|integer|min:0|max:100',
            'description' => 'nullable|string|max:500',
        ]);

        $role = Role::create([
            'name' => $request->name,
            'level' => $request->level,
            'description' => $request->description,
        ]);

        return response()->json([
            'status' => true,
            'message' => 'Роль создана',
            'role' => $role->load('permissions'),
        ]);
    }

    /**
     * Обновить роль
     */
    public function updateRole(Request $request, Role $role)
    {
        $request->validate([
            'name' => 'required|string|max:255|unique:roles,name,' . $role->id,
            'level' => 'required|integer|min:0|max:100',
            'description' => 'nullable|string|max:500',
        ]);

        $role->update([
            'name' => $request->name,
            'level' => $request->level,
            'description' => $request->description,
        ]);

        return response()->json([
            'status' => true,
            'message' => 'Роль обновлена',
            'role' => $role->load('permissions'),
        ]);
    }

    /**
     * Удалить роль
     */
    public function deleteRole(Role $role)
    {
        // Защита от удаления системных ролей
        if ($role->name === 'Администратор') {
            return response()->json([
                'status' => false,
                'message' => 'Нельзя удалить роль Администратор',
            ], 403);
        }

        $role->delete();

        return response()->json([
            'status' => true,
            'message' => 'Роль удалена',
        ]);
    }

    /**
     * Обновить разрешения роли
     */
    public function updateRolePermissions(Request $request, Role $role)
    {
        $request->validate([
            'permission_ids' => 'array',
            'permission_ids.*' => 'exists:permissions,id',
        ]);

        $role->permissions()->sync($request->permission_ids ?? []);

        return response()->json([
            'status' => true,
            'message' => 'Разрешения роли обновлены',
            'role' => $role->load('permissions'),
        ]);
    }

    /**
     * Получить статистику RBAC
     */
    public function getStats()
    {
        return response()->json([
            'total_users' => User::count(),
            'users_with_roles' => DB::table('role_user')->distinct('user_id')->count('user_id'),
            'users_without_roles' => User::doesntHave('roles')->count(),
            'total_roles' => Role::count(),
            'total_permissions' => Permission::count(),
            'role_stats' => Role::withCount('users')->get(['id', 'name', 'users_count']),
        ]);
    }

    /**
     * Массовое назначение роли пользователям
     */
    public function bulkAssignRole(Request $request)
    {
        $request->validate([
            'user_ids' => 'required|array|min:1',
            'user_ids.*' => 'exists:users,id',
            'role_id' => 'required|exists:roles,id',
        ]);

        $users = User::whereIn('id', $request->user_ids)->get();
        
        foreach ($users as $user) {
            if (!$user->roles->contains($request->role_id)) {
                $user->roles()->attach($request->role_id);
            }
        }

        return response()->json([
            'status' => true,
            'message' => 'Роль назначена ' . count($request->user_ids) . ' пользователям',
        ]);
    }

    /**
     * Массовое удаление роли у пользователей
     */
    public function bulkRevokeRole(Request $request)
    {
        $request->validate([
            'user_ids' => 'required|array|min:1',
            'user_ids.*' => 'exists:users,id',
            'role_id' => 'required|exists:roles,id',
        ]);

        DB::table('role_user')
            ->whereIn('user_id', $request->user_ids)
            ->where('role_id', $request->role_id)
            ->delete();

        return response()->json([
            'status' => true,
            'message' => 'Роль удалена у ' . count($request->user_ids) . ' пользователей',
        ]);
    }
}
